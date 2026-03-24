import type { Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware.js';
import * as integrationService from './integration.service.js';
import {
    HttpStatus,
    ResponseHandler,
    AuthorizationError
} from '../../utils/response.util.js';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import { env } from '../../config/env.config.js';

export const connectShopify = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { activeOrganizationId } = req.session;

        if (!activeOrganizationId) {
            throw new AuthorizationError('No active organization selected');
        }

        const integration = await integrationService.createShopifyIntegration(
            activeOrganizationId,
            req.body
        );

        ResponseHandler.success(
            res,
            'Shopify store connected successfully',
            HttpStatus.CREATED,
            {
                id: integration.id,
                provider: integration.provider,
                shopDomain: integration.shopDomain,
                syncStatus: integration.syncStatus
            },
            req.url
        );
    }
);

export const getIntegrations = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { activeOrganizationId } = req.session;
        const provider = req.query.provider as string | undefined;

        if (!activeOrganizationId) {
            throw new AuthorizationError('No active organization selected');
        }

        const result = await integrationService.getIntegrationByOrg(
            activeOrganizationId,
            provider
        );

        if (Array.isArray(result)) {
            ResponseHandler.success(
                res,
                'Integrations fetched successfully',
                HttpStatus.OK,
                result.map((i) => ({
                    id: i.id,
                    provider: i.provider,
                    shopDomain: i.shopDomain,
                    syncStatus: i.syncStatus,
                    isActive: i.isActive,
                    lastSyncedAt: i.lastSyncedAt,
                    createdAt: i.createdAt
                })),
                req.url
            );
        } else if (result) {
            ResponseHandler.success(
                res,
                'Integration fetched successfully',
                HttpStatus.OK,
                {
                    id: result.id,
                    provider: result.provider,
                    shopDomain: result.shopDomain,
                    syncStatus: result.syncStatus,
                    isActive: result.isActive,
                    lastSyncedAt: result.lastSyncedAt,
                    createdAt: result.createdAt
                },
                req.url
            );
        } else {
            ResponseHandler.success(
                res,
                'No integrations found',
                HttpStatus.OK,
                null,
                req.url
            );
        }
    }
);

export const getIntegration = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { activeOrganizationId } = req.session;
        const integrationId = req.params.integrationId as string;

        if (!activeOrganizationId) {
            throw new AuthorizationError('No active organization selected');
        }

        const integration = await integrationService.getIntegration(
            integrationId,
            activeOrganizationId
        );

        if (!integration) {
            throw new Error('Integration not found');
        }

        ResponseHandler.success(
            res,
            'Integration fetched successfully',
            HttpStatus.OK,
            {
                id: integration.id,
                provider: integration.provider,
                shopDomain: integration.shopDomain,
                syncStatus: integration.syncStatus,
                isActive: integration.isActive,
                createdAt: integration.createdAt,
                updatedAt: integration.updatedAt
            },
            req.url
        );
    }
);

export const updateIntegration = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { activeOrganizationId } = req.session;
        const integrationId = req.params.integrationId as string;

        if (!activeOrganizationId) {
            throw new AuthorizationError('No active organization selected');
        }

        const integration = await integrationService.updateIntegrationData(
            integrationId,
            activeOrganizationId,
            req.body
        );

        ResponseHandler.success(
            res,
            'Integration updated successfully',
            HttpStatus.OK,
            {
                id: integration.id,
                provider: integration.provider,
                shopDomain: integration.shopDomain,
                syncStatus: integration.syncStatus,
                isActive: integration.isActive
            },
            req.url
        );
    }
);

export const deleteIntegration = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { activeOrganizationId } = req.session;
        const integrationId = req.params.integrationId as string;

        if (!activeOrganizationId) {
            throw new AuthorizationError('No active organization selected');
        }

        await integrationService.deleteIntegration(
            integrationId,
            activeOrganizationId
        );

        ResponseHandler.success(
            res,
            'Integration deleted successfully',
            HttpStatus.OK,
            null,
            req.url
        );
    }
);

export const testConnection = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { activeOrganizationId } = req.session;
        const integrationId = req.params.integrationId as string;

        if (!activeOrganizationId) {
            throw new AuthorizationError('No active organization selected');
        }

        const result = await integrationService.testConnection(
            integrationId,
            activeOrganizationId
        );

        ResponseHandler.success(
            res,
            result.success
                ? `Connection successful! Connected to ${result.shop}`
                : 'Connection failed',
            HttpStatus.OK,
            result,
            req.url
        );
    }
);

export const registerWebhooks = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { activeOrganizationId } = req.session;
        const integrationId = req.params.integrationId as string;

        if (!activeOrganizationId) {
            throw new AuthorizationError('No active organization selected');
        }

        const webhookUrl = `${env.appUrl}`;
        const result = await integrationService.registerWebhooks(
            integrationId,
            req.body.topics,
            webhookUrl
        );

        ResponseHandler.success(
            res,
            `Registered ${result.registered.length} webhooks`,
            HttpStatus.OK,
            result,
            req.url
        );
    }
);
