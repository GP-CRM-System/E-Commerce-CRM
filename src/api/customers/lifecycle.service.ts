import prisma from '../../config/prisma.config.js';
import logger from '../../utils/logger.util.js';
import type { CustomerLifecycleStage } from '../../generated/prisma/client.js';

export const LIFECYCLE_RULES = {
    ONE_TIME_THRESHOLD: 1,
    RETURNING_THRESHOLD: 2,
    LOYAL_THRESHOLD: 5,
    VIP_PERCENTILE: 0.05,
    AT_RISK_THRESHOLD: 0.7,
    CHURN_MULTIPLIER: 2
} as const;

export interface LifecycleTransitionResult {
    customerId: string;
    previousStage: CustomerLifecycleStage;
    newStage: CustomerLifecycleStage;
    triggered: boolean;
    reason: string;
}

interface LifecycleOptions {
    allowWinback?: boolean;
}

export async function checkAndUpdateLifecycleStage(
    customerId: string,
    organizationId: string,
    options?: LifecycleOptions
): Promise<LifecycleTransitionResult | null> {
    const customer = await prisma.customer.findFirst({
        where: { id: customerId, organizationId },
        select: {
            id: true,
            lifecycleStage: true,
            totalOrders: true,
            totalSpent: true,
            churnRiskScore: true,
            avgDaysBetweenOrders: true,
            lastOrderAt: true,
            firstOrderAt: true
        }
    });

    if (!customer) {
        logger.warn(`Customer ${customerId} not found for lifecycle check`);
        return null;
    }

    const previousStage = customer.lifecycleStage;
    const newStage = calculateNextStage(customer, options);

    if (newStage !== previousStage) {
        await prisma.customer.update({
            where: { id: customerId },
            data: { lifecycleStage: newStage }
        });

        logger.info(
            `Lifecycle transition for ${customerId}: ${previousStage} → ${newStage}`
        );

        const isAlertStage = newStage === 'AT_RISK' || newStage === 'CHURNED';

        if (isAlertStage) {
            try {
                const { createLifecycleNotification } =
                    await import('../notifications/notification.service.js');
                const customerWithName = await prisma.customer.findUnique({
                    where: { id: customerId },
                    select: { name: true }
                });

                if (customerWithName) {
                    await createLifecycleNotification({
                        organizationId,
                        customerId,
                        customerName: customerWithName.name,
                        previousStage,
                        newStage
                    });

                    if (newStage === 'CHURNED') {
                        const members = await prisma.member.findMany({
                            where: {
                                organizationId,
                                role: { in: ['admin', 'root'] }
                            },
                            include: { user: { select: { email: true } } }
                        });

                        const { sendNotificationEmail } =
                            await import('../../utils/email.util.js');
                        const { env } =
                            await import('../../config/env.config.js');

                        for (const member of members) {
                            if (member.user.email) {
                                await sendNotificationEmail({
                                    to: member.user.email,
                                    data: {
                                        type: 'lifecycle_change',
                                        title: 'Customer Churned',
                                        message: `Customer ${customerWithName.name} has churned.`,
                                        actionUrl: `${env.appUrl}/customers/${customerId}`
                                    }
                                });
                            }
                        }
                    }
                }
            } catch (error) {
                logger.error(
                    `Failed to create lifecycle notification: ${error}`
                );
            }
        }

        return {
            customerId,
            previousStage,
            newStage,
            triggered: true,
            reason: getTransitionReason(
                previousStage,
                newStage,
                customer.totalOrders
            )
        };
    }

    return {
        customerId,
        previousStage,
        newStage,
        triggered: false,
        reason: 'No transition needed'
    };
}

function calculateNextStage(
    customer: {
        lifecycleStage: CustomerLifecycleStage;
        totalOrders: number;
        churnRiskScore: number | null;
        avgDaysBetweenOrders: number | null;
        lastOrderAt: Date | null;
        firstOrderAt?: Date | null;
    },
    options?: LifecycleOptions
): CustomerLifecycleStage {
    if (
        options?.allowWinback &&
        customer.lifecycleStage === 'CHURNED' &&
        customer.totalOrders > 0 &&
        customer.lastOrderAt !== null
    ) {
        return 'WINBACK';
    }

    if (
        customer.churnRiskScore !== null &&
        customer.churnRiskScore >= LIFECYCLE_RULES.AT_RISK_THRESHOLD
    ) {
        if (customer.avgDaysBetweenOrders && customer.lastOrderAt) {
            const daysSinceLastOrder = Math.floor(
                (Date.now() - customer.lastOrderAt.getTime()) /
                    (1000 * 60 * 60 * 24)
            );
            const churnThreshold =
                customer.avgDaysBetweenOrders *
                LIFECYCLE_RULES.CHURN_MULTIPLIER;

            if (daysSinceLastOrder >= churnThreshold) {
                return 'CHURNED';
            }
        }
        return 'AT_RISK';
    }

    if (customer.totalOrders >= LIFECYCLE_RULES.LOYAL_THRESHOLD) {
        return 'LOYAL';
    }

    if (customer.totalOrders >= LIFECYCLE_RULES.RETURNING_THRESHOLD) {
        return 'RETURNING';
    }

    if (customer.totalOrders === LIFECYCLE_RULES.ONE_TIME_THRESHOLD) {
        return 'ONE_TIME';
    }

    return 'PROSPECT';
}

