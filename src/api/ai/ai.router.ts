/**
 * AI Intelligence Router — Route definitions.
 *
 * Controller functions are already wrapped with asyncHandler internally,
 * so no need to wrap them again here.
 */
import { Router } from 'express';
import { requirePermission } from '../../middlewares/auth.middleware.js';
import * as aiController from './ai.controller.js';

const router = Router();

// Churn prediction
router.post('/churn', requirePermission('ai:write'), aiController.computeChurn);
router.get(
    '/churn',
    requirePermission('ai:read'),
    aiController.getChurnResults
);

// Segmentation
router.post(
    '/segment',
    requirePermission('ai:write'),
    aiController.computeSegments
);
router.get(
    '/segment',
    requirePermission('ai:read'),
    aiController.getSegmentResults
);

// Product recommendations
router.post(
    '/recommend',
    requirePermission('ai:write'),
    aiController.computeRecommendations
);
router.get(
    '/recommend/:productId',
    requirePermission('ai:read'),
    aiController.getProductRecommendations
);

router.get('/order/:orderId', aiController.getOrderStatus);

// AI service health (no auth required — used by monitoring tools)
router.get('/health', aiController.getAiHealth);

export default router;
