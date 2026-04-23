import { Queue } from 'bullmq';
import logger from '../../utils/logger.util.js';
import prisma from '../../config/prisma.config.js';
import { env } from '../../config/env.config.js';
import {
    IMPORT_CONFIG,
    IMPORT_JOB_STATUS
} from '../../constants/import.constants.js';
import {
    parseFile,
    getFileHeaders,
    suggestMapping,
    applyMapping,
    validateFileType,
    validateFileSize
} from '../../utils/parser.util.js';
import type {
    EntityType,
    ColumnMapping,
    ParsedRow
} from '../../types/import.types.js';
import {
    redisConnection,
    isRedisAvailable,
    checkRedisHealth
} from '../../config/redis.config.js';
import type { ImportJobErrorUncheckedCreateInput } from '../../generated/prisma/models/ImportJobError.js';
import { processRow } from './imports.processor.js';
import { AuditService } from '../audit/audit.service.js';

const importQueue: Queue | null = isRedisAvailable
    ? new Queue('import-queue', { connection: redisConnection })
    : null;

export async function createImportJob(
    file: {
        originalname: string;
        buffer: Buffer;
        size: number;
    },
    entityType: EntityType,
    organizationId: string,
    userId: string,
    options: {
        hasHeader?: boolean;
        mapping?: ColumnMapping;
        duplicateStrategy?: 'create_only' | 'upsert';
    } = {}
) {
    const { mapping: customMapping, duplicateStrategy = 'create_only' } =
        options;

    if (!validateFileType(file.originalname)) {
        throw new Error('Unsupported file type. Allowed: .csv, .xlsx');
    }

    if (!validateFileSize(file.size)) {
        throw new Error(
            `File too large. Max size: ${IMPORT_CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB`
        );
    }

    const fileType = file.originalname.toLowerCase().endsWith('.csv')
        ? 'csv'
        : 'xlsx';

    const rows = await parseFile(file.buffer, fileType);
    const headers = getFileHeaders(rows);

    const mapping = customMapping || suggestMapping(headers, entityType);
    const mappedRows = applyMapping(rows, mapping);

    // Store file temporarily for queue worker to read
    const fs = await import('fs');
    const path = await import('path');
    const tempDir = path.join(process.cwd(), 'temp', 'imports');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const tempFileName = `import-${Date.now()}-${file.originalname}`;
    const tempFilePath = path.join(tempDir, tempFileName);
    fs.writeFileSync(tempFilePath, file.buffer);

    const job = await prisma.importJob.create({
        data: {
            organizationId,
            createdByUserId: userId,
            entityType,
            fileName: file.originalname,
            fileType,
            status: IMPORT_JOB_STATUS.PENDING,
            mapping: mapping as object,
            totalRows: mappedRows.length,
            processedRows: 0,
            successfulRows: 0,
            failedRows: 0
        }
    });

    await AuditService.log({
        organizationId,
        userId,
        action: 'CREATE',
        targetId: job.id,
        targetType: 'IMPORT_JOB'
    });

    if (!validateFileType(file.originalname)) {
        throw new Error('Unsupported file type. Allowed: .csv, .xlsx');
    }

    const health = await checkRedisHealth();

    if (health.available && importQueue) {
        await importQueue.add('process-import', {
            jobId: job.id,
            filePath: tempFilePath,
            entityType,
            organizationId,
            duplicateStrategy
        });
        logger.info(`Import job ${job.id} added to queue (async)`);
        return job;
    }

    // Synchronous fallback (only when Redis is unavailable)
    if (!health.available) {
        logger.warn(
            `Redis unavailable (${health.error}) - running import ${job.id} synchronously. Large imports may timeout.`
        );
    } else if (!importQueue) {
        logger.warn(
            `Import queue not initialized - running import ${job.id} synchronously. Large imports may timeout.`
        );
    }
    processImportJob(
        job.id,
        mappedRows,
        entityType,
        organizationId,
        duplicateStrategy,
        tempFilePath // Pass to delete after sync processing
    );

    return job;
}

