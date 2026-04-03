import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import * as importService from './imports.service.js';
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

        const reqWithFile = req as unknown as {
            file?: { originalname: string; buffer: Buffer; size: number };
        };
        const file = reqWithFile.file;
        if (!file) {
            return ResponseHandler.error(
                res,
                'No file uploaded',
                ErrorCode.VALIDATION_ERROR,
                HttpStatus.BAD_REQUEST
            );
        }

        const fileExt = file.originalname.toLowerCase().split('.').pop();
        if (fileExt !== 'csv' && fileExt !== 'xlsx' && fileExt !== 'xls') {
            return ResponseHandler.error(
                res,
                'Unsupported file type. Allowed: .csv, .xlsx, .xls',
                ErrorCode.VALIDATION_ERROR,
                HttpStatus.BAD_REQUEST
            );
        }

        const entityType = req.body.entityType as
            | 'customer'
            | 'product'
            | 'order';
        const duplicateStrategy = req.body.duplicateStrategy as
            | 'create_only'
            | 'upsert'
            | undefined;

        const job = await importService.createImportJob(
            {
                originalname: file.originalname,
                buffer: file.buffer,
                size: file.size
            },
            entityType,
            organizationId,
            userId,
            { duplicateStrategy }
        );

        return ResponseHandler.created(res, 'Import job created', job);
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

        const { jobs, total } = await importService.listImportJobs(
            organizationId,
            {
                entityType: req.query.entityType as string,
                status: req.query.status as string
            },
            take,
            skip
        );

        return ResponseHandler.paginated(
            res,
            jobs,
            'Import jobs fetched successfully',
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

        const job = await importService.getImportJob(
            req.params.id as string,
            organizationId
        );
        if (!job) {
            return ResponseHandler.error(
                res,
                'Import job not found',
                ErrorCode.RESOURCE_NOT_FOUND,
                HttpStatus.NOT_FOUND
            );
        }

        return ResponseHandler.success(
            res,
            'Import job fetched successfully',
            HttpStatus.OK,
            job
        );
    }
);

export const getErrors = asyncHandler(
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
                limit: (req.query.limit as string) || '100'
            },
            100
        );

        const { errors, total } = await importService.getImportJobErrors(
            req.params.id as string,
            organizationId,
            take,
            skip
        );

        return ResponseHandler.paginated(
            res,
            errors,
            'Import errors fetched successfully',
            page,
            limit,
            total
        );
    }
);
