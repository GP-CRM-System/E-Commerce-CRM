import prisma from '../../config/prisma.config.js';
import logger from '../../utils/logger.util.js';

export async function computeRFM(
    organizationId: string,
    daysWindow?: number
): Promise<{ processed: number; message: string }> {
    const DAYS_WINDOW = 90;
    const days = daysWindow || DAYS_WINDOW;

    logger.info(`Running RFM for org ${organizationId}`);

    const customers = await prisma.customer.findMany({
        where: { organizationId, lastOrderAt: { not: null } },
        select: {
            id: true,
            lastOrderAt: true,
            totalOrders: true,
            totalSpent: true,
            avgDaysBetweenOrders: true
        }
    });

    for (const c of customers) {
        const daysSince = c.lastOrderAt
            ? Math.floor(
                  (Date.now() - c.lastOrderAt.getTime()) / (1000 * 60 * 60 * 24)
              )
            : days;

        const recency = Math.max(
            1,
            Math.min(5, Math.ceil((1 - daysSince / days) * 5))
        );
        const frequency = Math.max(
            1,
            Math.min(5, Math.ceil((c.totalOrders / 20) * 5))
        );
        const monetary = Math.max(
            1,
            Math.min(5, Math.ceil((Number(c.totalSpent) / 5000) * 5))
        );
        const score = `${recency}${frequency}${monetary}`;

        let segment = 'NEEDS_ATTENTION';
        const total = recency + frequency + monetary;
        if (total >= 13) segment = 'CHAMPIONS';
        else if (recency >= 4 && frequency >= 3) segment = 'LOYAL_CUSTOMERS';
        else if (recency >= 3 && monetary >= 3) segment = 'POTENTIAL_LOYALISTS';
        else if (recency <= 2 && frequency >= 3) segment = 'AT_RISK';
        else if (recency <= 2 && frequency <= 2) segment = 'CANT_LOSE_THEM';
        else if (recency >= 4 && frequency <= 2) segment = 'NEW_CUSTOMERS';
        else if (total <= 4) segment = 'LOST';

        let churnRisk: number | null = null;
        if (c.lastOrderAt) {
            const d = Math.floor(
                (Date.now() - c.lastOrderAt.getTime()) / (1000 * 60 * 60 * 24)
            );
            if (!c.avgDaysBetweenOrders || c.avgDaysBetweenOrders === 0) {
                churnRisk = d > 60 ? 0.8 : d > 30 ? 0.5 : 0.1;
            } else {
                churnRisk = Math.min(
                    1,
                    Math.max(0, d / c.avgDaysBetweenOrders)
                );
            }
        }

        await prisma.customer.update({
            where: { id: c.id },
            data: {
                rfmScore: score,
                rfmSegment: segment,
                rfmRecency: recency,
                rfmFrequency: frequency,
                rfmMonetary: monetary,
                churnRiskScore: churnRisk,
                lastScoredAt: new Date()
            }
        });
    }

    logger.info(
        `RFM done for ${organizationId}: ${customers.length} customers`
    );
    return {
        processed: customers.length,
        message: 'RFM computed successfully'
    };
}

export async function getRFMDistribution(organizationId: string) {
    const distribution = await prisma.customer.groupBy({
        by: ['rfmSegment'],
        where: { organizationId, rfmSegment: { not: null } },
        _count: { id: true }
    });

    const total = await prisma.customer.count({
        where: { organizationId, rfmSegment: { not: null } }
    });

    return {
        distribution: distribution.map((d) => ({
            segment: d.rfmSegment,
            count: d._count.id,
            percentage: total > 0 ? Math.round((d._count.id / total) * 100) : 0
        })),
        total,
        lastUpdated: new Date()
    };
}

export async function getCustomerAnalytics(
    customerId: string,
    organizationId: string
) {
    const customer = await prisma.customer.findFirst({
        where: { id: customerId, organizationId },
        select: {
            id: true,
            name: true,
            email: true,
            rfmScore: true,
            rfmSegment: true,
            rfmRecency: true,
            rfmFrequency: true,
            rfmMonetary: true,
            churnRiskScore: true,
            lastScoredAt: true,
            lastOrderAt: true,
            totalOrders: true,
            totalSpent: true,
            avgOrderValue: true,
            lifecycleStage: true
        }
    });

    if (!customer) return null;

    let churnRiskLevel = 'LOW';
    if (
        customer.churnRiskScore !== null &&
        customer.churnRiskScore !== undefined
    ) {
        if (customer.churnRiskScore >= 0.7) churnRiskLevel = 'HIGH';
        else if (customer.churnRiskScore >= 0.4) churnRiskLevel = 'MEDIUM';
    }

    return {
        customer: {
            id: customer.id,
            name: customer.name,
            email: customer.email
        },
        rfm: {
            score: customer.rfmScore,
            segment: customer.rfmSegment,
            recency: customer.rfmRecency,
            frequency: customer.rfmFrequency,
            monetary: customer.rfmMonetary
        },
        churnRisk: {
            score: customer.churnRiskScore,
            level: churnRiskLevel
        },
        metrics: {
            totalOrders: customer.totalOrders,
            totalSpent: customer.totalSpent,
            avgOrderValue: customer.avgOrderValue,
            lastOrderAt: customer.lastOrderAt
        },
        lifecycle: customer.lifecycleStage,
        lastScoredAt: customer.lastScoredAt
    };
}
