import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import prisma from '../../config/prisma.config.js';
import * as exportService from './exports.service.js';
import {
    ResponseHandler,
    HttpStatus,
    ErrorCode
} from '../../utils/response.util.js';
import { asyncHandler } from '../../middlewares/error.middleware.js';
import { getPagination } from '../../utils/pagination.util.js';

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

        const job = await exportService.createExportJob(
            organizationId,
            userId,
            { entityType, format, selectedColumns, filters }
        );

        return ResponseHandler.created(res, 'Export job created', job);
    }
);

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
