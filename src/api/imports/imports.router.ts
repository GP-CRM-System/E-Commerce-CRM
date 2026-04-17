import { Router } from 'express';
import multer from 'multer';
import { requirePermission } from '../../middlewares/auth.middleware.js';
import * as importController from './imports.controller.js';
import * as importSchema from './imports.schemas.js';
import { paginationSchema } from '../../utils/pagination.util.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';

const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    }
});

router
    .route('/')
    .get(
        requirePermission('imports:read'),
        validateRequest(importSchema.importJobQuery, 'query'),
        importController.list
    )
    .post(
        requirePermission('imports:write'),
        upload.single('file'),
        validateRequest(importSchema.createImportJob, 'body'),
        importController.create
    );

router
    .route('/:id')
    .get(requirePermission('imports:read'), importController.get);

router
    .route('/:id/errors')
    .get(
        requirePermission('imports:read'),
        validateRequest(paginationSchema, 'query'),
        importController.getErrors
    );

router
    .route('/:id/rollback')
    .post(requirePermission('imports:write'), importController.rollback);

export default router;
