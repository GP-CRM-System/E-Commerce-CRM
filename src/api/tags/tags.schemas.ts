import { z } from 'zod';

export const createTagSchema = z.object({
    name: z.string().min(1).max(100).trim(),
    color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex color like #4A90E2')
});

export const updateTagSchema = z.object({
    name: z.string().min(1).max(100).trim().optional(),
    color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex color like #4A90E2')
        .optional()
});

export const listTagsSchema = z.object({
    limit: z
        .union([z.coerce.number(), z.string()])
        .transform((v) => {
            const num = typeof v === 'string' ? parseInt(v, 10) : v;
            return isNaN(num) ? 50 : Math.min(Math.max(num, 1), 100);
        })
        .default(50),
    offset: z
        .union([z.coerce.number(), z.string()])
        .transform((v) => {
            const num = typeof v === 'string' ? parseInt(v, 10) : v;
            return isNaN(num) ? 0 : Math.max(num, 0);
        })
        .default(0),
    search: z.string().optional()
});

export type CreateTagInput = z.infer<typeof createTagSchema>;
export type UpdateTagInput = z.infer<typeof updateTagSchema>;
export type ListTagsInput = z.infer<typeof listTagsSchema>;
