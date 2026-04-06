import { Router } from 'express';
import authRouter from './auth/auth.router.js';
import rolesRouter from './auth/roles.router.js';
import customerRouter from './customers/customers.router.js';
import productRouter from './products/products.router.js';
import orderRouter from './orders/orders.router.js';
import importsRouter from './imports/imports.router.js';
import exportsRouter from './exports/exports.router.js';
import integrationRouter from './integrations/integration.router.js';
import webhookRouter from './integrations/webhook.router.js';
import syncRouter from './integrations/sync.router.js';
import { rateLimiter, authRateLimiter } from '../config/ratelimit.config.js';

const router = Router();
router.use(rateLimiter);

router.use('/auth', authRateLimiter);
router.use('/auth', authRouter);
router.use('/roles', rolesRouter);
router.use('/customers', customerRouter);
router.use('/products', productRouter);
router.use('/orders', orderRouter);
router.use('/imports', importsRouter);
router.use('/exports', exportsRouter);
router.use('/integrations', integrationRouter);
router.use('/webhooks', webhookRouter);
router.use('/integrations', syncRouter);

export default router;
