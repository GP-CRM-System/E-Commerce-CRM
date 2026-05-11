import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import prisma from '../../config/prisma.config.js';
import * as exportService from './exports.service.js';
import {
    isB2Configured,
    getSignedDownloadUrl
} from '../../config/b2.config.js';
import {
    ResponseHandler,
    HttpStatus,
    ErrorCode
} from '../../utils/response.util.js';
import { asyncHandler } from '../../middlewares/error.middleware.js';
import { getPagination } from '../../utils/pagination.util.js';
import { AuditService } from '../audit/audit.service.js';

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

        // Generate signed URL from B2 (no local file fallback)
        if (isB2Configured && job.filePath.startsWith('exports/')) {
            const signedUrlResult = await getSignedDownloadUrl(job.filePath);
            if (!signedUrlResult.success) {
                return ResponseHandler.error(
                    res,
                    'Failed to generate download URL',
                    ErrorCode.SERVER_ERROR,
                    HttpStatus.INTERNAL_SERVER_ERROR
                );
            }

            await AuditService.log({
                organizationId: job.organizationId,
                userId: req.session.userId,
                action: 'DOWNLOAD',
                targetId: job.id,
                targetType: 'EXPORT_JOB'
            });

            return ResponseHandler.success(
                res,
                'Export download signed URL generated',
                HttpStatus.OK,
                { downloadUrl: signedUrlResult.url }
            );
        }

        return ResponseHandler.error(
            res,
            'Export file not available for download. Ensure B2 storage is configured.',
            ErrorCode.RESOURCE_NOT_FOUND,
            HttpStatus.NOT_FOUND
        );
    }
);
