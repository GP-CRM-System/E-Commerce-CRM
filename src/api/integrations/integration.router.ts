import { Router } from 'express';
import { requirePermission } from '../../middlewares/auth.middleware.js';
import * as integrationController from './integration.controller.js';
import * as integrationSchema from './integration.schemas.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import shopifyRouter from './shopify/shopify.router.js';

const router = Router();

// Mount Shopify OAuth flow
router.use('/shopify', shopifyRouter);

router.post(
    '/shopify/connect',
    requirePermission('integrations:write'),
    validateRequest(integrationSchema.connectShopify),
    integrationController.connectShopify
);

router.get(
    '/',
    requirePermission('integrations:read'),
    integrationController.getIntegrations
);

router.get(
    '/:integrationId',
    requirePermission('integrations:read'),
    integrationController.getIntegration
);

router.patch(
    '/:integrationId',
    requirePermission('integrations:write'),
    validateRequest(integrationSchema.updateIntegration),
    integrationController.updateIntegration
);

router.delete(
    '/:integrationId',
    requirePermission('integrations:delete'),
    integrationController.deleteIntegration
);

router.post(
    '/:integrationId/test-connection',
    requirePermission('integrations:write'),
    integrationController.testConnection
);

router.post(
    '/:integrationId/webhooks/register',
    requirePermission('integrations:write'),
    validateRequest(integrationSchema.registerWebhookTopics),
    integrationController.registerWebhooks
);

export default router;
