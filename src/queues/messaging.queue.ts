import { Queue } from 'bullmq';
import { getRedisConnectionOptions } from '../config/redis.config.js';
import logger from '../utils/logger.util.js';

// Setup Queues
export const webhookQueue = new Queue('messaging-webhook-queue', {
    connection: getRedisConnectionOptions()
});

export const outboundQueue = new Queue('messaging-outbound-queue', {
    connection: getRedisConnectionOptions()
});

export const statusQueue = new Queue('messaging-status-queue', {
    connection: getRedisConnectionOptions()
});

// Enqueue Helpers
export async function addWebhookJob(payload: any) {
    try {
        const job = await webhookQueue.add('process-webhook', payload, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: true,
            removeOnFail: 100
        });
        return { jobId: job.id, queued: true };
    } catch (err) {
        logger.error({ err }, '[Queue] Failed to enqueue webhook job');
        throw err;
    }
}

export async function addOutboundJob(data: {
    messageId: string;
    organizationId: string;
    conversationId: string;
}) {
    try {
        const job = await outboundQueue.add('send-outbound', data, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: true,
            removeOnFail: 100
        });
        return { jobId: job.id, queued: true };
    } catch (err) {
        logger.error({ err }, '[Queue] Failed to enqueue outbound message job');
        throw err;
    }
}

export async function addStatusJob(data: {
    statusEntry: any;
    organizationId: string;
}) {
    try {
        const job = await statusQueue.add('process-status', data, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: true,
            removeOnFail: 100
        });
        return { jobId: job.id, queued: true };
    } catch (err) {
        logger.error({ err }, '[Queue] Failed to enqueue status job');
        throw err;
    }
}
