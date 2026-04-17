import { Router } from 'express';
import { requirePermission } from '../../middlewares/auth.middleware.js';
import * as auditController from './audit.controller.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import { paginationSchema } from '../../utils/pagination.util.js';

const router = Router();

router.get(
    '/',
    requirePermission('reports:read'),
    validateRequest(paginationSchema, 'query'),
    auditController.listLogs
);

export default router;
