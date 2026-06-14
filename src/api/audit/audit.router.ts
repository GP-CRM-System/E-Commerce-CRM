import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../middlewares/auth.middleware.js';
import * as auditController from './audit.controller.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';

const auditQuerySchema = z.object({
    page: z.string().optional().default('1'),
    limit: z.string().optional().default('20'),
    targetType: z.string().optional(),
    action: z.string().optional()
});

const router = Router();

router.get(
    '/',
    requirePermission('reports:read'),
    validateRequest(auditQuerySchema, 'query'),
    auditController.listLogs
);

export default router;
