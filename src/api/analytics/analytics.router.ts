import { Router } from 'express';
import * as analyticsController from './analytics.controller.js';
import { requirePermission } from '../../middlewares/auth.middleware.js';

const router = Router();

router
    .route('/')
    .get(requirePermission('reports:read'), analyticsController.getAnalytics);

export default router;
