import * as Sentry from '@sentry/bun';
import { fullSync } from '../api/integrations/sync.service.js';
import logger from '../utils/logger.util.js';

export interface ShopifySyncJobData {
    integrationId: string;
    entityTypes: string[];
}

export async function processShopifyFullSync(
    integrationId: string,
    entityTypes: string[] = ['customers', 'orders', 'products']
) {
    logger.info(
        `Processing Shopify full sync for integration ${integrationId}`
    );
    const stats = await fullSync(integrationId, entityTypes);
    return stats;
}

export async function addShopifyFullSyncJob(
    integrationId: string,
    entityTypes: string[] = ['customers', 'orders', 'products']
): Promise<{ jobId?: string; queued: boolean }> {
    try {
        const { Queue } = await import('bullmq');
        const { getRedisConnectionOptions } =
            await import('../config/redis.config.js');

        const syncQueue = new Queue<ShopifySyncJobData>('shopify-sync-queue', {
            connection: getRedisConnectionOptions()
        });
        const job = await syncQueue.add('shopify-full-sync', {
            integrationId,
            entityTypes
        });
        return { jobId: job.id, queued: true };
    } catch (e) {
        logger.warn(
            { err: e },
            'BullMQ not available, running Shopify sync synchronously'
        );
        Sentry.captureMessage(
            `Shopify sync fallback to synchronous: Redis unavailable for integration ${integrationId}`,
            'warning'
        );
        await processShopifyFullSync(integrationId, entityTypes);
        return { queued: false };
    }
}
