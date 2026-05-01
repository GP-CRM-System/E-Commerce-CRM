import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import {
    ErrorCode,
    HttpStatus,
    ResponseHandler
} from '../../utils/response.util.js';
import { asyncHandler } from '../../middlewares/error.middleware.js';
import * as analyticsService from './analytics.service.js';

export const getAnalytics = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId;

        if (!organizationId) {
            return ResponseHandler.error(
                res,
                'No active organization found',
                ErrorCode.VALIDATION_ERROR,
                HttpStatus.UNAUTHORIZED
            );
        }

        const data = await analyticsService.getAnalytics(organizationId);

        ResponseHandler.success(
            res,
            'Analytics retrieved successfully',
            200,
            data
        );
    }
);
