import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import * as reportService from './report.service.js';
import * as dashboardService from '../dashboard/dashboard.service.js';
import { ResponseHandler, HttpStatus } from '../../utils/response.util.js';
import { asyncHandler } from '../../middlewares/error.middleware.js';

export const getDashboardStats = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;

        const [revenue, acquisition, salesOverview, ticketStats] =
            await Promise.all([
                reportService.getRevenueStats(organizationId),
                reportService.getCustomerAcquisitionStats(organizationId),
                dashboardService.getSalesOverview(organizationId),
                dashboardService.getTicketStats(organizationId)
            ]);

        return ResponseHandler.success(
            res,
            'Dashboard stats fetched',
            HttpStatus.OK,
            {
                revenue,
                acquisition,
                salesOverview,
                ticketStats
            }
        );
    }
);

export const getSalesOverview = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const salesOverview =
            await dashboardService.getSalesOverview(organizationId);

        return ResponseHandler.success(
            res,
            'Sales overview fetched',
            HttpStatus.OK,
            salesOverview
        );
    }
);

export const getTicketStats = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const ticketStats =
            await dashboardService.getTicketStats(organizationId);

        return ResponseHandler.success(
            res,
            'Ticket stats fetched',
            HttpStatus.OK,
            ticketStats
        );
    }
);
