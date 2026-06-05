import { Prisma } from '../generated/prisma/client.js';
import { assignFreePlanToOrg, PLAN_NAME } from '../utils/plan-limits.util.js';

export const PLANS: Prisma.PlanCreateInput[] = [
    {
        name: PLAN_NAME.FREE,
        displayName: 'Free',
        price: new Prisma.Decimal(0),
        billingCycle: 'monthly',
        features: {
            customers: 5000,
            storageGB: 2.5,
            emails: 50000,
            days: 14,
            exports: false,
            imports: false
        },
        isActive: true,
        sortOrder: 1
    },
    {
        name: PLAN_NAME.GROWTH,
        displayName: 'Growth',
        price: new Prisma.Decimal(450),
        billingCycle: 'monthly',
        features: {
            customers: -1,
            storageGB: -1,
            emails: -1,
            days: -1,
            exports: true,
            imports: true
        },
        isActive: true,
        sortOrder: 2
    },
    {
        name: PLAN_NAME.PRO,
        displayName: 'Pro',
        price: new Prisma.Decimal(1200),
        billingCycle: 'monthly',
        features: {
            customers: 10000,
            storageGB: 5,
            emails: 100000,
            days: -1,
            exports: true,
            imports: true,
            support: true
        },
        isActive: true,
        sortOrder: 3
    }
];

export async function assignFreePlanToOrganizations(
    organizationIds: string[]
): Promise<{ assigned: number; total: number }> {
    let assigned = 0;
    for (const orgId of organizationIds) {
        const { created } = await assignFreePlanToOrg(orgId);
        if (created) assigned++;
    }
    return { assigned, total: organizationIds.length };
}
