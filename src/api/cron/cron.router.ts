import { Router } from 'express';
import {
    runRFMJob,
    runLifecycleJob,
    runVipJob,
    runCleanupIdempotencyJob
} from './cron.controller.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import { requireRole } from '../../middlewares/auth.middleware.js';
import {
    triggerRFMJob,
    triggerLifecycleJob,
    triggerVipJob,
    cleanupWebhookIdempotency
} from './cron.schemas.js';

const router = Router();

router.post(
    '/rfm',
    requireRole('admin', 'root'),
    validateRequest(triggerRFMJob),
    runRFMJob
);

router.post(
    '/lifecycle',
    requireRole('admin', 'root'),
    validateRequest(triggerLifecycleJob),
    runLifecycleJob
);

router.post(
    '/vip',
    requireRole('admin', 'root'),
    validateRequest(triggerVipJob),
    runVipJob
);

router.post(
    '/cleanup/idempotency',
    requireRole('admin', 'root'),
    validateRequest(cleanupWebhookIdempotency),
    runCleanupIdempotencyJob
);

export default router;