function getTransitionReason(
    from: CustomerLifecycleStage,
    to: CustomerLifecycleStage,
    totalOrders: number
): string {
    switch (to) {
        case 'ONE_TIME':
            return `First order placed (${totalOrders} order)`;
        case 'RETURNING':
            return `Reached ${totalOrders} orders`;
        case 'LOYAL':
            return `Reached ${totalOrders} orders (loyal threshold)`;
        case 'AT_RISK':
            return 'Churn risk score exceeded threshold';
        case 'CHURNED':
            return 'Exceeded 2x average days between orders without purchase';
        case 'WINBACK':
            return 'Made a purchase after being churned';
        default:
            return `Order count: ${totalOrders}`;
    }
}

export async function recalculateVIPCustomers(
    organizationId: string
): Promise<{ promoted: number; demoted: number }> {
    const allCustomers = await prisma.customer.findMany({
        where: { organizationId },
        select: { id: true, lifecycleStage: true, totalSpent: true }
    });

    if (allCustomers.length === 0) {
        return { promoted: 0, demoted: 0 };
    }

    const sortedBySpent = [...allCustomers].sort(
        (a, b) => Number(b.totalSpent) - Number(a.totalSpent)
    );

    const vipCount = Math.max(
        1,
        Math.ceil(allCustomers.length * LIFECYCLE_RULES.VIP_PERCENTILE)
    );
    const vipThreshold = sortedBySpent[vipCount - 1]?.totalSpent ?? 0;

    let promoted = 0;
    let demoted = 0;
    const updates: { id: string; lifecycleStage: CustomerLifecycleStage }[] =
        [];

    for (const customer of allCustomers) {
        const isCurrentlyVIP = customer.lifecycleStage === 'VIP';
        const shouldBeVIP =
            Number(customer.totalSpent) >= Number(vipThreshold) &&
            customer.lifecycleStage !== 'PROSPECT' &&
            customer.lifecycleStage !== 'LEAD';

        if (shouldBeVIP && !isCurrentlyVIP) {
            updates.push({ id: customer.id, lifecycleStage: 'VIP' });
            promoted++;
            logger.info(`Customer ${customer.id} marked for promotion to VIP`);
        } else if (!shouldBeVIP && isCurrentlyVIP) {
            updates.push({ id: customer.id, lifecycleStage: 'LOYAL' });
            demoted++;
            logger.info(
                `Customer ${customer.id} marked for demotion from VIP to LOYAL`
            );
        }
    }

    if (updates.length > 0) {
        await prisma.$transaction(
            updates.map((u) =>
                prisma.customer.update({
                    where: { id: u.id },
                    data: { lifecycleStage: u.lifecycleStage }
                })
            )
        );
    }

    logger.info(
        `VIP recalculation complete: ${promoted} promoted, ${demoted} demoted`
    );
    return { promoted, demoted };
}

export async function processWinbackCustomers(
    organizationId: string
): Promise<number> {
    const churnedWithNewOrder = await prisma.customer.findMany({
        where: {
            organizationId,
            lifecycleStage: 'CHURNED',
            orders: { some: {} }
        },
        select: { id: true, lastOrderAt: true }
    });

    let winbackCount = 0;

    for (const customer of churnedWithNewOrder) {
        await prisma.customer.update({
            where: { id: customer.id },
            data: { lifecycleStage: 'WINBACK' }
        });
        winbackCount++;
        logger.info(`Customer ${customer.id} transitioned to WINBACK`);
    }

    return winbackCount;
}

export async function processBatchLifecycleUpdate(
    organizationId: string
): Promise<{
    total: number;
    transitions: number;
    details: LifecycleTransitionResult[];
}> {
    const customers = await prisma.customer.findMany({
        where: { organizationId },
        select: {
            id: true,
            lifecycleStage: true,
            totalOrders: true,
            churnRiskScore: true,
            avgDaysBetweenOrders: true,
            lastOrderAt: true
        }
    });

    const transitions: LifecycleTransitionResult[] = [];
    const updates: { id: string; lifecycleStage: CustomerLifecycleStage }[] =
        [];

    for (const customer of customers) {
        const newStage = calculateNextStage(customer);

        if (newStage !== customer.lifecycleStage) {
            updates.push({ id: customer.id, lifecycleStage: newStage });
            transitions.push({
                customerId: customer.id,
                previousStage: customer.lifecycleStage,
                newStage,
                triggered: true,
                reason: getTransitionReason(
                    customer.lifecycleStage,
                    newStage,
                    customer.totalOrders
                )
            });
        }
    }

    if (updates.length > 0) {
        await prisma.$transaction(
            updates.map((u) =>
                prisma.customer.update({
                    where: { id: u.id },
                    data: { lifecycleStage: u.lifecycleStage }
                })
            )
        );
    }

    logger.info(
        `Batch lifecycle update for ${organizationId}: ${transitions.length} transitions out of ${customers.length} customers`
    );

    return {
        total: customers.length,
        transitions: transitions.length,
        details: transitions
    };
}
