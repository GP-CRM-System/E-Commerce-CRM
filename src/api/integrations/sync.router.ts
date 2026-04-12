import { Router } from 'express';
import { requirePermission } from '../../middlewares/auth.middleware.js';
import * as syncController from './sync.controller.js';
import { z } from 'zod';
import { validateRequest } from '../../middlewares/validation.middleware.js';

const router = Router();

const triggerSyncSchema = z.object({
    entities: z.array(z.enum(['customers', 'orders', 'products'])).optional()
});

router.post(
    '/:integrationId/sync/full',
    requirePermission('integrations:write'),
    validateRequest(triggerSyncSchema),
    syncController.triggerFullSync
);

router.get(
    '/:integrationId/sync/logs',
    requirePermission('integrations:read'),
    syncController.getSyncLogs
);

export default router;
