import { Worker, type Job } from 'bullmq';
import { getRedisConnectionOptions } from '../config/redis.config.js';
import logger from '../utils/logger.util.js';
import { processShopifyWebhookJob } from './shopify-webhook.queue.js';
import type { ShopifyWebhookJobData } from './shopify-webhook.queue.js';

export const shopifyWebhookWorker = new Worker<ShopifyWebhookJobData>(
    'shopify-webhook-queue',
    async (job: Job<ShopifyWebhookJobData>) => {
        const { integrationId, topic } = job.data;
        logger.info(
            `Processing Shopify webhook job ${job.id}: ${topic} for integration ${integrationId}`
        );

        try {
            await processShopifyWebhookJob(job.data);
            return { success: true };
        } catch (error) {
            logger.error(
                { err: error },
                `Shopify webhook job ${job.id} failed for integration ${integrationId}`
            );
            throw error;
        }
    },
    {
        connection: getRedisConnectionOptions(),
        concurrency: 5
    }
);

shopifyWebhookWorker.on('completed', (job) => {
    logger.info(
        `Shopify webhook job ${job.id} completed for integration ${job.data.integrationId}`
    );
});

shopifyWebhookWorker.on('failed', (job, err) => {
    logger.error(
        { err },
        `Shopify webhook job ${job?.id} failed for integration ${job?.data.integrationId}`
    );
});