async function processImportJob(
    jobId: string,
    rows: ParsedRow[],
    entityType: EntityType,
    organizationId: string,
    duplicateStrategy: 'create_only' | 'upsert',
    tempFilePath?: string
) {
    const batchSize = IMPORT_CONFIG.BATCH_SIZE[entityType];
    let successfulRows = 0;
    let failedRows = 0;
    const createdRecordIds: string[] = [];

    const existingJob = await prisma.importJob.findUnique({
        where: { id: jobId }
    });

    if (!existingJob) {
        logger.error({ jobId }, 'Import job not found');
        throw new Error(`Import job not found: ${jobId}`);
    }

    if (existingJob.status !== 'PENDING') {
        logger.warn(
            { jobId, status: existingJob.status },
            'Import job already processed'
        );
        return;
    }

    await prisma.importJob.update({
        where: { id: jobId },
        data: {
            status: IMPORT_JOB_STATUS.PROCESSING,
            startedAt: new Date()
        }
    });

    try {
        for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize);

            let batchSuccess = 0;
            let batchFailed = 0;

            for (const row of batch) {
                try {
                    const result = await processRow(
                        prisma,
                        row,
                        entityType,
                        organizationId,
                        duplicateStrategy
                    );
                    if (result.action === 'created') {
                        createdRecordIds.push(result.id);
                    }
                    batchSuccess++;
                } catch (error) {
                    batchFailed++;
                    const errorMessage =
                        error instanceof Error
                            ? error.message
                            : 'Unknown error';

                    const errorData: ImportJobErrorUncheckedCreateInput = {
                        importJobId: jobId,
                        rowNumber: row.rowNumber,
                        errorCode: 'VALIDATION_ERROR',
                        message: errorMessage,
                        rawRow: row.data as object
                    };

                    await prisma.importJobError.create({
                        data: errorData
                    });
                }
            }

            successfulRows += batchSuccess;
            failedRows += batchFailed;
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
                processedRows: rows.length,
                createdRecordIds
            }
        });

        const jobDetails = await prisma.importJob.findUnique({
            where: { id: jobId },
            select: { fileName: true, createdByUserId: true }
        });

        const { createImportNotification } =
            await import('../notifications/notification.service.js');

        if (jobDetails) {
            await createImportNotification({
                organizationId,
                userId: jobDetails.createdByUserId,
                jobId,
                fileName: jobDetails.fileName,
                status:
                    finalStatus === 'COMPLETED'
                        ? 'completed'
                        : finalStatus === 'PARTIALLY_FAILED'
                          ? 'partial'
                          : 'failed',
                successCount: successfulRows,
                failureCount: failedRows
            });

            if (finalStatus !== 'COMPLETED') {
                const members = await prisma.member.findMany({
                    where: {
                        organizationId,
                        role: { in: ['admin', 'root'] }
                    },
                    include: { user: { select: { email: true } } }
                });

                const { sendNotificationEmail } =
                    await import('../../utils/email.util.js');

                for (const member of members) {
                    if (member.user.email) {
                        await sendNotificationEmail({
                            to: member.user.email,
                            data: {
                                type: 'import_failed',
                                title:
                                    finalStatus === 'PARTIALLY_FAILED'
                                        ? 'Import Completed with Errors'
                                        : 'Import Failed',
                                message: `Import of ${jobDetails.fileName} finished with ${failedRows} errors.`,
                                actionUrl: `${env.appUrl}/imports/${jobId}`
                            }
                        });
                    }
                }
            }
        }

        logger.info(
            `Import job ${jobId} completed with status: ${finalStatus}`
        );
    } catch (error) {
        logger.error(`Import job ${jobId} failed: ${error}`);

        // Only proceed with failure update/notification if the status isn't already final
        const currentJob = await prisma.importJob.findUnique({
            where: { id: jobId },
            select: { status: true, fileName: true, createdByUserId: true }
        });

        if (currentJob && currentJob.status === IMPORT_JOB_STATUS.PROCESSING) {
            await prisma.importJob.update({
                where: { id: jobId },
                data: {
                    status: IMPORT_JOB_STATUS.FAILED,
                    completedAt: new Date()
                }
            });

            const { createImportNotification } =
                await import('../notifications/notification.service.js');
            await createImportNotification({
                organizationId,
                userId: currentJob.createdByUserId,
                jobId,
                fileName: currentJob.fileName,
                status: 'failed',
                successCount: 0,
                failureCount: 0
            });
        }
    } finally {
        // Clean up temp file
        if (tempFilePath) {
            try {
                const fs = await import('fs');
                if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
            } catch (err) {
                logger.error(
                    `Failed to delete temp file ${tempFilePath}: ${err}`
                );
            }
        }
    }
}

