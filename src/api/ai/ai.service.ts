import prisma from '../../config/prisma.config.js';
import logger from '../../utils/logger.util.js';
import { callHfApi } from './hf.client.js';
import { buildCustomerCsv, buildInteractionCsv } from './csv.builder.js';
import type {
    CsvCustomerRow,
    CsvInteractionRow,
    HfApiResponse,
    HfChurnResult,
    HfSegmentResult
} from './hf.types.js';
import type { AiHealthStatus } from './ai.types.js';
import { AppError, HttpStatus, ErrorCode } from '../../utils/response.util.js';
import type { Prisma } from '../../generated/prisma/client.js';

function toCustomerRow(
    c: {
        id: string;
        age: number | null;
        gender: string | null;
        annualIncome: number | null;
        region: string | null;
        preferredCategory: string | null;
        subscriptionTier: string;
        loyaltyPoints: number;
        emailOpenRate: number | null;
        websiteVisitsLastMonth: number | null;
        spendingScore: number | null;
        totalOrders: number;
        avgOrderValue: unknown;
        lastOrderAt: Date | null;
        browsingFrequency: number | null;
        satisfactionScore: number | null;
        engagementScore: number | null;
        cartAbandonmentRate: number | null;
        supportTicketsCount: number;
        priceSensitivityIndex: number | null;
        totalSpent: unknown;
        totalRefunded: unknown;
        lastSentimentScore: number | null;
        accountAgeMonths: number;
        isLoyaltyMember: boolean;
        avgDaysBetweenOrders: number | null;
        rfmRecency: number | null;
        rfmFrequency: number | null;
        rfmMonetary: number | null;
        lifecycleStage: string;
        churnRiskScore: number | null;
        metrics: {
            daysSinceLastPurchase: number | null;
            returnRate: number | null;
        } | null;
    },
    now: Date
): CsvCustomerRow {
    return {
        customerId: c.id,
        age: c.age ?? 30,
        gender: c.gender ?? 'unknown',
        annualIncome: c.annualIncome ?? Number(c.totalSpent ?? 0) * 2,
        region: c.region ?? 'unknown',
        preferredCategory: c.preferredCategory ?? 'general',
        subscriptionTier: c.subscriptionTier,
        loyaltyPoints: c.loyaltyPoints,
        emailOpenRate: c.emailOpenRate ?? 0.3,
        websiteVisitsLastMonth: c.websiteVisitsLastMonth ?? 10,
        spendingScore: c.spendingScore ?? c.engagementScore ?? 50,
        totalPurchases: c.totalOrders,
        avgOrderValue: Number(c.avgOrderValue ?? 0),
        daysSinceLastPurchase: c.lastOrderAt
            ? Math.floor((now.getTime() - c.lastOrderAt.getTime()) / 86400000)
            : 999,
        browsingFrequencyPerWeek: c.browsingFrequency ?? 0,
        satisfactionScore: c.satisfactionScore ?? 5,
        returnRate: c.metrics?.returnRate ?? 0,
        engagementScore: c.engagementScore ?? 50,
        cartAbandonmentRate: c.cartAbandonmentRate ?? 0,
        supportTicketsCount: c.supportTicketsCount,
        priceSensitivityIndex: c.priceSensitivityIndex ?? 0.5,
        totalSpent: Number(c.totalSpent ?? 0),
        totalRefunded: Number(c.totalRefunded ?? 0),
        lastSentimentScore: c.lastSentimentScore ?? 0,
        accountAgeMonths: c.accountAgeMonths,
        isLoyaltyMember: c.isLoyaltyMember,
        avgDaysBetweenOrders: c.avgDaysBetweenOrders ?? 0,
        rfmRecency: c.rfmRecency ?? 3,
        rfmFrequency: c.rfmFrequency ?? 3,
        rfmMonetary: c.rfmMonetary ?? 3,
        lifecycleStage: c.lifecycleStage,
        churnRiskScore: c.churnRiskScore ?? 0
    };
}

function toInteractionRows(
    interactions: {
        customerId: string;
        productId: string;
        rating: number | null;
        interactionType: string;
        createdAt: Date;
    }[]
): CsvInteractionRow[] {
    return interactions.map((i) => ({
        userId: i.customerId,
        itemId: i.productId,
        rating: i.rating,
        interactionType: i.interactionType,
        timestamp: i.createdAt.toISOString()
    }));
}

