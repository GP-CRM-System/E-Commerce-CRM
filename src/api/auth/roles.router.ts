import { Router } from 'express';
import {
    protect,
    requirePermission
} from '../../middlewares/auth.middleware.js';
import * as RolesController from './roles.controller.js';

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
    RolesController.createRole
);

rolesRouter.patch(
    '/:id',
    protect,
    requirePermission('ac:update'),
    RolesController.updateRole
);

rolesRouter.delete(
    '/:id',
    protect,
    requirePermission('ac:delete'),
    RolesController.deleteRole
);

export default rolesRouter;
