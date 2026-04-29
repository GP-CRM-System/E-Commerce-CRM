import { z } from 'zod';

export const listPlansQuerySchema = z.object({
    includeInactive: z.coerce.boolean().optional().default(false)
});

export const subscribeSchema = z.object({
    planId: z.string().min(1, 'Plan ID is required'),
    billingCycle: z.enum(['monthly', 'yearly']).optional().default('monthly')
});

export const cancelSubscriptionSchema = z.object({
    immediately: z.boolean().optional().default(false)
});
