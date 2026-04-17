import { z } from 'zod';

export const createEmailTemplate = z.object({
    name: z.string().min(1, 'Name is required'),
    subject: z.string().min(1, 'Subject is required'),
    htmlBody: z.string().min(1, 'HTML body is required'),
    variables: z.array(z.string()).optional().default([])
});

export const updateEmailTemplate = z.object({
    name: z.string().min(1).optional(),
    subject: z.string().min(1).optional(),
    htmlBody: z.string().min(1).optional(),
    variables: z.array(z.string()).optional()
});

export const emailTemplateQuery = z.object({
    page: z.string().optional(),
    limit: z.string().optional()
});

export const emailTemplateId = z.object({
    id: z.string()
});
