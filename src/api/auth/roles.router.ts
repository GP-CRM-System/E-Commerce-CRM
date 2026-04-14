import { Router } from 'express';
import {
    protect,
    requirePermission
} from '../../middlewares/auth.middleware.js';
import * as RolesController from './roles.controller.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import { createRoleSchema, updateRoleSchema } from './roles.schemas.js';

const rolesRouter = Router();

rolesRouter.get(
    '/permissions',
    protect,
    requirePermission('ac:read'),
    RolesController.getPermissions
);

rolesRouter.get(
    '/',
    protect,
    requirePermission('ac:read'),
    RolesController.listRoles
);

rolesRouter.get(
    '/:id',
    protect,
    requirePermission('ac:read'),
    RolesController.getRole
);

rolesRouter.post(
    '/',
    protect,
    requirePermission('ac:create'),
    validateRequest(createRoleSchema),
    RolesController.createRole
);

rolesRouter.patch(
    '/:id',
    protect,
    requirePermission('ac:update'),
    validateRequest(updateRoleSchema),
    RolesController.updateRole
);

rolesRouter.delete(
    '/:id',
    protect,
    requirePermission('ac:delete'),
    RolesController.deleteRole
);

export default rolesRouter;
