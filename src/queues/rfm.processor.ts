import { Worker, Job } from 'bullmq';
import { getRedisConnectionOptions } from '../config/redis.config.js';
import logger from '../utils/logger.util.js';
import {
    processRFMSynchronously,
    processSingleCustomerRFM
} from './rfm.queue.js';

interface RFMJobData {
    organizationId: string;
    customerId?: string;
    daysWindow?: number;
}

export const rfmWorker = new Worker<RFMJobData>(
    'rfm-score-queue',
    async (job: Job<RFMJobData>) => {
        const { organizationId, customerId, daysWindow } = job.data;

        logger.info(`Processing RFM job ${job.id} for org ${organizationId}`);

        try {
            if (customerId) {
                logger.info(`Processing single customer ${customerId}`);
                await processSingleCustomerRFM(customerId, organizationId);
            } else {
                const processed = await processRFMSynchronously(
                    organizationId,
                    daysWindow
                );
                logger.info(
                    `RFM batch complete for ${organizationId}: ${processed} customers`
                );
            }

            return { success: true, organizationId, customerId };
        } catch (error) {
            logger.error(
                `RFM job ${job.id} failed: ${error instanceof Error ? error.stack : error}`
            );
            throw error;
        }
    },
    {
        connection: getRedisConnectionOptions(),
        concurrency: 3
    }
);

rfmWorker.on('completed', (job) => {
    logger.info(
        `RFM job ${job.id} completed for org ${job.data.organizationId}`
    );
});

rfmWorker.on('failed', (job, err) => {
    logger.error(`RFM job ${job?.id} failed: ${err.message}`);
});
