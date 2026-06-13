import { z } from 'zod';

export const sendMessageSchema = z.object({
    content: z
        .string()
        .min(1, 'Message content cannot be empty')
        .max(4096, 'Message is too long'),
    type: z
        .enum(['text', 'image', 'document', 'template', 'audio', 'video'])
        .default('text'),
    metadata: z.record(z.string(), z.any()).optional()
});

export const startConversationSchema = z.object({
    provider: z.enum(['whatsapp', 'facebook', 'messenger', 'instagram']),
    recipientId: z.string().min(1, 'Recipient ID is required'),
    content: z
        .string()
        .min(1, 'Message content cannot be empty')
        .max(4096, 'Message is too long'),
    type: z
        .enum(['text', 'image', 'document', 'template', 'audio', 'video'])
        .default('text'),
    customerPhone: z.string().optional(),
    customerName: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional()
});

export const createUploadSessionSchema = z.object({
    fileName: z.string().min(1, 'File name is required'),
    mimeType: z.string().min(1, 'MIME type is required'),
    fileSize: z.number().max(25 * 1024 * 1024, 'File size exceeds 25MB limit'),
    type: z.enum(['image', 'video', 'audio', 'document'])
});
