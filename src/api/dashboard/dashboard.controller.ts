import type { Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware.js';
import {
    ResponseHandler,
    HttpStatus,
    ErrorCode
} from '../../utils/response.util.js';
import * as dashboardService from './dashboard.service.js';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';

export const getDashboardStats = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session?.activeOrganizationId as string;

        if (organizationId) {
            return ResponseHandler.error(
                res,
                'No active organization',
                ErrorCode.VALIDATION_ERROR,
                HttpStatus.BAD_REQUEST
            );
        }

        const dashboard =
            await dashboardService.getDashboardStats(organizationId);

        return ResponseHandler.success(
            res,
            'Dashboard stats fetched successfully',
            HttpStatus.OK,
            dashboard,
            req.url
        );
    }
);
