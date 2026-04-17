import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import * as reportService from './report.service.js';
import { ResponseHandler, HttpStatus } from '../../utils/response.util.js';
import { asyncHandler } from '../../middlewares/error.middleware.js';

export const getDashboardStats = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;

        const [revenue, acquisition] = await Promise.all([
            reportService.getRevenueStats(organizationId),
            reportService.getCustomerAcquisitionStats(organizationId)
        ]);

        return ResponseHandler.success(
            res,
            'Dashboard stats fetched',
            HttpStatus.OK,
            {
                revenue,
                acquisition
            }
        );
    }
);
