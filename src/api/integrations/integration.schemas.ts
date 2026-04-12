import { z } from 'zod';

export const connectShopify = z.object({
    shopDomain: z
        .string()
        .min(1)
        .max(255)
        .regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]?(\.myshopify\.com)?$/i, {
            message:
                'Invalid Shopify store domain (e.g., mystore.myshopify.com)'
        }),
    accessToken: z.string().min(1).describe('Shopify Admin API access token'),
    name: z.string().min(1).max(100).optional(),
    apiSecret: z.string().optional()
});

export const updateIntegration = z.object({
    name: z.string().min(1).max(100).optional(),
    syncMode: z.enum(['webhook', 'polling', 'manual']).optional(),
    isActive: z.boolean().optional(),
    metadata: z.record(z.string(), z.unknown()).optional()
});

export const integrationParams = z.object({
    integrationId: z.string().min(1)
});

export const registerWebhookTopics = z.object({
    topics: z.array(
        z.enum([
            'orders/create',
            'orders/updated',
            'orders/paid',
            'orders/cancelled',
            'orders/fulfilled',
            'orders/partially_fulfilled',
            'orders/refunded',
            'customers/create',
            'customers/update',
            'customers/disable',
            'products/create',
            'products/update',
            'products/delete'
        ])
    )
});

export type ConnectShopifyInput = z.infer<typeof connectShopify>;
export type UpdateIntegrationInput = z.infer<typeof updateIntegration>;
export type RegisterWebhookTopicsInput = z.infer<typeof registerWebhookTopics>;
