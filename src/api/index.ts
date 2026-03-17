import { Router } from 'express';
import authRouter from './auth/auth.router.js';
import customerRouter from './customers/customers.router.js';

const router = Router();

router.use('/auth', authRouter);
router.use('/customers', customerRouter);

export default router;