// Entity row processing logic moved to imports.processor.ts

export async function getImportJob(jobId: string, organizationId: string) {
    return prisma.importJob.findFirst({
        where: { id: jobId, organizationId },
        include: { errors: { take: 100, orderBy: { rowNumber: 'asc' } } }
    });
}

export async function listImportJobs(
    organizationId: string,
    filters: { entityType?: string; status?: string },
    take: number,
    skip: number
) {
    const where: Record<string, unknown> = { organizationId };
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.status) where.status = filters.status;

    const [jobs, total] = await Promise.all([
        prisma.importJob.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take,
            skip
        }),
        prisma.importJob.count({ where })
    ]);

    return { jobs, total };
}

export async function getImportJobErrors(
    jobId: string,
    organizationId: string,
    take: number,
    skip: number
) {
    const job = await prisma.importJob.findFirst({
        where: { id: jobId, organizationId }
    });
    if (!job) throw new Error('Job not found');

    const [errors, total] = await Promise.all([
        prisma.importJobError.findMany({
            where: { importJobId: jobId },
            orderBy: { rowNumber: 'asc' },
            take,
            skip
        }),
        prisma.importJobError.count({ where: { importJobId: jobId } })
    ]);

    return { errors, total };
}

export async function closeImportQueue() {
    if (importQueue) {
        await importQueue.close();
    }
}

export async function rollbackImportJob(
    jobId: string,
    organizationId: string
): Promise<{ deletedCount: number }> {
    const job = await prisma.importJob.findFirst({
        where: { id: jobId, organizationId }
    });

    if (!job) {
        throw new Error('Import job not found');
    }

    if (job.status === 'PROCESSING') {
        throw new Error('Cannot rollback a job that is currently processing');
    }

    const recordIds = job.createdRecordIds || [];
    if (!job.createdRecordIds || recordIds.length === 0) {
        logger.warn(
            { jobId },
            'No createdRecordIds found - job may predate this feature. Skipping rollback to avoid unintended data deletion.'
        );
        return { deletedCount: 0 };
    }

    let totalDeleted = 0;
    const batchSize = 1000;

    for (let i = 0; i < recordIds.length; i += batchSize) {
        const batchIds = recordIds.slice(i, i + batchSize);
        let count = 0;

        switch (job.entityType) {
            case 'customer':
                count = await prisma.customer
                    .deleteMany({
                        where: { id: { in: batchIds }, organizationId }
                    })
                    .then((r) => r.count);
                break;
            case 'product':
                count = await prisma.product
                    .deleteMany({
                        where: { id: { in: batchIds }, organizationId }
                    })
                    .then((r) => r.count);
                break;
            case 'order':
                count = await prisma.order
                    .deleteMany({
                        where: { id: { in: batchIds }, organizationId }
                    })
                    .then((r) => r.count);
                break;
        }
        totalDeleted += count;
    }

    await prisma.importJob.update({
        where: { id: jobId },
        data: {
            status: 'CANCELLED',
            summary: {
                ...(typeof job.summary === 'object' ? job.summary : {}),
                rollbackAt: new Date().toISOString(),
                deletedCount: totalDeleted
            }
        }
    });

    await AuditService.log({
        organizationId,
        userId: job.createdByUserId,
        action: 'DELETE',
        targetId: jobId,
        targetType: 'IMPORT_JOB'
    });

    return { deletedCount: totalDeleted };
}
