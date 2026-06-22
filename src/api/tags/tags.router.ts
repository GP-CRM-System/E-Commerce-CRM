import { Router } from 'express';
import * as tagController from './tags.controller.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import { requirePermission } from '../../middlewares/auth.middleware.js';
import {
    createTagSchema,
    updateTagSchema,
    listTagsSchema
} from './tags.schemas.js';

const router = Router();

router.post(
    '/',
    requirePermission('tags:write'),
    validateRequest(createTagSchema),
    tagController.createTag
);

router.get(
    '/',
    requirePermission('tags:read'),
    validateRequest(listTagsSchema, 'query'),
    tagController.listTags
);

router.get('/:id', requirePermission('tags:read'), tagController.getTag);

router.patch(
    '/:id',
    requirePermission('tags:write'),
    validateRequest(updateTagSchema),
    tagController.updateTag
);

router.delete(
    '/:id',
    requirePermission('tags:delete'),
    tagController.deleteTag
);

export default router;
