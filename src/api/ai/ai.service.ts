/**
 * AI Orchestration Service
 *
 * Connects the AI engines (churn, segment, recommend) to the CRM database.
 * Handles data extraction, transformation, and result persistence.
 */
import prisma from '../../config/prisma.config.js';
import logger from '../../utils/logger.util.js';
import {
    predictChurn,
    isChurnModelReady,
    getChurnModelInfo
} from './churn.engine.js';
import { segmentCustomers, getSegmentDistribution } from './segment.engine.js';
import { computeRecommendations } from './recommend.engine.js';
import type {
    ChurnInput,
    ChurnResult,
    SegmentInput,
    SegmentResult,
    InteractionInput,
    AiHealthStatus
} from './ai.types.js';
import { AppError, HttpStatus, ErrorCode } from '../../utils/response.util.js';
import type { Prisma } from '../../generated/prisma/client.js';

/**
 * Compute churn predictions for all customers in an organization.
 */
export async function computeChurnForOrganization(
    organizationId: string
): Promise<{ totalCustomers: number; results: ChurnResult[] }> {
    if (!isChurnModelReady()) {
        throw new AppError(
            'Churn model not loaded. Ensure models/churn_weights.json exists.',
            HttpStatus.SERVICE_UNAVAILABLE,
            ErrorCode.SERVER_ERROR
        );
    }

    const customers = await prisma.customer.findMany({
        where: { organizationId },
        select: {
            id: true,
            isLoyaltyMember: true,
            totalOrders: true,
            totalSpent: true,
            avgOrderValue: true,
            engagementScore: true,
            satisfactionScore: true,
            browsingFrequency: true,
            lastOrderAt: true,
            lifecycleStage: true,
            metrics: {
                select: {
                    daysSinceLastPurchase: true,
                    returnRate: true
                }
            }
        }
    });

    if (customers.length === 0) {
        return { totalCustomers: 0, results: [] };
    }

    const now = new Date();
    const emailOpenRate = 0.3;
    const websiteVisitsLastMonth = 10;

    const churnInputs: ChurnInput[] = customers.map((c) => ({
        customerId: c.id,
        loyaltyMember: c.isLoyaltyMember ?? false,
        daysSinceLastPurchase: c.lastOrderAt
            ? Math.floor((now.getTime() - c.lastOrderAt.getTime()) / 86400000)
            : 999,
        browsingFrequencyPerWeek: c.browsingFrequency ?? 0,
        satisfactionScore: c.satisfactionScore ?? 5,
        totalPurchases: c.totalOrders,
        avgOrderValue: Number(c.avgOrderValue) || 0,
        websiteVisitsLastMonth,
        emailOpenRate,
        returnRate: c.metrics?.returnRate ?? 0
    }));

    const results = predictChurn(churnInputs);

    for (const result of results) {
        const customer = customers.find((c) => c.id === result.customerId);
        if (!customer) continue;

        const daysSinceLastPurchase = customer.lastOrderAt
            ? Math.floor(
                  (now.getTime() - customer.lastOrderAt.getTime()) / 86400000
              )
            : 999;

        // Upsert CustomerMetric
        await prisma.customerMetric.upsert({
            where: { customerId: result.customerId },
            create: {
                customerId: result.customerId,
                churnProbability: result.churnProbability,
                daysSinceLastPurchase,
                totalOrders: customer.totalOrders,
                avgOrderValue: customer.avgOrderValue,
                returnRate: customer.metrics?.returnRate ?? 0
            },
            update: {
                churnProbability: result.churnProbability,
                daysSinceLastPurchase,
                totalOrders: customer.totalOrders,
                avgOrderValue: customer.avgOrderValue,
                returnRate: customer.metrics?.returnRate ?? 0
            }
        });

        // Build update data for Customer
        type LifecycleStage =
            | 'PROSPECT'
            | 'LEAD'
            | 'ONE_TIME'
            | 'RETURNING'
            | 'LOYAL'
            | 'VIP'
            | 'AT_RISK'
            | 'CHURNED'
            | 'WINBACK';

        const updateData: Record<string, unknown> = {
            churnRiskScore: result.churnProbability,
            lastScoredAt: now
        };

        if (result.riskLevel === 'high') {
            const currentStage = customer.lifecycleStage;
            if (currentStage !== 'CHURNED' && currentStage !== 'AT_RISK') {
                const newStage: LifecycleStage = customer.lastOrderAt
                    ? 'AT_RISK'
                    : 'CHURNED';
                updateData.lifecycleStage = newStage;
            }
        } else if (result.riskLevel === 'stable') {
            const currentStage = customer.lifecycleStage;
            if (currentStage === 'AT_RISK' || currentStage === 'CHURNED') {
                updateData.lifecycleStage = 'RETURNING' as LifecycleStage;
            }
        }

        await prisma.customer.update({
            where: { id: result.customerId },
            data: updateData
        });
    }

    logger.info(
        `[AiService] Churn computed for ${results.length} customers in org ${organizationId}`
    );

    return { totalCustomers: results.length, results };
}

/**
 * Compute segmentation for all customers in an organization.
 */
