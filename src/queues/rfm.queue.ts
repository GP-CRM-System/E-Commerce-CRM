import prisma from '../config/prisma.config.js';
import logger from '../utils/logger.util.js';
import { checkAndUpdateLifecycleStage } from '../api/customers/lifecycle.service.js';

const DAYS_WINDOW = 90;

function calcScore(
    daysSinceLastOrder: number,
    orderCount: number,
    totalSpent: number,
    window: number
): { recency: number; frequency: number; monetary: number; score: string } {
    const recency = Math.max(
        1,
        Math.min(5, Math.ceil((1 - daysSinceLastOrder / window) * 5))
    );
    const frequency = Math.max(
        1,
        Math.min(5, Math.ceil((orderCount / 20) * 5))
    );
    const monetary = Math.max(
        1,
        Math.min(5, Math.ceil((totalSpent / 5000) * 5))
    );
    return {
        recency,
        frequency,
        monetary,
        score: `${recency}${frequency}${monetary}`
    };
}

function getSegment(score: string): string {
    const r = parseInt(score[0] || '0');
    const f = parseInt(score[1] || '0');
    const m = parseInt(score[2] || '0');
    const total = r + f + m;
    if (total >= 13) return 'CHAMPIONS';
    if (r >= 4 && f >= 3) return 'LOYAL_CUSTOMERS';
    if (r >= 3 && m >= 3) return 'POTENTIAL_LOYALISTS';
    if (r <= 2 && f >= 3) return 'AT_RISK';
    if (r <= 2 && f <= 2) return 'CANT_LOSE_THEM';
    if (r >= 4 && f <= 2) return 'NEW_CUSTOMERS';
    if (total <= 4) return 'LOST';
    return 'NEEDS_ATTENTION';
}

