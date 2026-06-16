import { Worker } from 'bullmq';
import { getRedisConnectionOptions } from '../../config/redis.config.js';
import { processExportJob } from './exports.service.js';
import logger from '../../utils/logger.util.js';

export function initExportWorker() {
    const worker = new Worker(
        'export-queue',
        async (job) => {
            const {
                jobId,
                entityType,
                format,
                selectedColumns,
                filters,
                organizationId
            } = job.data;
            await processExportJob(
                jobId,
                entityType,
                format,
                selectedColumns || [],
                (filters as Record<string, unknown>) || {},
                organizationId
            );
        },
        { connection: getRedisConnectionOptions() }
    );

    worker.on('completed', (job) => {
        logger.info(`Export job ${job.id} completed`);
    });

    worker.on('failed', (job, err) => {
        logger.error(
            {
                err: err instanceof Error ? err.message : String(err),
                stack: err instanceof Error ? err.stack : undefined,
                jobId: job?.id
            },
            'Export job worker failed'
        );
    });

    return worker;
}
