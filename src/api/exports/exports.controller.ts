import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import prisma from '../../config/prisma.config.js';
import {
    ResponseHandler,
    HttpStatus,
    ErrorCode
} from '../../utils/response.util.js';
import { asyncHandler } from '../../middlewares/error.middleware.js';
import { getPagination } from '../../utils/pagination.util.js';
import { toCSV, toExcel } from '../../utils/parser.util.js';

export const create = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId;
        if (!organizationId) {
            return ResponseHandler.error(
                res,
                'No active organization',
                ErrorCode.VALIDATION_ERROR,
                HttpStatus.BAD_REQUEST
            );
        }

        const userId = req.session.userId;
        if (!userId) {
            return ResponseHandler.error(
                res,
                'User not found',
                ErrorCode.VALIDATION_ERROR,
                HttpStatus.BAD_REQUEST
            );
        }

        const { entityType, format, selectedColumns, filters } = req.body;

        if (!entityType || !format) {
            return ResponseHandler.error(
                res,
                'entityType and format are required',
                ErrorCode.VALIDATION_ERROR,
                HttpStatus.BAD_REQUEST
            );
        }

        const job = await prisma.exportJob.create({
            data: {
                organizationId,
                createdByUserId: userId,
                entityType,
                format,
                selectedColumns: selectedColumns || [],
                filters: filters || {},
                status: 'PENDING'
            }
        });

        processExportJob(
            job.id,
            entityType,
            format,
            selectedColumns || [],
            filters || {},
            organizationId
        );

        return ResponseHandler.created(res, 'Export job created', job);
    }
);

async function processExportJob(
    jobId: string,
    entityType: string,
    format: string,
    selectedColumns: string[],
    filters: Record<string, unknown>,
    organizationId: string
) {
    await prisma.exportJob.update({
        where: { id: jobId },
        data: { status: 'PROCESSING' }
    });

    try {
        let data: Record<string, unknown>[] = [];

        if (entityType === 'customer') {
            const where: Record<string, unknown> = { organizationId };

            // Apply filters for customers
            if (filters.city) where.city = filters.city;
            if (filters.source) where.source = filters.source;
            if (filters.lifecycleStage)
                where.lifecycleStage = filters.lifecycleStage;
            if (filters.createdAtStart || filters.createdAtEnd) {
                const createdAtFilter: Record<string, unknown> = {};
                if (filters.createdAtStart)
                    createdAtFilter.gte = new Date(
                        filters.createdAtStart as string
                    );
                if (filters.createdAtEnd)
                    createdAtFilter.lte = new Date(
                        filters.createdAtEnd as string
                    );
                where.createdAt = createdAtFilter;
            }

            const customers = await prisma.customer.findMany({
                where: where as object,
                take: 10000
            });
            data = customers.map((c: (typeof customers)[number]) => ({
                name: c.name,
                email: c.email,
                phone: c.phone,
                city: c.city,
                source: c.source,
                lifecycleStage: c.lifecycleStage,
                externalId: c.externalId
            }));
        } else if (entityType === 'product') {
            const where: Record<string, unknown> = { organizationId };

            // Apply filters for products
            if (filters.category) where.category = filters.category;
            if (filters.status) where.status = filters.status;
            if (filters.minPrice !== undefined) {
                where.price = {
                    ...((where.price as object) || {}),
                    gte: Number(filters.minPrice)
                };
            }
            if (filters.maxPrice !== undefined) {
                where.price = {
                    ...((where.price as object) || {}),
                    lte: Number(filters.maxPrice)
                };
            }

            const products = await prisma.product.findMany({
                where: where as object,
                take: 10000
            });
            data = products.map((p: (typeof products)[number]) => ({
                name: p.name,
                price: Number(p.price),
                sku: p.sku,
                category: p.category,
                inventory: p.inventory,
                status: p.status
            }));
        } else if (entityType === 'order') {
            const where: Record<string, unknown> = { organizationId };

            // Apply filters for orders
            if (filters.paymentStatus)
                where.paymentStatus = filters.paymentStatus;
            if (filters.shippingStatus)
                where.shippingStatus = filters.shippingStatus;
            if (filters.fulfillmentStatus)
                where.fulfillmentStatus = filters.fulfillmentStatus;
            if (filters.createdAtStart || filters.createdAtEnd) {
                const createdAtFilter: Record<string, unknown> = {};
                if (filters.createdAtStart)
                    createdAtFilter.gte = new Date(
                        filters.createdAtStart as string
                    );
                if (filters.createdAtEnd)
                    createdAtFilter.lte = new Date(
                        filters.createdAtEnd as string
                    );
                where.createdAt = createdAtFilter;
            }

            const orders = await prisma.order.findMany({
                where: where as object,
                take: 10000,
                include: { customer: true }
            });
            data = orders.map((o: (typeof orders)[number]) => ({
                externalId: o.externalId,
                customerName: o.customer?.name,
                paymentStatus: o.paymentStatus,
                shippingStatus: o.shippingStatus,
                totalAmount: Number(o.totalAmount),
                currency: o.currency
            }));
        }

        let buffer: Buffer;
        const fileName = `${entityType}-export-${Date.now()}.${format}`;

        if (format === 'csv') {
            const csv = await toCSV(data);
            buffer = Buffer.from(csv);
        } else {
            buffer = await toExcel(data);
        }

        const fs = await import('fs');
        const path = await import('path');
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const filePath = path.join(tempDir, fileName);
        fs.writeFileSync(filePath, buffer);

        await prisma.exportJob.update({
            where: { id: jobId },
            data: {
                status: 'COMPLETED',
                fileName,
                filePath,
                totalRows: data.length,
                completedAt: new Date()
            }
        });
    } catch {
        await prisma.exportJob.update({
            where: { id: jobId },
            data: { status: 'FAILED' }
        });
    }
}

