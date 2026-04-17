import { Router } from 'express';
import { requirePermission } from '../../middlewares/auth.middleware.js';
import * as templateController from './template.controller.js';
import * as templateSchema from './template.schemas.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';

const router = Router();

router
    .route('/')
    .get(
        requirePermission('templates:read'),
        validateRequest(templateSchema.emailTemplateQuery, 'query'),
        templateController.list
    )
    .post(
        requirePermission('templates:write'),
        validateRequest(templateSchema.createEmailTemplate, 'body'),
        templateController.create
    );

router
    .route('/:id')
    .get(
        requirePermission('templates:read'),
        validateRequest(templateSchema.emailTemplateId, 'params'),
        templateController.get
    )
    .patch(
        requirePermission('templates:write'),
        validateRequest(templateSchema.emailTemplateId, 'params'),
        validateRequest(templateSchema.updateEmailTemplate, 'body'),
        templateController.update
    )
    .delete(
        requirePermission('templates:delete'),
        validateRequest(templateSchema.emailTemplateId, 'params'),
        templateController.remove
    );

router
    .route('/:id/preview')
    .get(
        requirePermission('templates:read'),
        validateRequest(templateSchema.emailTemplateId, 'params'),
        templateController.preview
    );

export default router;
