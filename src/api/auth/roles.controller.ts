import { asyncHandler } from '../../middlewares/error.middleware.js';
import {
    HttpStatus,
    ResponseHandler,
    ErrorCode
} from '../../utils/response.util.js';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import * as RolesService from './roles.service.js';
import {
    createRoleSchema,
    updateRoleSchema,
    roleIdSchema
} from './roles.schemas.js';

export const getPermissions = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const permissions = await RolesService.getAvailablePermissions();
        ResponseHandler.success(
            res,
            'Permissions fetched successfully',
            HttpStatus.OK,
            permissions,
            req.path
        );
    }
);

export const listRoles = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId;
        if (!organizationId) {
            return ResponseHandler.error(
                res,
                'No active organization selected',
                ErrorCode.RESOURCE_CONFLICT,
                HttpStatus.BAD_REQUEST,
                req.path
            );
        }
        const roles = await RolesService.listRoles(organizationId);
        ResponseHandler.success(
            res,
            'Roles fetched successfully',
            HttpStatus.OK,
            roles,
            req.path
        );
    }
);

export const getRole = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { roleId } = roleIdSchema.parse({ roleId: req.params.id });
        const organizationId = req.session.activeOrganizationId;
        if (!organizationId) {
            return ResponseHandler.error(
                res,
                'No active organization selected',
                ErrorCode.RESOURCE_CONFLICT,
                HttpStatus.BAD_REQUEST,
                req.path
            );
        }
        const role = await RolesService.getRole(organizationId, roleId);
        ResponseHandler.success(
            res,
            'Role fetched successfully',
            HttpStatus.OK,
            role,
            req.path
        );
    }
);

export const createRole = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const input = createRoleSchema.parse(req.body);
        const organizationId = req.session.activeOrganizationId;
        if (!organizationId) {
            return ResponseHandler.error(
                res,
                'No active organization selected',
                ErrorCode.RESOURCE_CONFLICT,
                HttpStatus.BAD_REQUEST,
                req.path
            );
        }
        const role = await RolesService.createRole(input, organizationId);
        ResponseHandler.created(
            res,
            'Role created successfully',
            role,
            req.path
        );
    }
);

export const updateRole = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { roleId } = roleIdSchema.parse({ roleId: req.params.id });
        const input = updateRoleSchema.parse(req.body);
        const organizationId = req.session.activeOrganizationId;
        if (!organizationId) {
            return ResponseHandler.error(
                res,
                'No active organization selected',
                ErrorCode.RESOURCE_CONFLICT,
                HttpStatus.BAD_REQUEST,
                req.path
            );
        }
        const role = await RolesService.updateRole(
            roleId,
            input,
            organizationId
        );
        ResponseHandler.success(
            res,
            'Role updated successfully',
            HttpStatus.OK,
            role,
            req.path
        );
    }
);

export const deleteRole = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { roleId } = roleIdSchema.parse({ roleId: req.params.id });
        const organizationId = req.session.activeOrganizationId;
        if (!organizationId) {
            return ResponseHandler.error(
                res,
                'No active organization selected',
                ErrorCode.RESOURCE_CONFLICT,
                HttpStatus.BAD_REQUEST,
                req.path
            );
        }
        const result = await RolesService.deleteRole(roleId, organizationId);
        ResponseHandler.success(
            res,
            result.message,
            HttpStatus.OK,
            result,
            req.path
        );
    }
);
