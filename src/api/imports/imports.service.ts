import { Queue } from 'bullmq';
import logger from '../../utils/logger.util.js';
import prisma from '../../config/prisma.config.js';
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
    isRedisAvailable
} from '../../config/redis.config.js';
import type { ImportJobErrorUncheckedCreateInput } from '../../generated/prisma/models/ImportJobError.js';
import { processRow } from './imports.processor.js';

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

    if (isRedisAvailable && importQueue) {
        await importQueue.add('process-import', {
            jobId: job.id,
            filePath: tempFilePath,
            entityType,
            organizationId,
            duplicateStrategy
        });
        logger.info(`Import job ${job.id} added to queue (file-based)`);
        return job;
    }

    // Synchronous fallback (only if Redis is NOT available)
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
                    await processRow(
                        prisma,
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

            // Updated: Removed status update inside batch loop to reduce DB contention
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
                processedRows: rows.length
            }
        });

        logger.info(
            `Import job ${jobId} completed with status: ${finalStatus}`
        );
    } catch (error) {
        logger.error(`Import job ${jobId} failed: ${error}`);

        await prisma.importJob.update({
            where: { id: jobId },
            data: {
                status: IMPORT_JOB_STATUS.FAILED,
                completedAt: new Date()
            }
        });
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