export const list = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId;
        if (!organizationId) {
            return ResponseHandler.error(
                res,
                'No active organization',
                ErrorCode.VALIDATION_ERROR,
                HttpStatus.BAD_REQUEST
            );
        }

        const { skip, take, page, limit } = getPagination(
            {
                page: (req.query.page as string) || '1',
                limit: (req.query.limit as string) || '20'
            },
            20
        );

        const [jobs, total] = await Promise.all([
            prisma.exportJob.findMany({
                where: { organizationId },
                orderBy: { createdAt: 'desc' },
                take,
                skip
            }),
            prisma.exportJob.count({ where: { organizationId } })
        ]);

        return ResponseHandler.paginated(
            res,
            jobs,
            'Export jobs fetched successfully',
            page,
            limit,
            total
        );
    }
);

export const get = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId;
        if (!organizationId) {
            return ResponseHandler.error(
                res,
                'No active organization',
                ErrorCode.VALIDATION_ERROR,
                HttpStatus.BAD_REQUEST
            );
        }

        const job = await prisma.exportJob.findFirst({
            where: { id: req.params.id as string, organizationId }
        });
        if (!job) {
            return ResponseHandler.error(
                res,
                'Export job not found',
                ErrorCode.RESOURCE_NOT_FOUND,
                HttpStatus.NOT_FOUND
            );
        }

        return ResponseHandler.success(
            res,
            'Export job fetched successfully',
            HttpStatus.OK,
            job
        );
    }
);

export const download = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId;
        if (!organizationId) {
            return ResponseHandler.error(
                res,
                'No active organization',
                ErrorCode.VALIDATION_ERROR,
                HttpStatus.BAD_REQUEST
            );
        }

        const job = await prisma.exportJob.findFirst({
            where: { id: req.params.id as string, organizationId }
        });
        if (!job) {
            return ResponseHandler.error(
                res,
                'Export job not found',
                ErrorCode.RESOURCE_NOT_FOUND,
                HttpStatus.NOT_FOUND
            );
        }

        if (job.status !== 'COMPLETED' || !job.filePath) {
            return ResponseHandler.error(
                res,
                'Export not ready',
                ErrorCode.VALIDATION_ERROR,
                HttpStatus.BAD_REQUEST
            );
        }

        const fs = await import('fs');
        const path = await import('path');

        // Prevent directory traversal by resolving the path and ensuring it's in the temp directory
        const resolvedPath = path.resolve(job.filePath);
        const tempDir = path.resolve(process.cwd(), 'temp');

        if (!resolvedPath.startsWith(tempDir)) {
            return ResponseHandler.error(
                res,
                'Invalid file path',
                ErrorCode.RESOURCE_NOT_ALLOWED,
                HttpStatus.FORBIDDEN
            );
        }

        if (!fs.existsSync(resolvedPath)) {
            return ResponseHandler.error(
                res,
                'File not found',
                ErrorCode.RESOURCE_NOT_FOUND,
                HttpStatus.NOT_FOUND
            );
        }

        const fileBuffer = fs.readFileSync(job.filePath);
        const mimeType =
            job.format === 'csv'
                ? 'text/csv'
                : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

        res.setHeader('Content-Type', mimeType);
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${job.fileName}"`
        );
        res.send(fileBuffer);
    }
);
