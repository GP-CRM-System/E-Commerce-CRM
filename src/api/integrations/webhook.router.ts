import { Router } from 'express';
import * as webhookController from './webhook.controller.js';
import { requirePermission } from '../../middlewares/auth.middleware.js';

const router = Router();

router.post(
    '/shopify/:integrationId',
    webhookController.handleShopifyWebhookRequest
);

router.get(
    '/:integrationId/logs',
    requirePermission('integrations:read'),
    webhookController.getWebhookLogs
);

export default router;
