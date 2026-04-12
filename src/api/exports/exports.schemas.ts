import { z } from 'zod';

export const createExportJob = z.object({
    entityType: z.enum(['customer', 'product', 'order']),
    format: z.enum(['csv', 'xlsx']),
    selectedColumns: z.array(z.string()).optional(),
    filters: z.record(z.string(), z.unknown()).optional()
});

export const exportJobQuery = z.object({
    entityType: z.enum(['customer', 'product', 'order']).optional(),
    status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']).optional(),
    page: z.string().optional(),
    limit: z.string().optional()
});

export const exportJobId = z.object({
    id: z.string()
});
