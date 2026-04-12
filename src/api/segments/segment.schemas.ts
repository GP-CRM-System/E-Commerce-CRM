import { z } from 'zod';
import { segmentFilterSchema } from './segment.utils.js';

export const createSegmentSchema = z.object({
    name: z.string().min(1).max(255),
    description: z.string().max(1000).optional(),
    filter: segmentFilterSchema
});

export const updateSegmentSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(1000).optional().nullable(),
    filter: segmentFilterSchema.optional()
});

export const listSegmentsSchema = z.object({
    limit: z
        .union([z.coerce.number(), z.string()])
        .transform((v) => {
            const num = typeof v === 'string' ? parseInt(v, 10) : v;
            return isNaN(num) ? 20 : Math.min(Math.max(num, 1), 100);
        })
        .default(20),
    offset: z
        .union([z.coerce.number(), z.string()])
        .transform((v) => {
            const num = typeof v === 'string' ? parseInt(v, 10) : v;
            return isNaN(num) ? 0 : Math.max(num, 0);
        })
        .default(0),
    search: z.string().optional()
});

export const listSegmentCustomersSchema = z.object({
    limit: z
        .union([z.coerce.number(), z.string()])
        .transform((v) => {
            const num = typeof v === 'string' ? parseInt(v, 10) : v;
            return isNaN(num) ? 20 : Math.min(Math.max(num, 1), 100);
        })
        .default(20),
    offset: z
        .union([z.coerce.number(), z.string()])
        .transform((v) => {
            const num = typeof v === 'string' ? parseInt(v, 10) : v;
            return isNaN(num) ? 0 : Math.max(num, 0);
        })
        .default(0),
    sortBy: z
        .enum(['name', 'totalSpent', 'totalOrders', 'lastOrderAt', 'createdAt'])
        .default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc')
});

export type CreateSegmentInput = z.infer<typeof createSegmentSchema>;
export type UpdateSegmentInput = z.infer<typeof updateSegmentSchema>;
export type ListSegmentsInput = z.infer<typeof listSegmentsSchema>;
export type ListSegmentCustomersInput = z.infer<
    typeof listSegmentCustomersSchema
>;