function calcChurn(
    lastOrderAt: Date | null,
    avgDays: number | null
): number | null {
    if (!lastOrderAt) return null;
    const days = Math.floor(
        (Date.now() - lastOrderAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (!avgDays || avgDays === 0)
        return days > 60 ? 0.8 : days > 30 ? 0.5 : 0.1;
    return Math.min(1, Math.max(0, days / avgDays));
}

function getChurnRiskLevel(
    score: number | null
): 'low' | 'medium' | 'high' | null {
    if (score === null) return null;
    if (score >= 0.7) return 'high';
    if (score >= 0.4) return 'medium';
    return 'low';
}

function calculateAverages(
    totalSpent: number,
    totalOrders: number,
    firstOrderAt: Date | null,
    lastOrderAt: Date | null
): { avgOrderValue: number; avgDaysBetweenOrders: number | null } {
    const avgOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0;
    let avgDaysBetweenOrders = null;

    if (totalOrders > 1 && firstOrderAt && lastOrderAt) {
        const totalDays = Math.floor(
            (lastOrderAt.getTime() - firstOrderAt.getTime()) /
                (1000 * 60 * 60 * 24)
        );
        avgDaysBetweenOrders = totalDays / (totalOrders - 1);
    }

    return { avgOrderValue, avgDaysBetweenOrders };
}

async function calculateCustomerOrderMetrics(
    customerId: string,
    organizationId: string
): Promise<{
    totalOrders: number;
    totalSpent: number;
    firstOrderAt: Date | null;
    lastOrderAt: Date | null;
    avgOrderValue: number;
    avgDaysBetweenOrders: number | null;
}> {
    const orders = await prisma.order.findMany({
        where: { customerId, organizationId },
        orderBy: { createdAt: 'asc' },
        select: {
            createdAt: true,
            totalAmount: true
        }
    });

    const totalOrders = orders.length;
    const totalSpent = orders.reduce(
        (sum, order) => sum + Number(order.totalAmount ?? 0),
        0
    );
    const firstOrderAt = orders[0]?.createdAt ?? null;
    const lastOrderAt = orders[orders.length - 1]?.createdAt ?? null;
    const { avgOrderValue, avgDaysBetweenOrders } = calculateAverages(
        totalSpent,
        totalOrders,
        firstOrderAt,
        lastOrderAt
    );

    return {
        totalOrders,
        totalSpent,
        firstOrderAt,
        lastOrderAt,
        avgOrderValue,
        avgDaysBetweenOrders
    };
}

export async function processRFMSynchronously(
    organizationId: string,
    daysWindow = DAYS_WINDOW
): Promise<number> {
    logger.info(
        `Running optimized RFM synchronously for org ${organizationId}`
    );

    // Optimization: Use groupBy to fetch metrics for all customers at once
    const aggregatedOrders = (await (prisma.order.groupBy({
        by: ['customerId'],
        where: { organizationId },
        _count: { id: true },
        _sum: { totalAmount: true },
        _min: { createdAt: true },
        _max: { createdAt: true }
    }) as unknown)) as Array<{
        customerId: string;
        _count: { id: number };
        _sum: { totalAmount: number | null };
        _min: { createdAt: Date | null };
        _max: { createdAt: Date | null };
    }>;

    logger.info(
        `Found ${aggregatedOrders.length} customers with orders in org ${organizationId}`
    );

    const CHUNK_SIZE = 50;
    let processedCount = 0;

    for (let i = 0; i < aggregatedOrders.length; i += CHUNK_SIZE) {
        const chunk = aggregatedOrders.slice(i, i + CHUNK_SIZE);

        await Promise.all(
            chunk.map(async (agg) => {
                const customerId = agg.customerId;
                if (!customerId) return;

                const totalOrders = agg._count.id;
                const totalSpent = Number(agg._sum.totalAmount ?? 0);
                const firstOrderAt = agg._min.createdAt;
                const lastOrderAt = agg._max.createdAt;

                if (!lastOrderAt) return;

                const { avgOrderValue, avgDaysBetweenOrders } =
                    calculateAverages(
                        totalSpent,
                        totalOrders,
                        firstOrderAt,
                        lastOrderAt
                    );

                const daysSince = Math.floor(
                    (Date.now() - new Date(lastOrderAt).getTime()) /
                        (1000 * 60 * 60 * 24)
                );

                const { recency, frequency, monetary, score } = calcScore(
                    daysSince,
                    totalOrders,
                    totalSpent,
                    daysWindow
                );

                const churnScore = calcChurn(lastOrderAt, avgDaysBetweenOrders);
                const riskLevel = getChurnRiskLevel(churnScore);

                const updated = await prisma.customer.updateMany({
                    where: { id: customerId },
                    data: {
                        totalOrders,
                        totalSpent,
                        firstOrderAt,
                        lastOrderAt,
                        avgOrderValue,
                        avgDaysBetweenOrders,
                        rfmScore: score,
                        rfmSegment: getSegment(score),
                        rfmRecency: recency,
                        rfmFrequency: frequency,
                        rfmMonetary: monetary,
                        churnRiskScore: churnScore,
                        lastScoredAt: new Date()
                    }
                });

                if (updated.count === 0) {
                    return; // Skip if customer was deleted
                }

                if (riskLevel === 'high') {
                    const customer = await prisma.customer.findUnique({
                        where: { id: customerId },
                        select: { name: true }
                    });

                    if (customer) {
                        const { createChurnAlertNotification } =
                            await import('../api/notifications/notification.service.js');
                        await createChurnAlertNotification({
                            organizationId,
                            customerId,
                            customerName: customer.name,
                            riskLevel: 'high'
                        });

                        const members = await prisma.member.findMany({
                            where: {
                                organizationId,
                                role: { in: ['admin', 'root'] }
                            },
                            include: { user: { select: { email: true } } }
                        });

                        const { sendNotificationEmail } =
                            await import('../utils/email.util.js');
                        const { env } = await import('../config/env.config.js');

                        for (const member of members) {
                            if (member.user.email) {
                                await sendNotificationEmail({
                                    to: member.user.email,
                                    data: {
                                        type: 'churn_alert',
                                        title: 'High Churn Risk Alert',
                                        message: `Customer ${customer.name} is at high risk of churning.`,
                                        actionUrl: `${env.appUrl}/customers/${customerId}`
                                    }
                                });
                            }
                        }
                    }
                }

                await checkAndUpdateLifecycleStage(customerId, organizationId);
            })
        );

        processedCount += chunk.length;
        logger.info(
            `Processed ${processedCount}/${aggregatedOrders.length} customers`
        );
    }

    return aggregatedOrders.length;
}

interface RFMJobData {
    organizationId: string;
    customerId?: string;
    daysWindow?: number;
}

export async function addRFMScoreJob(
    organizationId: string,
    daysWindow?: number,
    customerId?: string
): Promise<void> {
    try {
        const { Queue } = await import('bullmq');
        const { redisConnection } = await import('../config/redis.config.js');

        const rfmQueue = new Queue<RFMJobData>('rfm-score-queue', {
            connection: redisConnection
        });
        await rfmQueue.add('rfm-scoring', {
            organizationId,
            daysWindow,
            customerId
        });
    } catch (e) {
        logger.warn(
            `BullMQ not available (${e instanceof Error ? e.message : String(e)}), using sync processing`
        );
        if (customerId) {
            await processSingleCustomerRFM(customerId, organizationId);
        } else {
            await processRFMSynchronously(organizationId, daysWindow);
        }
    }
}

export async function processSingleCustomerRFM(
    customerId: string,
    organizationId: string
): Promise<void> {
    const customer = await prisma.customer.findFirst({
        where: { id: customerId, organizationId },
        select: {
            id: true,
            lifecycleStage: true
        }
    });

    if (!customer) {
        logger.warn(`Customer ${customerId} not found for RFM processing`);
        return;
    }

    const metrics = await calculateCustomerOrderMetrics(
        customerId,
        organizationId
    );

    if (!metrics.lastOrderAt) {
        await prisma.customer.updateMany({
            where: { id: customerId },
            data: {
                totalOrders: 0,
                totalSpent: 0,
                firstOrderAt: null,
                lastOrderAt: null,
                avgOrderValue: 0,
                avgDaysBetweenOrders: null,
                rfmScore: null,
                rfmSegment: null,
                rfmRecency: null,
                rfmFrequency: null,
                rfmMonetary: null,
                churnRiskScore: null,
                lastScoredAt: new Date()
            }
        });
        return;
    }

    const daysSince = Math.floor(
        (Date.now() - metrics.lastOrderAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    const { recency, frequency, monetary, score } = calcScore(
        daysSince,
        metrics.totalOrders,
        metrics.totalSpent,
        DAYS_WINDOW
    );

    const churnScore = calcChurn(
        metrics.lastOrderAt,
        metrics.avgDaysBetweenOrders
    );
    const riskLevel = getChurnRiskLevel(churnScore);

    // Merge all updates into a single database trip
    const updated = await prisma.customer.updateMany({
        where: { id: customerId },
        data: {
            totalOrders: metrics.totalOrders,
            totalSpent: metrics.totalSpent,
            firstOrderAt: metrics.firstOrderAt,
            lastOrderAt: metrics.lastOrderAt,
            avgOrderValue: metrics.avgOrderValue,
            avgDaysBetweenOrders: metrics.avgDaysBetweenOrders,
            rfmScore: score,
            rfmSegment: getSegment(score),
            rfmRecency: recency,
            rfmFrequency: frequency,
            rfmMonetary: monetary,
            churnRiskScore: churnScore,
            lastScoredAt: new Date()
        }
    });

    if (updated.count === 0) {
        logger.warn(`Customer ${customerId} not found during update (possibly deleted)`);
        return;
    }

    if (riskLevel === 'high') {
        const customer = await prisma.customer.findUnique({
            where: { id: customerId },
            select: { name: true }
        });

        if (customer) {
            const { createChurnAlertNotification } =
                await import('../api/notifications/notification.service.js');
            await createChurnAlertNotification({
                organizationId,
                customerId,
                customerName: customer.name,
                riskLevel: 'high'
            });
        }
    }

    await checkAndUpdateLifecycleStage(customerId, organizationId, {
        allowWinback: customer.lifecycleStage === 'CHURNED'
    });

    logger.info(
        `RFM updated for customer ${customerId}: score=${score}, segment=${getSegment(score)}`
    );
}
