import { Worker, Job } from 'bullmq';
import prisma from '../config/prisma.config.js';
import logger from '../utils/logger.util.js';
import {
    IMPORT_CONFIG,
    IMPORT_JOB_STATUS
} from '../constants/import.constants.js';
import type { EntityType, ColumnMapping } from '../types/import.types.js';
import { redisConnection } from '../config/redis.config.js';
import { processRow } from '../api/imports/imports.processor.js';
import { parseFile, applyMapping } from '../utils/parser.util.js';

interface ImportJobData {
    jobId: string;
    filePath: string;
    entityType: EntityType;
    organizationId: string;
    duplicateStrategy: 'create_only' | 'upsert';
}

export const importWorker = new Worker<ImportJobData>(
    'import-queue',
    async (job: Job<ImportJobData>) => {
        const {
            jobId,
            filePath,
            entityType,
            organizationId,
            duplicateStrategy
        } = job.data;

        const batchSize = IMPORT_CONFIG.BATCH_SIZE[entityType];
        let successfulRows = 0;
        let failedRows = 0;

        try {
            // Read and parse file
            const fs = await import('fs');
            if (!fs.existsSync(filePath)) {
                throw new Error(`File not found: ${filePath}`);
            }

            const buffer = fs.readFileSync(filePath);
            const fileType = filePath.toLowerCase().endsWith('.csv')
                ? 'csv'
                : 'xlsx';

            // Get mapping from job record
            const importJobRecord = await prisma.importJob.findUnique({
                where: { id: jobId }
            });

            if (!importJobRecord) {
                throw new Error(`Import job record not found: ${jobId}`);
            }

            const rows = await parseFile(buffer, fileType);
            const mappedRows = applyMapping(
                rows,
                importJobRecord.mapping as unknown as ColumnMapping
            );

            await prisma.importJob.update({
                where: { id: jobId },
                data: {
                    status: IMPORT_JOB_STATUS.PROCESSING,
                    startedAt: new Date(),
                    totalRows: mappedRows.length
                }
            });

            for (let i = 0; i < mappedRows.length; i += batchSize) {
                const batch = mappedRows.slice(i, i + batchSize);

                const batchResult = await prisma.$transaction(async (tx) => {
                    let batchSuccess = 0;
                    let batchFailed = 0;

                    for (const row of batch) {
                        try {
                            await processRow(
                                tx,
                                row,
                                entityType,
                                organizationId,
                                duplicateStrategy
                            );
                            batchSuccess++;
                        } catch (error) {
                            batchFailed++;
                            const errorMessage =
                                error instanceof Error
                                    ? error.message
                                    : 'Unknown error';

                            await tx.importJobError.create({
                                data: {
                                    importJobId: jobId,
                                    rowNumber: row.rowNumber,
                                    errorCode: 'VALIDATION_ERROR',
                                    message: errorMessage,
                                    rawRow: row.data as object
                                }
                            });
                        }
                    }

                    return { batchSuccess, batchFailed };
                });

                successfulRows += batchResult.batchSuccess;
                failedRows += batchResult.batchFailed;

                // Removed status update inside batch loop to reduce DB contention
            }

            const finalStatus =
                failedRows > 0
                    ? successfulRows > 0
                        ? IMPORT_JOB_STATUS.PARTIALLY_FAILED
                        : IMPORT_JOB_STATUS.FAILED
                    : IMPORT_JOB_STATUS.COMPLETED;

            await prisma.importJob.update({
                where: { id: jobId },
                data: {
                    status: finalStatus,
                    completedAt: new Date(),
                    successfulRows,
                    failedRows,
                    processedRows: mappedRows.length
                }
            });

            logger.info(
                `Import job ${jobId} completed with status: ${finalStatus}`
            );

            // Clean up temp file
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (error) {
            logger.error(`Import job ${jobId} failed: ${error}`);

            await prisma.importJob.update({
                where: { id: jobId },
                data: {
                    status: IMPORT_JOB_STATUS.FAILED,
                    completedAt: new Date()
                }
            });

            // Clean up temp file even on failure
            try {
                const fs = await import('fs');
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            } catch (cleanupError) {
                logger.error(
                    `Cleanup failed for job ${jobId}: ${cleanupError}`
                );
            }
        }
    },
    {
        connection: redisConnection,
        concurrency: 5
    }
);

// Entity row processing logic moved to imports.processor.ts
