import { z } from 'zod';

export const sendMessageSchema = z.object({
    content: z
        .string()
        .min(1, 'Message content cannot be empty')
        .max(4096, 'Message is too long'),
    type: z.enum(['text', 'image', 'document', 'template']).default('text'),
    metadata: z.record(z.string(), z.any()).optional()
});

export const startConversationSchema = z.object({
    provider: z.enum(['whatsapp', 'facebook', 'instagram']),
    recipientId: z.string().min(1, 'Recipient ID is required'),
    content: z
        .string()
        .min(1, 'Message content cannot be empty')
        .max(4096, 'Message is too long'),
    type: z.enum(['text', 'image', 'document', 'template']).default('text'),
    customerPhone: z.string().optional(),
    customerName: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional()
});
