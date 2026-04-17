import { Router } from 'express';
import { requirePermission } from '../../middlewares/auth.middleware.js';
import * as reportController from './report.controller.js';

const router = Router();

router.get(
    '/dashboard',
    requirePermission('reports:read'),
    reportController.getDashboardStats
);

export default router;
