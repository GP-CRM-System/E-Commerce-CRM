import prisma from '../../config/prisma.config.js';
import { env } from '../../config/env.config.js';
import logger from '../../utils/logger.util.js';
import { callHfApi } from './hf.client.js';
import { buildMasterCsv, buildCatalogCsv } from './csv.builder.js';
import type { MasterCsvRow, CatalogCsvRow, HfApiResponse } from './hf.types.js';
import type { AiHealthStatus, ChurnResult, SegmentResult } from './ai.types.js';
import { AppError, HttpStatus, ErrorCode } from '../../utils/response.util.js';
import type { Prisma } from '../../generated/prisma/client.js';

function deriveAgeGroup(age: number | null): string {
    if (age === null || age === undefined) return 'unknown';
    if (age < 18) return 'Under 18';
    if (age < 25) return '18-24';
    if (age < 35) return '25-34';
    if (age < 45) return '35-44';
    if (age < 55) return '45-54';
    if (age < 65) return '55-64';
    return '65+';
}

function deriveTimeOfDay(): string {
    const hour = new Date().getHours();
    if (hour < 6) return 'night';
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    return 'evening';
}

function toMasterCsvData(
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
        city: string | null;
        metrics: {
            daysSinceLastPurchase: number | null;
            returnRate: number | null;
        } | null;
    },
    now: Date
): Omit<
    MasterCsvRow,
    | 'item_id'
    | 'item_category'
    | 'price'
    | 'brand'
    | 'tags'
    | 'rating'
    | 'interaction_type'
    | 'timestamp'
    | 'device'
    | 'session_id'
    | 'time_of_day'
> {
    return {
        customer_id: c.id,
        age: c.age ?? 30,
        gender: c.gender ?? 'unknown',
        annual_income: c.annualIncome ?? Number(c.totalSpent ?? 0) * 2,
        spending_score: c.spendingScore ?? c.engagementScore ?? 50,
        total_purchases: c.totalOrders,
        avg_order_value: Number(c.avgOrderValue ?? 0),
        website_visits_last_month: c.websiteVisitsLastMonth ?? 10,
        days_since_last_purchase: c.lastOrderAt
            ? Math.floor((now.getTime() - c.lastOrderAt.getTime()) / 86400000)
            : 999,
        email_open_rate: c.emailOpenRate ?? 0.3,
        subscription_tier: c.subscriptionTier,
        region: c.region ?? 'unknown',
        preferred_category: c.preferredCategory ?? 'general',
        return_rate: c.cartAbandonmentRate ?? 0,
        loyalty_points: c.loyaltyPoints,
        loyalty_member: c.isLoyaltyMember ? 'Yes' : 'No',
        browsing_frequency_per_week: c.browsingFrequency ?? 0,
        satisfaction_score: c.satisfactionScore ?? 5,
        engagement_score: c.engagementScore ?? 50,
        age_group: deriveAgeGroup(c.age),
        location: c.city ?? 'unknown'
    };
}

function buildMasterRowFromInteraction(
    interaction: {
        customerId: string;
        productId: string;
        rating: number | null;
        interactionType: string;
        createdAt: Date;
        device: string | null;
        sessionId: string | null;
    },
    customerData: Omit<
        MasterCsvRow,
        | 'item_id'
        | 'item_category'
        | 'price'
        | 'brand'
        | 'tags'
        | 'rating'
        | 'interaction_type'
        | 'timestamp'
        | 'device'
        | 'session_id'
        | 'time_of_day'
    >,
    product: { category: string | null; price: unknown } | null
): MasterCsvRow {
    return {
        ...customerData,
        item_id: interaction.productId,
        item_category: product?.category ?? 'general',
        price: Number(product?.price ?? 0),
        brand: 'unknown',
        tags: '',
        rating: interaction.rating ?? '',
        interaction_type: interaction.interactionType,
        timestamp: interaction.createdAt.toISOString(),
        device: interaction.device ?? 'desktop',
        session_id: interaction.sessionId ?? '',
        time_of_day: deriveTimeOfDay()
    };
}

function buildMasterRowFromOrder(
    orderItem: {
        productId: string;
        createdAt: Date;
        order: { customerId: string };
        price: unknown;
    },
    customerData: Omit<
        MasterCsvRow,
        | 'item_id'
        | 'item_category'
        | 'price'
        | 'brand'
        | 'tags'
        | 'rating'
        | 'interaction_type'
        | 'timestamp'
        | 'device'
        | 'session_id'
        | 'time_of_day'
    >,
    product: { category: string | null } | null
): MasterCsvRow {
    return {
        ...customerData,
        item_id: orderItem.productId,
        item_category: product?.category ?? 'general',
        price: Number(orderItem.price ?? 0),
        brand: 'unknown',
        tags: '',
        rating: '',
        interaction_type: 'purchase',
        timestamp: orderItem.createdAt.toISOString(),
        device: 'desktop',
        session_id: '',
        time_of_day: deriveTimeOfDay()
    };
}

function buildCatalogRow(product: {
    id: string;
    category: string | null;
    price: unknown;
}): CatalogCsvRow {
    return {
        item_id: product.id,
        item_category: product.category ?? 'general',
        brand: 'unknown',
        price: Number(product.price ?? 0),
        tags: ''
    };
}

