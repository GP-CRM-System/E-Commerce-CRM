import prisma from '../config/prisma.config.js';
import logger from '../utils/logger.util.js';

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

export async function processRFMSynchronously(
    organizationId: string,
    daysWindow = DAYS_WINDOW
): Promise<number> {
    logger.info(`Running RFM synchronously for org ${organizationId}`);

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
            : daysWindow;
        const { recency, frequency, monetary, score } = calcScore(
            daysSince,
            c.totalOrders,
            Number(c.totalSpent),
            daysWindow
        );
        await prisma.customer.update({
            where: { id: c.id },
            data: {
                rfmScore: score,
                rfmSegment: getSegment(score),
                rfmRecency: recency,
                rfmFrequency: frequency,
                rfmMonetary: monetary,
                churnRiskScore: calcChurn(
                    c.lastOrderAt,
                    c.avgDaysBetweenOrders
                ),
                lastScoredAt: new Date()
            }
        });
    }

    logger.info(
        `RFM done for ${organizationId}: ${customers.length} customers`
    );
    return customers.length;
}

interface RFMJobData {
    organizationId: string;
    daysWindow?: number;
}

export async function addRFMScoreJob(
    organizationId: string,
    daysWindow?: number
): Promise<void> {
    try {
        const { Queue } = await import('bullmq');
        const { redisConnection } = await import('../config/redis.config.js');

        const rfmQueue = new Queue<RFMJobData>('rfm-score-queue', {
            connection: redisConnection
        });
        await rfmQueue.add('rfm-scoring', { organizationId, daysWindow });
    } catch (e) {
        logger.warn(
            `BullMQ not available (${e instanceof Error ? e.message : String(e)}), using sync processing`
        );
        await processRFMSynchronously(organizationId, daysWindow);
    }
}
