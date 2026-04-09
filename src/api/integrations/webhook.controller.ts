import type { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware.js';
import {
    verifyShopifyWebhookSignature,
    createWebhookLog,
    handleShopifyWebhook,
    generateIdempotencyKey,
    checkAndStoreIdempotencyAtomic
} from './webhook.service.js';
import { HttpStatus, ResponseHandler } from '../../utils/response.util.js';
import prisma from '../../config/prisma.config.js';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import logger from '../../utils/logger.util.js';

export const handleShopifyWebhookRequest = asyncHandler(
    async (req: Request, res: Response) => {
        const integrationId = req.params.integrationId as string;
        const hmacHeader = req.headers['x-shopify-hmac-sha256'] as
            | string
            | undefined;
        const topic = req.headers['x-shopify-topic'] as string | undefined;
        const shopDomain = req.headers['x-shopify-shop-domain'] as
            | string
            | undefined;
        const webhookId = req.headers['x-shopify-webhook-id'] as
            | string
            | undefined;

        const integration = await prisma.integration.findUnique({
            where: { id: integrationId }
        });

        if (!integration) {
            logger.error(
                `Webhook received for unknown integration: ${integrationId}`
            );
            res.status(HttpStatus.NOT_FOUND).json({
                error: 'Integration not found'
            });
            return;
        }

        const rawBody = JSON.stringify(req.body);
        const secret = integration.apiSecret || integration.accessToken;
        const isValid = verifyShopifyWebhookSignature(
            rawBody,
            hmacHeader || '',
            secret
        );

        if (!isValid) {
            logger.warn(
                `Invalid webhook signature for integration ${integrationId}`
            );
            res.status(HttpStatus.UNAUTHORIZED).json({
                error: 'Invalid signature'
            });
            return;
        }

        const idempotencyKey = generateIdempotencyKey(
            req.body,
            topic || 'unknown',
            webhookId
        );
        const provider = 'shopify';

        const { isDuplicate } = await checkAndStoreIdempotencyAtomic(
            integrationId,
            provider,
            idempotencyKey,
            topic || 'unknown'
        );

        if (isDuplicate) {
            const keyDisplay =
                idempotencyKey.length > 16
                    ? `${idempotencyKey.substring(0, 16)}...`
                    : idempotencyKey;
            logger.info(`Duplicate webhook received: ${keyDisplay}, skipping`);
            res.status(HttpStatus.OK).json({
                received: true,
                duplicate: true
            });
            return;
        }

        const webhookLog = await createWebhookLog(
            integrationId,
            topic || 'unknown',
            shopDomain || integration.shopDomain || '',
            req.body,
            {
                'x-shopify-topic': topic || '',
                'x-shopify-shop-domain': shopDomain || ''
            },
            webhookId
        );

        res.status(HttpStatus.OK).json({ received: true });

        setImmediate(async () => {
            try {
                await handleShopifyWebhook(
                    integration,
                    topic || 'unknown',
                    req.body,
                    webhookLog.id
                );
            } catch (error) {
                logger.error(`Async webhook processing failed: ${error}`);
            }
        });
    }
);

export const getWebhookLogs = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const integrationId = req.params.integrationId as string;
        const { status, topic, limit = '50', offset = '0' } = req.query;

        const integration = await prisma.integration.findUnique({
            where: { id: integrationId }
        });

        if (!integration) {
            res.status(HttpStatus.NOT_FOUND).json({
                error: 'Integration not found'
            });
            return;
        }

        const { activeOrganizationId: activeOrgId } = req.session;
        if (integration.orgId !== activeOrgId) {
            res.status(HttpStatus.FORBIDDEN).json({
                error: 'Access denied'
            });
            return;
        }

        const where: Record<string, unknown> = { integrationId };
        if (status) where.status = status;
        if (topic) where.topic = topic;

        const logs = await prisma.webhookLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: parseInt(limit as string, 10),
            skip: parseInt(offset as string, 10)
        });

        const total = await prisma.webhookLog.count({ where });

        ResponseHandler.paginated(
            res,
            logs,
            'Webhook logs fetched successfully',
            Math.floor(
                parseInt(offset as string, 10) / parseInt(limit as string, 10)
            ) + 1,
            parseInt(limit as string, 10),
            total,
            req.url
        );
    }
);