async function buildAndCallHf(organizationId: string): Promise<HfApiResponse> {
    const now = new Date();

    const customers = await prisma.customer.findMany({
        where: { organizationId },
        select: {
            id: true,
            age: true,
            gender: true,
            annualIncome: true,
            region: true,
            preferredCategory: true,
            subscriptionTier: true,
            loyaltyPoints: true,
            emailOpenRate: true,
            websiteVisitsLastMonth: true,
            spendingScore: true,
            totalOrders: true,
            avgOrderValue: true,
            lastOrderAt: true,
            browsingFrequency: true,
            satisfactionScore: true,
            engagementScore: true,
            cartAbandonmentRate: true,
            supportTicketsCount: true,
            priceSensitivityIndex: true,
            totalSpent: true,
            totalRefunded: true,
            lastSentimentScore: true,
            accountAgeMonths: true,
            isLoyaltyMember: true,
            avgDaysBetweenOrders: true,
            rfmRecency: true,
            rfmFrequency: true,
            rfmMonetary: true,
            lifecycleStage: true,
            churnRiskScore: true,
            metrics: {
                select: {
                    daysSinceLastPurchase: true,
                    returnRate: true
                }
            }
        }
    });

    if (customers.length === 0) {
        throw new AppError(
            'No customers found in this organization',
            HttpStatus.BAD_REQUEST,
            ErrorCode.VALIDATION_ERROR
        );
    }

    const trackedInteractions =
        await prisma.customerProductInteraction.findMany({
            where: { organizationId },
            select: {
                customerId: true,
                productId: true,
                rating: true,
                interactionType: true,
                createdAt: true
            }
        });

    const orderInteractions = await prisma.orderItem.findMany({
        where: { order: { organizationId } },
        select: {
            productId: true,
            createdAt: true,
            order: {
                select: { customerId: true }
            }
        }
    });

    const customerRows = customers.map((c) => toCustomerRow(c, now));

    const purchaseRows: CsvInteractionRow[] = orderInteractions.map((oi) => ({
        userId: oi.order.customerId,
        itemId: oi.productId,
        rating: null,
        interactionType: 'purchase',
        timestamp: oi.createdAt.toISOString()
    }));

    const uiRows = toInteractionRows(trackedInteractions);
    const allInteractions = [...purchaseRows, ...uiRows];

    const customerCsv = buildCustomerCsv(customerRows);
    const interactionCsv = buildInteractionCsv(allInteractions);

    logger.info(
        `[AiService] Calling HF API with ${customerRows.length} customers and ${allInteractions.length} interactions for org ${organizationId}`
    );

    return callHfApi(customerCsv, interactionCsv, organizationId);
}

export async function computeChurnForOrganization(
    organizationId: string
): Promise<{ totalCustomers: number; results: HfChurnResult[] }> {
    const hfResult = await buildAndCallHf(organizationId);

    const results = hfResult.churn_results;

    for (const r of results) {
        const daysSinceLastPurchase = 999;
        const totalOrders = 0;

        await prisma.customerMetric.upsert({
            where: { customerId: r.customer_id },
            create: {
                customerId: r.customer_id,
                churnProbability: r.churn_probability,
                daysSinceLastPurchase,
                totalOrders,
                avgOrderValue: 0,
                returnRate: 0
            },
            update: {
                churnProbability: r.churn_probability,
                daysSinceLastPurchase,
                totalOrders,
                avgOrderValue: 0,
                returnRate: 0
            }
        });

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
            churnRiskScore: r.churn_probability,
            lastScoredAt: new Date()
        };

        if (r.risk_level === 'high') {
            updateData.lifecycleStage = 'AT_RISK' as LifecycleStage;
        } else if (r.risk_level === 'stable') {
            updateData.lifecycleStage = 'RETURNING' as LifecycleStage;
        }

        await prisma.customer.update({
            where: { id: r.customer_id },
            data: updateData
        });
    }

    logger.info(
        `[AiService] Churn computed for ${results.length} customers in org ${organizationId}`
    );

    return { totalCustomers: results.length, results };
}

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
    results: HfSegmentResult[];
}> {
    const hfResult = await buildAndCallHf(organizationId);
    const results = hfResult.segmentation_results;

    const group = new Map<number, { name: string; count: number }>();
    for (const r of results) {
        const existing = group.get(r.segment);
        if (existing) {
            existing.count++;
        } else {
            group.set(r.segment, { name: r.segment_name, count: 1 });
        }
    }

    const total = results.length;
    const distribution = Array.from(group.entries())
        .map(([segment, { name, count }]) => ({
            segment,
            name,
            count,
            percentage: Number(((count / total) * 100).toFixed(2))
        }))
        .sort((a, b) => a.segment - b.segment);

    logger.info(
        `[AiService] Segments computed for ${results.length} customers in org ${organizationId}`
    );

    return { totalCustomers: total, distribution, results };
}

export async function computeRecommendationsForOrganization(
    organizationId: string
): Promise<{
    totalItems: number;
    totalInteractions: number;
}> {
    const hfResult = await buildAndCallHf(organizationId);
    const recommendations = hfResult.ibcf_recommendations;

    for (const rec of recommendations) {
        await prisma.aiRecommendation.upsert({
            where: { productId: rec.product_id },
            create: {
                productId: rec.product_id,
                recommendations:
                    rec.recommendations as unknown as Prisma.InputJsonValue,
                computedAt: new Date()
            },
            update: {
                recommendations:
                    rec.recommendations as unknown as Prisma.InputJsonValue,
                computedAt: new Date()
            }
        });
    }

    logger.info(
        `[AiService] Recommendations computed for ${recommendations.length} products in org ${organizationId}`
    );

    return {
        totalItems: recommendations.length,
        totalInteractions: 0
    };
}

export async function getChurnResults(
    organizationId: string,
    skip: number,
    take: number,
    riskLevel?: 'stable' | 'low' | 'high'
): Promise<{ customers: unknown[]; total: number }> {
    const where: Record<string, unknown> = { organizationId };

    if (riskLevel) {
        const thresholds: Record<string, Record<string, number>> = {
            stable: { lt: 0.3 },
            low: { gte: 0.3, lt: 0.8 },
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

export async function getAiHealth(): Promise<AiHealthStatus> {
    try {
        const minimalCsv = 'customerId,age,gender\nplaceholder,30,male\n';
        const emptyInteractionCsv =
            'userId,itemId,rating,interactionType,timestamp\n';
        await callHfApi(minimalCsv, emptyInteractionCsv, 'health-check');

        return {
            churnModel: { available: true, features: 32 },
            segmentation: { available: true },
            recommendations: { available: true }
        };
    } catch {
        return {
            churnModel: { available: false, features: 0 },
            segmentation: { available: false },
            recommendations: { available: false }
        };
    }
}
