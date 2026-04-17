import { Router } from 'express';
import { requirePermission } from '../../middlewares/auth.middleware.js';
import * as paymentController from './payment.controller.js';

const router = Router();

// API routes (Protected)
router.post(
    '/initialize/:orderId',
    requirePermission('orders:write'),
    paymentController.initialize
);

// Webhook routes (Public)
router.post('/fawry/callback', paymentController.callback);

export default router;
