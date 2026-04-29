import { z } from 'zod';

export const sendMessageSchema = z.object({
    content: z
        .string()
        .min(1, 'Message content cannot be empty')
        .max(4096, 'Message is too long'),
    type: z.enum(['text', 'image', 'document', 'template']).default('text'),
    metadata: z.record(z.string(), z.any()).optional()
});
