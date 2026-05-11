import * as Sentry from '@sentry/bun';
import type { ShopifyWebhookPayload } from '../api/integrations/webhook.service.js';
import prisma from '../config/prisma.config.js';
import { handleShopifyWebhook } from '../api/integrations/webhook.service.js';
import logger from '../utils/logger.util.js';

export interface ShopifyWebhookJobData {
    integrationId: string;
    topic: string;
    payload: Record<string, unknown>;
    webhookLogId: string;
}

export async function processShopifyWebhookJob(
    jobData: ShopifyWebhookJobData
): Promise<void> {
    const integration = await prisma.integration.findUnique({
        where: { id: jobData.integrationId }
    });

    if (!integration) {
        logger.error(
            `Integration not found for webhook job: ${jobData.integrationId}`
        );
        return;
    }

    await handleShopifyWebhook(
        integration,
        jobData.topic,
        jobData.payload as unknown as ShopifyWebhookPayload,
        jobData.webhookLogId
    );
}

export async function addShopifyWebhookJob(
    integrationId: string,
    topic: string,
    payload: Record<string, unknown>,
    webhookLogId: string
): Promise<{ jobId?: string; queued: boolean }> {
    try {
        const { Queue } = await import('bullmq');
        const { getRedisConnectionOptions } =
            await import('../config/redis.config.js');

        const webhookQueue = new Queue<ShopifyWebhookJobData>(
            'shopify-webhook-queue',
            { connection: getRedisConnectionOptions() }
        );
        const job = await webhookQueue.add(
            'shopify-webhook',
            { integrationId, topic, payload, webhookLogId },
            {
                attempts: 3,
                backoff: { type: 'exponential', delay: 2000 }
            }
        );
        return { jobId: job.id, queued: true };
    } catch (e) {
        logger.warn(
            { err: e },
            'BullMQ not available, processing webhook synchronously'
        );
        Sentry.captureMessage(
            `Shopify webhook fallback to synchronous: Redis unavailable for integration ${integrationId}`,
            'warning'
        );
        await processShopifyWebhookJob({
            integrationId,
            topic,
            payload,
            webhookLogId
        });
        return { queued: false };
    }
}
