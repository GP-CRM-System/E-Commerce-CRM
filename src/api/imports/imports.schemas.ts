import { z } from 'zod';

export const createImportJob = z.object({
    entityType: z.enum(['customer', 'product', 'order']),
    hasHeader: z.boolean().optional(),
    mapping: z.record(z.string(), z.string()).optional(),
    duplicateStrategy: z.enum(['create_only', 'upsert']).optional(),
    mode: z.enum(['create_only', 'upsert']).optional()
});

export const importJobQuery = z.object({
    entityType: z.enum(['customer', 'product', 'order']).optional(),
    status: z
        .enum([
            'PENDING',
            'PROCESSING',
            'COMPLETED',
            'FAILED',
            'PARTIALLY_FAILED',
            'CANCELLED'
        ])
        .optional(),
    page: z.string().optional(),
    limit: z.string().optional()
});

export const importJobId = z.object({
    id: z.string()
});
