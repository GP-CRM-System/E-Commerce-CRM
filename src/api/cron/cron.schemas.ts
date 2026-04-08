import { z } from 'zod';

export const triggerRFMJob = z.object({
    organizationId: z.string(),
    customerId: z.string().optional(),
    daysWindow: z.number().int().min(1).max(365).optional()
});

export const triggerLifecycleJob = z.object({
    organizationId: z.string(),
    customerId: z.string().optional()
});

export const triggerVipJob = z.object({
    organizationId: z.string()
});

export type TriggerRFMJobInput = z.infer<typeof triggerRFMJob>;
export type TriggerLifecycleJobInput = z.infer<typeof triggerLifecycleJob>;
export type TriggerVipJobInput = z.infer<typeof triggerVipJob>;