function getRiskLevel(churnProbability: number): 'stable' | 'low' | 'high' {
    if (churnProbability >= 0.7) return 'high';
    if (churnProbability >= 0.3) return 'low';
    return 'stable';
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
            city: true,
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

    const customerDataMap = new Map(
        customers.map((c) => [c.id, toMasterCsvData(c, now)])
    );

    const products = await prisma.product.findMany({
        where: { organizationId },
        select: {
            id: true,
            category: true,
            price: true
        }
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const trackedInteractions =
        await prisma.customerProductInteraction.findMany({
            where: { organizationId },
            select: {
                customerId: true,
                productId: true,
                rating: true,
                interactionType: true,
                createdAt: true,
                device: true,
                sessionId: true
            }
        });

    const orderItems = await prisma.orderItem.findMany({
        where: { order: { organizationId } },
        select: {
            productId: true,
            price: true,
            createdAt: true,
            order: {
                select: { customerId: true }
            }
        }
    });

    const masterRows: MasterCsvRow[] = [];

    for (const interaction of trackedInteractions) {
        const customerData = customerDataMap.get(interaction.customerId);
        if (!customerData) continue;
        const product = productMap.get(interaction.productId) ?? null;
        masterRows.push(
            buildMasterRowFromInteraction(interaction, customerData, product)
        );
    }

    for (const item of orderItems) {
        const customerData = customerDataMap.get(item.order.customerId);
        if (!customerData) continue;
        const product = productMap.get(item.productId) ?? null;
        masterRows.push(buildMasterRowFromOrder(item, customerData, product));
    }

    if (masterRows.length === 0) {
        for (const [, customerData] of customerDataMap) {
            masterRows.push({
                ...customerData,
                item_id: '',
                item_category: 'general',
                price: 0,
                brand: 'unknown',
                tags: '',
                rating: '',
                interaction_type: 'purchase',
                timestamp: now.toISOString(),
                device: 'desktop',
                session_id: '',
                time_of_day: deriveTimeOfDay()
            });
        }
    }

    const catalogRows = products.map(buildCatalogRow);

    const masterCsv = buildMasterCsv(masterRows);
    const catalogCsv = buildCatalogCsv(catalogRows);

    logger.info(
        `[AiService] Calling HF API with ${customerDataMap.size} customers, ${masterRows.length} events, ${catalogRows.length} products for org ${organizationId}`
    );

    return callHfApi(masterCsv, catalogCsv, organizationId);
}

export async function computeChurnForOrganization(
    organizationId: string
): Promise<{ totalCustomers: number; results: ChurnResult[] }> {
    const hfResult = await buildAndCallHf(organizationId);

    const results = hfResult.churn_results;

    for (const r of results) {
        const customerId = r.Customer_ID;
        const churnProbability = r.Churn_Probability;
        const riskLevel = getRiskLevel(churnProbability);

        const daysSinceLastPurchase = 999;
        const totalOrders = 0;

        await prisma.customerMetric.upsert({
            where: { customerId },
            create: {
                customerId,
                churnProbability,
                daysSinceLastPurchase,
                totalOrders,
                avgOrderValue: 0,
                returnRate: 0
            },
            update: {
                churnProbability,
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
            churnRiskScore: churnProbability,
            lastScoredAt: new Date()
        };

        if (riskLevel === 'high') {
            updateData.lifecycleStage = 'AT_RISK' as LifecycleStage;
        } else if (riskLevel === 'stable') {
            updateData.lifecycleStage = 'RETURNING' as LifecycleStage;
        }

        await prisma.customer.update({
            where: { id: customerId },
            data: updateData
        });
    }

    logger.info(
        `[AiService] Churn computed for ${results.length} customers in org ${organizationId}`
    );

    return {
        totalCustomers: results.length,
        results: results.map((r) => ({
            customer_id: r.Customer_ID,
            churn_probability: r.Churn_Probability,
            risk_level: getRiskLevel(r.Churn_Probability)
        }))
    };
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
    results: SegmentResult[];
}> {
    const hfResult = await buildAndCallHf(organizationId);
    const results = hfResult.segmentation_results;

    const group = new Map<number, { name: string; count: number }>();
    for (const r of results) {
        const existing = group.get(r.Segment);
        if (existing) {
            existing.count++;
        } else {
            group.set(r.Segment, {
                name:
                    ['Browsers', 'Bargain/Casual', 'Premium Loyal'][
                        r.Segment
                    ] ?? `Segment ${r.Segment}`,
                count: 1
            });
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

    return {
        totalCustomers: total,
        distribution,
        results: results.map((r) => ({
            customer_id: r.Customer_ID,
            segment: r.Segment,
            segment_name:
                ['Browsers', 'Bargain/Casual', 'Premium Loyal'][r.Segment] ??
                `Segment ${r.Segment}`,
            distances: [0, 0, 0] as [number, number, number]
        }))
    };
}

export async function computeRecommendationsForOrganization(
    organizationId: string
): Promise<{
    totalItems: number;
    totalInteractions: number;
}> {
    const hfResult = await buildAndCallHf(organizationId);
    const recommendations = hfResult.ibcf_recommendations;

    for (const [productId, recs] of Object.entries(recommendations)) {
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

    logger.info(
        `[AiService] Recommendations computed for ${Object.keys(recommendations).length} products in org ${organizationId}`
    );

    return {
        totalItems: Object.keys(recommendations).length,
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

export async function getOrderStatus(orderId: string) {
    try {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: {
                paymentStatus: true,
                fulfillmentStatus: true,
                shippingStatus: true
            }
        });

        return order;
    } catch (err) {
        logger.error(err);
    }
}

export async function getAiHealth(): Promise<AiHealthStatus> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(env.hfApiUrl, {
            method: 'POST',
            headers: { Authorization: `Bearer ${env.hfApiToken}` },
            body: new FormData(),
            signal: controller.signal
        });
        clearTimeout(timeout);
        const available = response.status !== 404 && response.status !== 502;

        return {
            churnModel: { available, features: available ? 32 : 0 },
            segmentation: { available },
            recommendations: { available }
        };
    } catch {
        return {
            churnModel: { available: false, features: 0 },
            segmentation: { available: false },
            recommendations: { available: false }
        };
    }
}
