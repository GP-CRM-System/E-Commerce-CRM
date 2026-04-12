import { Router } from 'express';
import {
    runRFMJob,
    runLifecycleJob,
    runVipJob,
    runCleanupIdempotencyJob
} from './cron.controller.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import { requirePermission } from '../../middlewares/auth.middleware.js';
import {
    triggerRFMJob,
    triggerLifecycleJob,
    triggerVipJob,
    cleanupWebhookIdempotency
} from './cron.schemas.js';

const router = Router();

router.post(
    '/rfm',
    requirePermission('customers:write'),
    validateRequest(triggerRFMJob),
    runRFMJob
);

router.post(
    '/lifecycle',
    requirePermission('customers:write'),
    validateRequest(triggerLifecycleJob),
    runLifecycleJob
);

router.post(
    '/vip',
    requirePermission('customers:write'),
    validateRequest(triggerVipJob),
    runVipJob
);

router.post(
    '/cleanup/idempotency',
    requirePermission('integrations:write'),
    validateRequest(cleanupWebhookIdempotency),
    runCleanupIdempotencyJob
);

export default router;
