import { Router } from 'express';
import { requirePermission } from '../../middlewares/auth.middleware.js';
import * as subscriptionController from './subscriptions.controller.js';
import * as paymentController from './subscriptions-payment.controller.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import {
    listPlansQuerySchema,
    subscribeSchema,
    cancelSubscriptionSchema
} from './subscriptions.schemas.js';

const router = Router();

router.get(
    '/plans',
    validateRequest(listPlansQuerySchema, 'query'),
    subscriptionController.listPlans
);

router.get(
    '/current',
    requirePermission('subscriptions:read'),
    subscriptionController.getCurrentSubscription
);

router.post(
    '/',
    requirePermission('subscriptions:write'),
    validateRequest(subscribeSchema, 'body'),
    subscriptionController.subscribe
);

router.patch(
    '/cancel',
    requirePermission('subscriptions:write'),
    validateRequest(cancelSubscriptionSchema, 'body'),
    subscriptionController.cancel
);

router.post(
    '/initialize',
    requirePermission('subscriptions:write'),
    paymentController.initializeSubscription
);

router.post('/fawry/callback', paymentController.subscriptionCallback);

export default router;
