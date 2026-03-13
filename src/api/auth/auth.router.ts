import { Router } from 'express';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth.js';
import * as AuthController from './auth.controller.js';

const authRouter = Router();

/**
 * Return the current authenticated user and session, if any.
 */
authRouter.get('/me', AuthController.getMe);

/**
 * Forward all Better Auth API routes.
 *
 * This mounts Better Auth's built-in handlers (sign-in, sign-up, org, invites, etc.)
 * under `/api/auth/*` when used with `app.use("/api/auth", authRouter)`.
 */
authRouter.all('/*splat', toNodeHandler(auth));

export default authRouter;
