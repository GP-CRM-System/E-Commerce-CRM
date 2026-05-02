import { Router } from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import * as AuthController from './auth.controller.js';

const meRouter = Router();

/**
 * Return the current authenticated user and session, if any.
 */
meRouter.get('/', protect, AuthController.getMe);

export default meRouter;
