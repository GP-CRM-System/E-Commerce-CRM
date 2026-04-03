import { Router } from 'express';
import { requirePermission } from '../../middlewares/auth.middleware.js';
import * as exportController from './exports.controller.js';
import * as exportSchema from './exports.schemas.js';
import { paginationSchema } from '../../utils/pagination.util.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';

const router = Router();

router
    .route('/')
    .get(
        requirePermission('exports:read'),
        validateRequest(paginationSchema, 'query'),
        exportController.list
    )
    .post(
        requirePermission('exports:write'),
        validateRequest(exportSchema.createExportJob, 'body'),
        exportController.create
    );

router
    .route('/:id')
    .get(requirePermission('exports:read'), exportController.get);

router
    .route('/:id/download')
    .get(requirePermission('exports:read'), exportController.download);

export default router;
