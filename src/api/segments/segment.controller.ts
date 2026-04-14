import type { Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware.js';
import {
    ResponseHandler,
    HttpStatus,
    NotFoundError
} from '../../utils/response.util.js';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import * as segmentService from './segment.service.js';
import prisma from '../../config/prisma.config.js';
import { buildPrismaWhere } from './segment.utils.js';
import { processExportJob } from '../exports/exports.controller.js';
import type {
    CreateSegmentInput,
    UpdateSegmentInput,
    ListSegmentsInput,
    ListSegmentCustomersInput
} from './segment.schemas.js';

export const createSegment = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const data: CreateSegmentInput = req.body;

        const segment = await segmentService.createSegment(
            data,
            organizationId
        );

        ResponseHandler.success(
            res,
            'Segment created successfully',
            HttpStatus.CREATED,
            segment,
            req.url
        );
    }
);

export const listSegments = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const { limit, offset, search } =
            req.query as unknown as ListSegmentsInput;

        const { segments, total } = await segmentService.getSegments(
            organizationId,
            limit,
            offset,
            search
        );

        ResponseHandler.paginated(
            res,
            segments,
            'Segments fetched successfully',
            limit > 0 ? Math.floor(offset / limit) + 1 : 1,
            limit,
            total,
            req.url
        );
    }
);

export const getSegment = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const segmentId = req.params.id as string;

        const segment = await segmentService.getSegmentById(
            segmentId,
            organizationId
        );

        ResponseHandler.success(
            res,
            'Segment fetched successfully',
            HttpStatus.OK,
            segment,
            req.url
        );
    }
);

export const updateSegment = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const segmentId = req.params.id as string;
        const data: UpdateSegmentInput = req.body;

        const segment = await segmentService.updateSegment(
            segmentId,
            data,
            organizationId
        );

        ResponseHandler.success(
            res,
            'Segment updated successfully',
            HttpStatus.OK,
            segment,
            req.url
        );
    }
);

export const deleteSegment = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const segmentId = req.params.id as string;

        const segment = await segmentService.getSegmentById(
            segmentId,
            organizationId
        );

        if (!segment) {
            throw new NotFoundError('Segment not found');
        }

        await segmentService.deleteSegment(segmentId, organizationId);

        ResponseHandler.success(
            res,
            'Segment deleted successfully',
            HttpStatus.NO_CONTENT,
            null,
            req.url
        );
    }
);

export const getSegmentCustomers = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const segmentId = req.params.id as string;
        const { limit, offset, sortBy, sortOrder } =
            req.query as unknown as ListSegmentCustomersInput;

        const { customers, total } = await segmentService.getSegmentCustomers(
            segmentId,
            organizationId,
            limit,
            offset,
            sortBy,
            sortOrder
        );

        ResponseHandler.paginated(
            res,
            customers,
            'Segment customers fetched successfully',
            limit > 0 ? Math.floor(offset / limit) + 1 : 1,
            limit,
            total,
            req.url
        );
    }
);

export const getSegmentCount = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const segmentId = req.params.id as string;

        const count = await segmentService.getSegmentCustomerCount(
            segmentId,
            organizationId
        );

        ResponseHandler.success(
            res,
            'Segment customer count fetched successfully',
            HttpStatus.OK,
            { count },
            req.url
        );
    }
);

export const previewSegment = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const segmentId = req.params.id as string;

        const preview = await segmentService.getSegmentPreview(
            segmentId,
            organizationId
        );

        ResponseHandler.success(
            res,
            'Segment preview fetched successfully',
            HttpStatus.OK,
            preview,
            req.url
        );
    }
);

export const exportSegment = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const userId = req.session.userId!;
        const segmentId = req.params.id as string;
        const { format = 'csv' } = req.body as { format?: string };

        const segment = await segmentService.getSegmentById(
            segmentId,
            organizationId
        );

        const segmentWhere = buildPrismaWhere(segment.filter);

        const job = await prisma.exportJob.create({
            data: {
                organizationId,
                createdByUserId: userId,
                entityType: 'customer',
                format,
                filters: { prismaWhere: segmentWhere } as object,
                status: 'PENDING'
            }
        });

        processExportJob(
            job.id,
            'customer',
            format,
            [],
            { prismaWhere: segmentWhere },
            organizationId
        ).catch((err) => {
            import('../../utils/logger.util.js').then(({ default: logger }) =>
                logger.error(`Segment export job ${job.id} failed: ${err}`)
            );
        });

        ResponseHandler.success(
            res,
            'Segment export job created',
            HttpStatus.ACCEPTED,
            { jobId: job.id, segmentId },
            req.url
        );
    }
);
