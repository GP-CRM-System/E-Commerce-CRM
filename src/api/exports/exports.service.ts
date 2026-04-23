import { Queue } from 'bullmq';
import prisma from '../../config/prisma.config.js';
import type {
    Prisma,
    CustomerSource,
    CustomerLifecycleStage
} from '../../generated/prisma/client.js';
import {
    redisConnection,
    isRedisAvailable,
    checkRedisHealth
} from '../../config/redis.config.js';
import { toCSV, toExcel } from '../../utils/parser.util.js';
import logger from '../../utils/logger.util.js';
import { uploadToB2, isB2Configured } from '../../config/b2.config.js';

function getExportQueue(): Queue | null {
    if (!isRedisAvailable) return null;
    return new Queue('export-queue', { connection: redisConnection });
}

export async function createExportJob(
    organizationId: string,
    userId: string,
    data: {
        entityType: string;
        format: 'csv' | 'xlsx';
        selectedColumns?: string[];
        filters?: Prisma.InputJsonValue;
    }
) {
    const job = await prisma.exportJob.create({
        data: {
            organizationId,
            createdByUserId: userId,
            entityType: data.entityType,
            format: data.format,
            selectedColumns: data.selectedColumns || [],
            filters: (data.filters as Prisma.InputJsonValue) || {},
            status: 'PENDING'
        }
    });

    const health = await checkRedisHealth();
    const exportQueue = health.available ? getExportQueue() : null;

    if (exportQueue) {
        await exportQueue.add('process-export', {
            jobId: job.id,
            organizationId,
            ...data
        });
        logger.info(`Export job ${job.id} added to queue (async)`);
    } else {
        // Sync fallback
        if (!health.available) {
            logger.warn(
                `Redis unavailable (${health.error}) - running export ${job.id} synchronously. Large exports may timeout.`
            );
        } else {
            logger.warn(
                `Export queue not initialized - running export ${job.id} synchronously. Large exports may timeout.`
            );
        }
        processExportJob(
            job.id,
            data.entityType,
            data.format,
            data.selectedColumns || [],
            (data.filters as Record<string, unknown>) || {},
            organizationId
        );
    }

    return job;
}

export async function processExportJob(
    jobId: string,
    entityType: string,
    format: string,
    selectedColumns: string[],
    filters: Record<string, unknown>,
    organizationId: string
) {
    const existingJob = await prisma.exportJob.findUnique({
        where: { id: jobId }
    });

    if (!existingJob) {
        logger.warn(
            { jobId },
            'Export job not found - may have been processed previously or cleaned up'
        );
        return null;
    }

    if (existingJob.status !== 'PENDING') {
        logger.warn(
            { jobId, status: existingJob.status },
            'Export job already processed'
        );
        return existingJob;
    }

    await prisma.exportJob.update({
        where: { id: jobId },
        data: { status: 'PROCESSING' }
    });

    try {
        let exportData: Record<string, unknown>[] = [];

        if (entityType === 'customer') {
            const where: Prisma.CustomerWhereInput = { organizationId };
            if (filters.prismaWhere)
                Object.assign(
                    where,
                    filters.prismaWhere as Record<string, unknown>
                );
            where.organizationId = organizationId; // Re-assert isolation

            if (filters.city) where.city = filters.city as string;
            if (filters.source) where.source = filters.source as CustomerSource;
            if (filters.lifecycleStage)
                where.lifecycleStage =
                    filters.lifecycleStage as CustomerLifecycleStage;

            const customers = await prisma.customer.findMany({
                where,
                take: 50000
            });
            exportData = customers.map((c) => ({
                id: c.id,
                name: c.name,
                email: c.email,
                phone: c.phone,
                city: c.city,
                source: c.source,
                lifecycleStage: c.lifecycleStage,
                externalId: c.externalId,
                createdAt: c.createdAt
            }));
        } else if (entityType === 'product') {
            const where: Prisma.ProductWhereInput = { organizationId };
            const products = await prisma.product.findMany({
                where,
                take: 50000
            });
            exportData = products.map((p) => ({
                id: p.id,
                name: p.name,
                price: Number(p.price),
                sku: p.sku,
                category: p.category,
                inventory: p.inventory,
                status: p.status
            }));
        } else if (entityType === 'order') {
            const where: Prisma.OrderWhereInput = { organizationId };
            const orders = await prisma.order.findMany({
                where,
                take: 50000,
                include: { customer: true }
            });
            exportData = orders.map((o) => ({
                id: o.id,
                externalId: o.externalId,
                customerName: o.customer?.name,
                totalAmount: Number(o.totalAmount),
                paymentStatus: o.paymentStatus,
                shippingStatus: o.shippingStatus,
                createdAt: o.createdAt
            }));
        }

        const fileName = `${entityType}-export-${Date.now()}.${format}`;
        let buffer: Buffer;

        if (format === 'csv') {
            const csv = await toCSV(exportData);
            buffer = Buffer.from(csv);
        } else {
            buffer = await toExcel(exportData);
        }

        const b2Key = `exports/${jobId}/${fileName}`;

        if (isB2Configured) {
            const uploadResult = await uploadToB2(b2Key, buffer);
            if (!uploadResult.success) {
                throw new Error(`Failed to upload to B2: ${uploadResult.error}`);
            }
            await prisma.exportJob.update({
                where: { id: jobId },
                data: {
                    status: 'COMPLETED',
                    fileName,
                    filePath: b2Key,
                    totalRows: exportData.length,
                    completedAt: new Date()
                }
            });
        } else {
            const fs = await import('fs');
            const path = await import('path');
            const tempDir = path.join(process.cwd(), 'temp', 'exports');
            if (!fs.existsSync(tempDir))
                fs.mkdirSync(tempDir, { recursive: true });
            const filePath = path.join(tempDir, fileName);
            fs.writeFileSync(filePath, buffer);

            await prisma.exportJob.update({
                where: { id: jobId },
                data: {
                    status: 'COMPLETED',
                    fileName,
                    filePath,
                    totalRows: exportData.length,
                    completedAt: new Date()
                }
            });
        }
    } catch (error) {
        logger.error({ error, jobId }, 'Export job failed');
        try {
            await prisma.exportJob.update({
                where: { id: jobId },
                data: { status: 'FAILED' }
            });
        } catch {
            logger.warn({ jobId }, 'Failed to update job status - job may not exist');
        }
    }
}
