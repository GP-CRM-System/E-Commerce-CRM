import prisma from '../config/prisma.config.js';
import { AppError, ErrorCode, HttpStatus } from './response.util.js';

export const PLAN_NAME = {
    FREE: 'free',
    GROWTH: 'growth',
    PRO: 'pro'
} as const;

export type PlanName = (typeof PLAN_NAME)[keyof typeof PLAN_NAME];

export type PlanLimitKey = 'customers' | 'storageGB' | 'emails' | 'days';

const UNLIMITED = -1;
const BYTES_PER_PRODUCT = 50 * 1024;
const BYTES_PER_CUSTOMER = 10 * 1024;
const STORAGE_BASE_GB = 0.15;

export type PlanFeatures = {
    customers: number;
    storageGB: number;
    emails: number;
    days: number;
    [key: string]: number | boolean | undefined;
};

export function isUnlimited(value: number): boolean {
    return value === UNLIMITED;
}

export function calculateStorageGB(
    productsCount: number,
    customersCount: number
): number {
    const estimatedBytes =
        productsCount * BYTES_PER_PRODUCT + customersCount * BYTES_PER_CUSTOMER;
    const estimatedGB = estimatedBytes / (1024 * 1024 * 1024);
    return Number(estimatedGB.toFixed(3)) + STORAGE_BASE_GB;
}

export async function getOrganizationUsage(organizationId: string) {
    const [productsCount, customersCount] = await Promise.all([
        prisma.product.count({ where: { organizationId } }),
        prisma.customer.count({ where: { organizationId } })
    ]);
    return {
        productsCount,
        customersCount,
        storageGB: calculateStorageGB(productsCount, customersCount)
    };
}

export function isSubscriptionActive(
    subscription: {
        status: string;
        endDate: Date | null;
    } | null
): boolean {
    if (!subscription) return false;
    if (
        subscription.status !== 'ACTIVE' &&
        subscription.status !== 'TRIALING'
    ) {
        return false;
    }
    if (subscription.endDate) {
        return new Date() < subscription.endDate;
    }
    return subscription.status === 'ACTIVE';
}

async function getActiveSubscription(organizationId: string) {
    const subscription = await prisma.subscription.findUnique({
        where: { organizationId },
        include: { plan: true }
    });

    if (!isSubscriptionActive(subscription)) {
        return null;
    }

    return subscription;
}

function getFeature(
    subscription: NonNullable<
        Awaited<ReturnType<typeof getActiveSubscription>>
    >,
    key: PlanLimitKey
): number {
    return readFeature(subscription.plan.features, key, subscription.plan.name);
}

function readFeature(
    rawFeatures: unknown,
    key: PlanLimitKey,
    planName: string
): number {
    const features = (rawFeatures as PlanFeatures) || {};
    const value = features[key];
    if (typeof value !== 'number') {
        throw new AppError(
            `Plan "${planName}" is missing required limit "${key}"`,
            HttpStatus.INTERNAL_SERVER_ERROR,
            ErrorCode.SERVER_ERROR
        );
    }
    return value;
}

function throwLimitExceeded(
    limitKey: PlanLimitKey,
    current: number,
    cap: number,
    planName: string
): never {
    const labels: Record<PlanLimitKey, string> = {
        customers: 'customer',
        storageGB: 'storage',
        emails: 'email',
        days: 'day'
    };
    throw new AppError(
        `${planName} plan ${labels[limitKey]} limit reached (${current}/${cap}). Upgrade your plan to continue.`,
        HttpStatus.PAYMENT_REQUIRED,
        ErrorCode.RESOURCE_LIMIT_REACHED,
        { limitKey, current, cap, planName }
    );
}

export async function checkCustomerLimit(
    organizationId: string,
    delta = 1
): Promise<void> {
    const subscription = await getActiveSubscription(organizationId);
    if (!subscription) return;

    const cap = getFeature(subscription, 'customers');
    if (isUnlimited(cap)) return;

    const current = await prisma.customer.count({ where: { organizationId } });
    if (current + delta > cap) {
        throwLimitExceeded(
            'customers',
            current,
            cap,
            subscription.plan.displayName
        );
    }
}

export async function checkStorageLimit(
    organizationId: string,
    additionalProducts = 1
): Promise<void> {
    const subscription = await getActiveSubscription(organizationId);
    if (!subscription) return;

    const cap = getFeature(subscription, 'storageGB');
    if (isUnlimited(cap)) return;

    const usage = await getOrganizationUsage(organizationId);
    const projectedGB = calculateStorageGB(
        usage.productsCount + additionalProducts,
        usage.customersCount
    );

    if (projectedGB > cap) {
        throwLimitExceeded(
            'storageGB',
            Number(projectedGB.toFixed(3)),
            cap,
            subscription.plan.displayName
        );
    }
}

export async function checkEmailLimit(
    organizationId: string,
    emailsToSend: number
): Promise<void> {
    const subscription = await getActiveSubscription(organizationId);
    if (!subscription) return;

    const cap = getFeature(subscription, 'emails');
    if (isUnlimited(cap)) return;

    if (emailsToSend > cap) {
        throwLimitExceeded(
            'emails',
            emailsToSend,
            cap,
            subscription.plan.displayName
        );
    }
}

export async function assignFreePlanToOrg(
    organizationId: string
): Promise<{ created: boolean }> {
    const freePlan = await prisma.plan.findFirst({
        where: { name: PLAN_NAME.FREE }
    });
    if (!freePlan) {
        return { created: false };
    }

    const existing = await prisma.subscription.findUnique({
        where: { organizationId }
    });
    if (existing) {
        return { created: false };
    }

    const days = readFeature(freePlan.features, 'days', freePlan.name);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    await prisma.subscription.create({
        data: {
            organizationId,
            planId: freePlan.id,
            status: 'ACTIVE',
            startDate: new Date(),
            endDate
        }
    });
    return { created: true };
}
