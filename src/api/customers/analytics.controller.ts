import type { Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware.js';
import {
    computeRFM,
    getRFMDistribution,
    getCustomerAnalytics
} from './analytics.service.js';
import {
    ResponseHandler,
    HttpStatus,
    ErrorCode
} from '../../utils/response.util.js';
import logger from '../../utils/logger.util.js';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';

export const triggerRFMCompute = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const orgId = req.session?.activeOrganizationId;
        if (!orgId) {
            return ResponseHandler.error(
                res,
                'No active organization',
                ErrorCode.INVALID_TOKEN,
                HttpStatus.BAD_REQUEST,
                req.url
            );
        }

        const daysWindow = req.body?.daysWindow
            ? Number(req.body.daysWindow)
            : undefined;

        try {
            const result = await computeRFM(orgId as string, daysWindow);
            ResponseHandler.success(
                res,
                'RFM computation completed',
                HttpStatus.OK,
                result,
                req.url
            );
        } catch (error) {
            logger.error(
                `RFM compute error: ${error instanceof Error ? error.stack : error}`
            );
            ResponseHandler.error(
                res,
                'Failed to compute RFM',
                ErrorCode.SERVER_ERROR,
                HttpStatus.INTERNAL_SERVER_ERROR,
                req.url
            );
        }
    }
);

export const getRFMStats = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const orgId = req.session.activeOrganizationId;
        if (!orgId) {
            return ResponseHandler.error(
                res,
                'No active organization',
                ErrorCode.INVALID_TOKEN,
                HttpStatus.BAD_REQUEST,
                req.url
            );
        }

        const stats = await getRFMDistribution(orgId);
        ResponseHandler.success(
            res,
            'RFM distribution fetched',
            HttpStatus.OK,
            stats,
            req.url
        );
    }
);

export const getCustomerRFM = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const orgId = req.session.activeOrganizationId;
        const customerId = req.params.id as string;

        if (!orgId) {
            return ResponseHandler.error(
                res,
                'No active organization',
                ErrorCode.INVALID_TOKEN,
                HttpStatus.BAD_REQUEST,
                req.url
            );
        }

        const analytics = await getCustomerAnalytics(customerId, orgId);
        if (!analytics) {
            return ResponseHandler.error(
                res,
                'Customer not found',
                ErrorCode.RESOURCE_NOT_FOUND,
                HttpStatus.NOT_FOUND,
                req.url
            );
        }

        ResponseHandler.success(
            res,
            'Customer analytics fetched',
            HttpStatus.OK,
            analytics,
            req.url
        );
    }
);
