import { z } from 'zod';

export const createImportJob = z.object({
    entityType: z.enum(['customer', 'product', 'order']),
    hasHeader: z
        .string()
        .transform((val) => {
            if (val === 'true') return true;
            if (val === 'false') return false;
            throw new Error('Invalid value for hasHeader');
        })
        .optional(),
    mapping: z.preprocess((val) => {
        if (typeof val !== 'string') return val;
        try {
            return JSON.parse(val);
        } catch {
            return val;
        }
    }, z.record(z.string(), z.string()).optional()),
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
