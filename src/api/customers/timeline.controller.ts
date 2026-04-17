import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import * as timelineService from './timeline.service.js';
import {
    ResponseHandler,
    HttpStatus,
    ErrorCode
} from '../../utils/response.util.js';
import { asyncHandler } from '../../middlewares/error.middleware.js';

export const getTimeline = asyncHandler(
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

        const customerId = req.params.id as string;
        const limit = parseInt((req.query.limit as string) || '50', 10);

        const result = await timelineService.getCustomerTimeline(
            customerId,
            organizationId,
            limit
        );

        return ResponseHandler.success(
            res,
            'Customer timeline fetched successfully',
            HttpStatus.OK,
            result
        );
    }
);
