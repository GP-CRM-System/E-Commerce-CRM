import type { Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware.js';
import {
    ResponseHandler,
    HttpStatus,
    ErrorCode
} from '../../utils/response.util.js';
import logger from '../../utils/logger.util.js';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import { addRFMScoreJob } from '../../queues/rfm.queue.js';
import {
    checkAndUpdateLifecycleStage,
    recalculateVIPCustomers,
    processBatchLifecycleUpdate
} from '../customers/lifecycle.service.js';
import { cleanupExpiredIdempotencyKeys } from '../integrations/webhook.service.js';

function validateOrganizationAccess(
    organizationId: string,
    activeOrganizationId?: string | null
): boolean {
    if (!activeOrganizationId) return false;
    return organizationId === activeOrganizationId;
}

export const runRFMJob = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { organizationId, customerId, daysWindow } = req.body;
        const activeOrgId = req.session?.activeOrganizationId;

        if (!validateOrganizationAccess(organizationId, activeOrgId)) {
            return ResponseHandler.error(
                res,
                'Access denied to this organization',
                ErrorCode.RESOURCE_NOT_ALLOWED,
                HttpStatus.FORBIDDEN,
                req.url
            );
        }

        try {
            await addRFMScoreJob(organizationId, daysWindow, customerId);

            logger.info(
                `RFM job queued for org ${organizationId}${customerId ? `, customer ${customerId}` : ''}`
            );

            ResponseHandler.success(
                res,
                'RFM job queued successfully',
                HttpStatus.ACCEPTED,
                { organizationId, customerId, status: 'queued' },
                req.url
            );
        } catch (error) {
            logger.error(
                `Failed to queue RFM job: ${error instanceof Error ? error.stack : error}`
            );
            ResponseHandler.error(
                res,
                'Failed to queue RFM job',
                ErrorCode.SERVER_ERROR,
                HttpStatus.INTERNAL_SERVER_ERROR,
                req.url
            );
        }
    }
);

export const runLifecycleJob = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { organizationId, customerId } = req.body;
        const activeOrgId = req.session?.activeOrganizationId;

        if (!validateOrganizationAccess(organizationId, activeOrgId)) {
            return ResponseHandler.error(
                res,
                'Access denied to this organization',
                ErrorCode.RESOURCE_NOT_ALLOWED,
                HttpStatus.FORBIDDEN,
                req.url
            );
        }

        try {
            if (customerId) {
                const result = await checkAndUpdateLifecycleStage(
                    customerId,
                    organizationId
                );

                ResponseHandler.success(
                    res,
                    result?.triggered
                        ? `Lifecycle transition: ${result.previousStage} → ${result.newStage}`
                        : 'No lifecycle transition needed',
                    HttpStatus.OK,
                    result,
                    req.url
                );
            } else {
                const result =
                    await processBatchLifecycleUpdate(organizationId);

                ResponseHandler.success(
                    res,
                    `Lifecycle check complete: ${result.transitions} transitions`,
                    HttpStatus.ACCEPTED,
                    result,
                    req.url
                );
            }
        } catch (error) {
            logger.error(
                `Lifecycle job failed: ${error instanceof Error ? error.stack : error}`
            );
            ResponseHandler.error(
                res,
                'Failed to run lifecycle job',
                ErrorCode.SERVER_ERROR,
                HttpStatus.INTERNAL_SERVER_ERROR,
                req.url
            );
        }
    }
);

export const runVipJob = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { organizationId } = req.body;
        const activeOrgId = req.session?.activeOrganizationId;

        if (!validateOrganizationAccess(organizationId, activeOrgId)) {
            return ResponseHandler.error(
                res,
                'Access denied to this organization',
                ErrorCode.RESOURCE_NOT_ALLOWED,
                HttpStatus.FORBIDDEN,
                req.url
            );
        }

        try {
            const result = await recalculateVIPCustomers(organizationId);

            ResponseHandler.success(
                res,
                'VIP recalculation complete',
                HttpStatus.ACCEPTED,
                result,
                req.url
            );
        } catch (error) {
            logger.error(
                `VIP job failed: ${error instanceof Error ? error.stack : error}`
            );
            ResponseHandler.error(
                res,
                'Failed to run VIP job',
                ErrorCode.SERVER_ERROR,
                HttpStatus.INTERNAL_SERVER_ERROR,
                req.url
            );
        }
    }
);

// Intentionally not org-scoped: idempotency keys are global (keyed by webhook signature, not org).
// Cleanup removes expired keys across all orgs — no tenant data is exposed.
export const runCleanupIdempotencyJob = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        try {
            const deletedCount = await cleanupExpiredIdempotencyKeys();

            logger.info(
                `Webhook idempotency cleanup complete: ${deletedCount} expired keys removed`
            );

            ResponseHandler.success(
                res,
                'Cleanup complete',
                HttpStatus.OK,
                { deletedCount },
                req.url
            );
        } catch (error) {
            logger.error(
                `Idempotency cleanup failed: ${error instanceof Error ? error.stack : error}`
            );
            ResponseHandler.error(
                res,
                'Failed to run cleanup',
                ErrorCode.SERVER_ERROR,
                HttpStatus.INTERNAL_SERVER_ERROR,
                req.url
            );
        }
    }
);
