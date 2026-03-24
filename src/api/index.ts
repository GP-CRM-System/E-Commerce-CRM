import { Router } from 'express';
import authRouter from './auth/auth.router.js';
import customerRouter from './customers/customers.router.js';
import integrationRouter from './integrations/integration.router.js';
import webhookRouter from './integrations/webhook.router.js';
import syncRouter from './integrations/sync.router.js';
import { rateLimiter } from '../config/ratelimit.config.js';

const router = Router();
router.use(rateLimiter);

router.use('/auth', authRouter);
router.use('/customers', customerRouter);
router.use('/integrations', integrationRouter);
router.use('/webhooks', webhookRouter);
router.use('/integrations', syncRouter);

export default router;
