import prisma from '../../config/prisma.config.js';
import { NotFoundError } from '../../utils/response.util.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { Subscription, Plan } from '../../generated/prisma/client.js';
export { isSubscriptionActive } from '../../utils/plan-limits.util.js';

export type SubscriptionWithPlan = Subscription & { plan: Plan };

export async function listPlans(includeInactive = false) {
    return prisma.plan.findMany({
        where: includeInactive ? {} : { isActive: true },
        orderBy: { sortOrder: 'asc' }
    });
}

export async function getCurrentSubscription(organizationId: string) {
    const subscription = await prisma.subscription.findUnique({
        where: { organizationId },
        include: { plan: true }
    });
    return subscription;
}

export async function subscribeOrganization(
    organizationId: string,
    planId: string,
    billingCycle: 'monthly' | 'yearly' = 'monthly'
): Promise<{
    subscription: SubscriptionWithPlan;
    paymentRequired: boolean;
    amount?: number;
    billingCycle?: 'monthly' | 'yearly';
}> {
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) {
        throw new NotFoundError('Plan not found');
    }

    if (plan.name === 'free') {
        const subscription = await prisma.subscription.upsert({
            where: { organizationId },
            create: {
                organizationId,
                planId,
                status: 'ACTIVE',
                startDate: new Date(),
                endDate: null
            },
            update: {
                planId,
                status: 'ACTIVE',
                startDate: new Date(),
                endDate: null,
                metadata: Prisma.DbNull
            },
            include: { plan: true }
        });
        return { subscription, paymentRequired: false };
    }

    const startDate = new Date();
    const endDate = new Date();
    if (billingCycle === 'yearly') {
        endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
        endDate.setMonth(endDate.getMonth() + 1);
    }

    // Store the pending upgrade in metadata WITHOUT changing the current plan.
    // The plan will only be updated after successful payment via activateSubscription.
    const subscription = await prisma.subscription.upsert({
        where: { organizationId },
        create: {
            organizationId,
            planId,
            status: 'TRIALING',
            startDate,
            endDate,
            metadata: {
                pendingPlanId: planId,
                pendingBillingCycle: billingCycle
            }
        },
        update: {
            // Keep the current plan — don't change planId yet
            metadata: {
                pendingPlanId: planId,
                pendingBillingCycle: billingCycle
            }
        },
        include: { plan: true }
    });

    // Return the target plan info (not the current plan) for the payment UI
    return {
        subscription: { ...subscription, plan },
        paymentRequired: true,
        amount:
            billingCycle === 'yearly'
                ? Number(plan.price) * 12 * 0.9
                : Number(plan.price),
        billingCycle
    };
}

export async function cancelSubscription(
    organizationId: string,
    immediately = false
) {
    const subscription = await prisma.subscription.findUnique({
        where: { organizationId }
    });

    if (!subscription) {
        throw new NotFoundError('No active subscription');
    }

    if (immediately) {
        return prisma.subscription.update({
            where: { organizationId },
            data: { status: 'CANCELED', cancelAt: new Date() },
            include: { plan: true }
        });
    }

    return prisma.subscription.update({
        where: { organizationId },
        data: { status: 'ACTIVE', cancelAt: new Date() },
        include: { plan: true }
    });
}

export async function activateSubscription(
    organizationId: string,
    paymobSubscriptionId: string
) {
    const subscription = await prisma.subscription.findUnique({
        where: { organizationId },
        include: { plan: true }
    });

    if (!subscription) {
        throw new NotFoundError('Subscription not found');
    }

    // Read the pending plan from metadata (set during initializeSubscription)
    const metadata = subscription.metadata as Record<string, unknown> | null;
    const pendingPlanId =
        (metadata?.pendingPlanId as string) || subscription.planId;
    const pendingBillingCycle =
        (metadata?.pendingBillingCycle as string) ||
        subscription.plan.billingCycle;

    const startDate = new Date();
    const endDate = new Date();
    if (pendingBillingCycle === 'yearly') {
        endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
        endDate.setMonth(endDate.getMonth() + 1);
    }

    return prisma.subscription.update({
        where: { organizationId },
        data: {
            planId: pendingPlanId,
            status: 'ACTIVE',
            paymobSubscriptionId,
            startDate,
            endDate,
            metadata: Prisma.DbNull // Clear pending upgrade metadata
        },
        include: { plan: true }
    });
}

export function hasFeature(
    subscription: {
        status: string;
        plan: { name: string; features: Record<string, number> };
    } | null,
    feature: string
): boolean {
    if (subscription === null || subscription.status !== 'ACTIVE') {
        return subscription?.plan.name === 'free' || false;
    }
    const features =
        (subscription.plan.features as Record<string, number>) || {};
    return (features[feature] ?? 0) > 0;
}
