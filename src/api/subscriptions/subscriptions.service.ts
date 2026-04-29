import prisma from '../../config/prisma.config.js';
import { NotFoundError } from '../../utils/response.util.js';

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
) {
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
                endDate: null
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

    const subscription = await prisma.subscription.upsert({
        where: { organizationId },
        create: {
            organizationId,
            planId,
            status: 'TRIALING',
            startDate,
            endDate
        },
        update: {
            planId,
            status: 'TRIALING',
            startDate,
            endDate
        },
        include: { plan: true }
    });

    return {
        subscription,
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
    fawryRefNo: string
) {
    const subscription = await prisma.subscription.findUnique({
        where: { organizationId }
    });

    if (!subscription) {
        throw new NotFoundError('Subscription not found');
    }

    return prisma.subscription.update({
        where: { organizationId },
        data: {
            status: 'ACTIVE',
            fawryRefNo,
            endDate: null
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

export function isSubscriptionActive(
    subscription: { status: string; endDate: Date | null } | null
): boolean {
    if (!subscription) return false;
    if (subscription.status === 'ACTIVE') return true;
    if (subscription.status === 'TRIALING' && subscription.endDate) {
        return new Date() < subscription.endDate;
    }
    return false;
}
