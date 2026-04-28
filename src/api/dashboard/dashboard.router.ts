import { Router } from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import * as dashboardController from './dashboard.controller.js';

const router = Router();

router.route('/dashboard').get(protect, dashboardController.getDashboardStats);

export default router;
