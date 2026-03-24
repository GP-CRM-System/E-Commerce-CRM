import crypto from 'crypto';
import logger from '../../utils/logger.util.js';
import prisma from '../../config/prisma.config.js';
import type { Integration } from '../../generated/prisma/client.js';

export interface ShopifyWebhookPayload {
    id: number;
    email?: string;
    created_at?: string;
    updated_at?: string;
    total_price?: string;
    currency?: string;
    financial_status?: string;
    fulfillment_status?: string | null;
    title?: string;
    body_html?: string;
    variants?: Array<{
        id: number;
        product_id: number;
        variant_id: number;
        title: string;
        price: string;
        sku?: string;
    }>;
    image?: { src: string };
    images?: Array<{ src: string }>;
    customer?: {
        id: number;
        email?: string;
        first_name?: string;
        last_name?: string;
        phone?: string;
        accepts_marketing?: boolean;
        addresses?: Array<{
            address1?: string;
            city?: string;
            province?: string;
            zip?: string;
            country?: string;
        }>;
    };
    line_items?: Array<{
        id: number;
        product_id: number;
        variant_id: number;
        title: string;
        quantity: number;
        price: string;
        sku?: string;
    }>;
    shipping_address?: {
        first_name?: string;
        last_name?: string;
        address1?: string;
        city?: string;
        province?: string;
        zip?: string;
        country?: string;
        phone?: string;
    };
    billing_address?: {
        first_name?: string;
        last_name?: string;
        address1?: string;
        city?: string;
        province?: string;
        zip?: string;
        country?: string;
        phone?: string;
    };
    shipping_lines?: Array<{
        title: string;
        price: string;
    }>;
    discount_codes?: Array<{
        code: string;
        amount: string;
    }>;
    subtotal_price?: string;
    total_tax?: string;
    total_discounts?: string;
    tags?: string;
    note?: string;
    source?: string;
    referring_site?: string;
    name?: string;
    status?: string;
    current_total_discounts?: string;
    current_total_tax?: string;
    current_total_price?: string;
    total_price_usd?: string;
    admin_graphql_api_id?: string;
}

export async function createWebhookLog(
    integrationId: string,
    topic: string,
    shopDomain: string,
    payload: unknown,
    headers?: Record<string, string>,
    webhookId?: string
) {
    return prisma.webhookLog.create({
        data: {
            integrationId,
            topic,
            shopDomain,
            webhookId: webhookId?.toString(),
            payload: payload as object,
            headers: headers as object,
            status: 'received',
            createdAt: new Date()
        }
    });
}

export async function updateWebhookLogStatus(
    webhookLogId: string,
    status: string,
    errorMessage?: string
) {
    const updateData: {
        status: string;
        processedAt?: Date;
        errorMessage?: string;
        retryCount?: number;
    } = { status };

    if (status === 'completed' || status === 'failed') {
        updateData.processedAt = new Date();
    }

    if (status === 'failed' && errorMessage) {
        updateData.errorMessage = errorMessage;
        await prisma.webhookLog.update({
            where: { id: webhookLogId },
            data: { status, errorMessage, processedAt: new Date() }
        });
    } else {
        await prisma.webhookLog.update({
            where: { id: webhookLogId },
            data: updateData
        });
    }
}

export function verifyShopifyWebhookSignature(
    body: string,
    hmacHeader: string,
    secret: string
): boolean {
    if (!hmacHeader || !secret) {
        return false;
    }

    const generatedHash = crypto
        .createHmac('sha256', secret)
        .update(body, 'utf8')
        .digest('base64');

    try {
        return crypto.timingSafeEqual(
            Buffer.from(hmacHeader),
            Buffer.from(generatedHash)
        );
    } catch {
        return false;
    }
}

export async function handleShopifyWebhook(
    integration: Integration,
    topic: string,
    payload: ShopifyWebhookPayload,
    webhookLogId: string
): Promise<{ success: boolean; message: string }> {
    logger.info(`Processing webhook: ${topic} for ${integration.shopDomain}`);

    try {
        await updateWebhookLogStatus(webhookLogId, 'processing');

        if (topic === 'customers/disable') {
            await updateWebhookLogStatus(webhookLogId, 'completed');
            return { success: true, message: 'Customer disable acknowledged' };
        }

        await updateWebhookLogStatus(webhookLogId, 'completed');
        await prisma.integration.update({
            where: { id: integration.id },
            data: { lastSyncedAt: new Date() }
        });

        return { success: true, message: 'Webhook processed successfully' };
    } catch (error) {
        const message =
            error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Webhook processing failed: ${message}`);
        await updateWebhookLogStatus(webhookLogId, 'failed', message);

        return { success: false, message };
    }
}

export async function retryFailedWebhooks(integrationId: string) {
    const failedWebhooks = await prisma.webhookLog.findMany({
        where: {
            integrationId,
            status: 'failed',
            retryCount: { lt: 3 }
        },
        orderBy: { createdAt: 'asc' }
    });

    for (const webhook of failedWebhooks) {
        logger.info(
            `Retrying webhook ${webhook.id}, attempt ${webhook.retryCount + 1}`
        );

        await prisma.webhookLog.update({
            where: { id: webhook.id },
            data: { retryCount: { increment: 1 } }
        });

        const integration = await prisma.integration.findUnique({
            where: { id: integrationId }
        });

        if (!integration) {
            logger.error(`Integration not found for retry: ${integrationId}`);
            continue;
        }

        await handleShopifyWebhook(
            integration,
            webhook.topic,
            webhook.payload as unknown as ShopifyWebhookPayload,
            webhook.id
        );
    }
}