export async function computeSegmentsForOrganization(
    organizationId: string
): Promise<{
    totalCustomers: number;
    distribution: {
        segment: number;
        name: string;
        count: number;
        percentage: number;
    }[];
    results: SegmentResult[];
}> {
    const customers = await prisma.customer.findMany({
        where: { organizationId },
        select: {
            id: true,
            totalOrders: true,
            totalSpent: true,
            avgOrderValue: true,
            engagementScore: true,
            satisfactionScore: true,
            browsingFrequency: true,
            cartAbandonmentRate: true,
            lastOrderAt: true,
            isLoyaltyMember: true
        }
    });

    if (customers.length === 0) {
        return { totalCustomers: 0, distribution: [], results: [] };
    }

    const now = new Date();

    const segmentInputs: SegmentInput[] = customers.map((c) => ({
        customerId: c.id,
        age: 30,
        gender: 'unknown',
        annualIncome: Number(c.totalSpent) * 2,
        spendingScore: c.engagementScore ?? 50,
        totalPurchases: c.totalOrders,
        avgOrderValue: Number(c.avgOrderValue) || 0,
        websiteVisitsLastMonth: 10,
        daysSinceLastPurchase: c.lastOrderAt
            ? Math.floor((now.getTime() - c.lastOrderAt.getTime()) / 86400000)
            : 30,
        emailOpenRate: 0.3,
        subscriptionTier: c.isLoyaltyMember ? 'premium' : 'free',
        region: 'unknown',
        preferredCategory: 'general',
        returnRate: c.cartAbandonmentRate ?? 0,
        loyaltyPoints: c.totalOrders * 10
    }));

    const results = segmentCustomers(segmentInputs);
    const distribution = getSegmentDistribution(results);

    logger.info(
        `[AiService] Segments computed for ${results.length} customers in org ${organizationId}`
    );

    return { totalCustomers: results.length, distribution, results };
}

/**
 * Compute product recommendations based on order history.
 */
export async function computeRecommendationsForOrganization(
    organizationId: string
): Promise<{
    totalItems: number;
    totalInteractions: number;
}> {
    const orderItems = await prisma.orderItem.findMany({
        where: {
            order: { organizationId }
        },
        select: {
            productId: true,
            createdAt: true,
            order: {
                select: {
                    customerId: true
                }
            }
        }
    });

    if (orderItems.length === 0) {
        return { totalItems: 0, totalInteractions: 0 };
    }

    const interactions: InteractionInput[] = orderItems.map((oi) => ({
        userId: oi.order.customerId,
        itemId: oi.productId,
        rating: null,
        interactionType: 'purchase' as const,
        timestamp: oi.createdAt.toISOString()
    }));

    const recommendations = computeRecommendations(interactions);

    const productIds = [...new Set(orderItems.map((oi) => oi.productId))];

    for (const productId of productIds) {
        const recs = recommendations.get(productId);
        if (recs && recs.length > 0) {
            await prisma.aiRecommendation.upsert({
                where: { productId },
                create: {
                    productId,
                    recommendations: recs as unknown as Prisma.InputJsonValue,
                    computedAt: new Date()
                },
                update: {
                    recommendations: recs as unknown as Prisma.InputJsonValue,
                    computedAt: new Date()
                }
            });
        }
    }

    logger.info(
        `[AiService] Recommendations computed for ${productIds.length} products from ${interactions.length} interactions in org ${organizationId}`
    );

    return {
        totalItems: productIds.length,
        totalInteractions: interactions.length
    };
}

/**
 * Get churn results for an organization (paginated).
 */
export async function getChurnResults(
    organizationId: string,
    skip: number,
    take: number,
    riskLevel?: 'stable' | 'low' | 'high'
): Promise<{ customers: unknown[]; total: number }> {
    const where: Record<string, unknown> = { organizationId };

    if (riskLevel) {
        const modelInfo = getChurnModelInfo();
        const t = modelInfo.threshold;
        const thresholds: Record<string, Record<string, number>> = {
            stable: { lt: t },
            low: { gte: t, lt: 0.8 },
            high: { gte: 0.8 }
        };
        where.churnRiskScore = thresholds[riskLevel] ?? {};
    }

    const [customers, total] = await Promise.all([
        prisma.customer.findMany({
            where,
            select: {
                id: true,
                name: true,
                email: true,
                churnRiskScore: true,
                lifecycleStage: true,
                lastScoredAt: true,
                metrics: {
                    select: { churnProbability: true }
                }
            },
            skip,
            take,
            orderBy: { lastScoredAt: 'desc' }
        }),
        prisma.customer.count({ where })
    ]);

    return { customers, total };
}

/**
 * Get recommendations for a specific product.
 */
export async function getRecommendationsForProduct(
    productId: string
): Promise<{ productId: string; recommendations: unknown } | null> {
    const rec = await prisma.aiRecommendation.findUnique({
        where: { productId }
    });

    return rec
        ? {
              productId: rec.productId,
              recommendations: rec.recommendations
          }
        : null;
}

/**
 * Check the health status of all AI engines.
 */
export async function getAiHealth(): Promise<AiHealthStatus> {
    const churnReady = isChurnModelReady();
    const modelInfo = churnReady ? getChurnModelInfo() : null;

    return {
        churnModel: {
            available: churnReady,
            features: modelInfo?.features ?? 0
        },
        segmentation: { available: true },
        recommendations: { available: true }
    };
}
