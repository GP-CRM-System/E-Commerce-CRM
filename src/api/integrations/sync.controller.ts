import type { Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware.js';
import * as syncService from './sync.service.js';
import {
    HttpStatus,
    ResponseHandler,
    AuthorizationError,
    NotFoundError
} from '../../utils/response.util.js';
import prisma from '../../config/prisma.config.js';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';

export const triggerFullSync = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { activeOrganizationId } = req.session;
        const integrationId = req.params.integrationId as string;
        const { entities } = req.body as { entities?: string[] };

        if (!activeOrganizationId) {
            throw new AuthorizationError('No active organization selected');
        }

        const integration = await prisma.integration.findFirst({
            where: { id: integrationId, orgId: activeOrganizationId }
        });

        if (!integration) {
            throw new NotFoundError('Integration not found');
        }

        const stats = await syncService.fullSync(
            integrationId,
            entities || ['customers', 'orders', 'products']
        );

        ResponseHandler.success(
            res,
            'Full sync completed',
            HttpStatus.OK,
            stats,
            req.url
        );
    }
);

export const getSyncLogs = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { activeOrganizationId } = req.session;
        const integrationId = req.params.integrationId as string;
        const { status, syncType, limit = '50', offset = '0' } = req.query;

        if (!activeOrganizationId) {
            throw new AuthorizationError('No active organization selected');
        }

        const integration = await prisma.integration.findFirst({
            where: { id: integrationId, orgId: activeOrganizationId }
        });

        if (!integration) {
            throw new NotFoundError('Integration not found');
        }

        const where: Record<string, unknown> = { integrationId };
        if (status) where.status = status;
        if (syncType) where.syncType = syncType;

        const logs = await prisma.syncLog.findMany({
            where,
            orderBy: { startedAt: 'desc' },
            take: parseInt(limit as string, 10),
            skip: parseInt(offset as string, 10)
        });

        const total = await prisma.syncLog.count({ where });

        ResponseHandler.paginated(
            res,
            logs,
            'Sync logs fetched successfully',
            Math.floor(
                parseInt(offset as string, 10) / parseInt(limit as string, 10)
            ) + 1,
            parseInt(limit as string, 10),
            total,
            req.url
        );
    }
);
