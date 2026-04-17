import { z } from 'zod';

export const createCampaign = z.object({
    name: z.string().min(1, 'Name is required'),
    description: z.string().optional(),
    type: z.enum(['EMAIL', 'SMS']).default('EMAIL'),
    segmentId: z.string().optional(),
    templateId: z.string().optional(),
    subject: z.string().optional(),
    content: z
        .object({
            body: z.string().optional()
        })
        .optional(),
    scheduledAt: z.string().datetime().optional()
});

export const updateCampaign = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    type: z.enum(['EMAIL', 'SMS']).optional(),
    segmentId: z.string().nullable().optional(),
    templateId: z.string().nullable().optional(),
    subject: z.string().optional(),
    content: z
        .object({
            body: z.string().optional()
        })
        .optional(),
    scheduledAt: z.string().datetime().nullable().optional()
});

export const sendCampaign = z.object({
    sendNow: z.boolean().optional().default(true)
});

export const campaignQuery = z.object({
    type: z.enum(['EMAIL', 'SMS']).optional(),
    status: z
        .enum(['DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED'])
        .optional(),
    page: z.string().optional(),
    limit: z.string().optional()
});

export const campaignId = z.object({
    id: z.string()
});
