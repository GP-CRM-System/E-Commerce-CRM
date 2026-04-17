import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import * as campaignService from './campaign.service.js';
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

        const campaign = await campaignService.createCampaign(
            organizationId,
            req.body
        );

        return ResponseHandler.created(res, 'Campaign created', campaign);
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

        const { campaigns, total } = await campaignService.listCampaigns(
            organizationId,
            {
                type: req.query.type as string,
                status: req.query.status as string
            },
            take,
            skip
        );

        return ResponseHandler.paginated(
            res,
            campaigns,
            'Campaigns fetched successfully',
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

        const campaign = await campaignService.getCampaign(
            req.params.id as string,
            organizationId
        );

        if (!campaign) {
            return ResponseHandler.error(
                res,
                'Campaign not found',
                ErrorCode.RESOURCE_NOT_FOUND,
                HttpStatus.NOT_FOUND
            );
        }

        return ResponseHandler.success(
            res,
            'Campaign fetched successfully',
            HttpStatus.OK,
            campaign
        );
    }
);

export const update = asyncHandler(
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

        try {
            const campaign = await campaignService.updateCampaign(
                req.params.id as string,
                organizationId,
                req.body
            );

            return ResponseHandler.success(
                res,
                'Campaign updated successfully',
                HttpStatus.OK,
                campaign
            );
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            if (
                message === 'Cannot update a sent campaign' ||
                message ===
                    'Cannot update a campaign that has been or is being sent' ||
                message === 'Campaign not found'
            ) {
                return ResponseHandler.error(
                    res,
                    message,
                    ErrorCode.VALIDATION_ERROR,
                    HttpStatus.BAD_REQUEST
                );
            }
            throw error;
        }
    }
);

export const remove = asyncHandler(
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

        await campaignService.deleteCampaign(
            req.params.id as string,
            organizationId
        );

        return ResponseHandler.success(
            res,
            'Campaign deleted successfully',
            HttpStatus.OK
        );
    }
);

export const send = asyncHandler(
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

        try {
            const sendNow = req.body.sendNow !== false;
            const result = await campaignService.sendCampaign(
                req.params.id as string,
                organizationId,
                sendNow
            );

            return ResponseHandler.success(
                res,
                'Campaign sending started',
                HttpStatus.OK,
                result
            );
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            if (
                message === 'Campaign has already been sent' ||
                message === 'Campaign not found' ||
                message === 'No recipients found for this campaign'
            ) {
                return ResponseHandler.error(
                    res,
                    message,
                    ErrorCode.VALIDATION_ERROR,
                    HttpStatus.BAD_REQUEST
                );
            }
            throw error;
        }
    }
);

export const getStats = asyncHandler(
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

        const stats = await campaignService.getCampaignStats(
            req.params.id as string,
            organizationId
        );

        return ResponseHandler.success(
            res,
            'Campaign stats fetched successfully',
            HttpStatus.OK,
            stats
        );
    }
);
