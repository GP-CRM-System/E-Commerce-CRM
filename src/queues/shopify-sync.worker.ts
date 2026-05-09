import { Worker, type Job } from 'bullmq';
import { getRedisConnectionOptions } from '../config/redis.config.js';
import logger from '../utils/logger.util.js';
import { processShopifyFullSync } from './shopify-sync.queue.js';
import type { ShopifySyncJobData } from './shopify-sync.queue.js';

export const shopifySyncWorker = new Worker<ShopifySyncJobData>(
    'shopify-sync-queue',
    async (job: Job<ShopifySyncJobData>) => {
        const { integrationId, entityTypes } = job.data;
        logger.info(
            `Processing Shopify full sync job ${job.id} for integration ${integrationId}`
        );

        try {
            const stats = await processShopifyFullSync(
                integrationId,
                entityTypes
            );
            return { success: true, ...stats };
        } catch (error) {
            logger.error(
                { err: error },
                `Shopify sync job ${job.id} failed for integration ${integrationId}`
            );
            throw error;
        }
    },
    {
        connection: getRedisConnectionOptions(),
        concurrency: 2
    }
);

shopifySyncWorker.on('completed', (job) => {
    logger.info(
        `Shopify sync job ${job.id} completed for integration ${job.data.integrationId}`
    );
});

shopifySyncWorker.on('failed', (job, err) => {
    logger.error(
        { err },
        `Shopify sync job ${job?.id} failed for integration ${job?.data.integrationId}`
    );
});
