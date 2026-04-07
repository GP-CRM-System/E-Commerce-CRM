/**
 * Custom Roles Service
 *
 * This module provides a "Validation Wrapper" around Better Auth's organization role management.
 *
 * Why Custom Implementation?
 * - Better Auth's built-in role routes (e.g., `/api/auth/organization/create-role`) do not support
 *   custom metadata like a `description` field, which is essential for CRM UIs.
 * - We need strict validation to ensure permissions conform to `AVAILABLE_PERMISSIONS` from roles.config.ts.
 * - We must protect default roles (`root`, `admin`, `member`, `owner`) from accidental modification/deletion.
 *
 * Note: The storage still uses the `organizationRole` table which Better Auth's `organization` plugin
 * uses when `dynamicAccessControl` is enabled. This is NOT a reimplementation of Better Auth's logic,
 * but rather an extension with project-specific validation and metadata support.
 */

import prisma from '../../config/prisma.config.js';
import type { CreateRoleInput, UpdateRoleInput } from './roles.schemas.js';
import type { RolePermissions } from '../../config/roles.config.js';
import {
    DEFAULT_ROLES,
    AVAILABLE_PERMISSIONS
} from '../../config/roles.config.js';
import { NotFoundError, BadRequestError } from '../../utils/response.util.js';
import type { OrganizationRole } from '../../generated/prisma/client.js';

const DEFAULT_ROLE_NAMES = Object.keys(DEFAULT_ROLES) as [string, ...string[]];

function isDefaultRole(roleName: string): boolean {
    return DEFAULT_ROLE_NAMES.includes(roleName);
}

function validatePermissions(permissions: Record<string, string[]>): void {
    for (const [resource, actions] of Object.entries(permissions)) {
        if (!(resource in AVAILABLE_PERMISSIONS)) {
            throw new BadRequestError(
                `Invalid resource '${resource}'. Available resources: ${Object.keys(AVAILABLE_PERMISSIONS).join(', ')}`
            );
        }
        const allowedActions = AVAILABLE_PERMISSIONS[
            resource as keyof typeof AVAILABLE_PERMISSIONS
        ] as readonly string[];
        for (const action of actions) {
            if (!allowedActions.includes(action)) {
                throw new BadRequestError(
                    `Invalid action '${action}' for resource '${resource}'. Allowed actions: ${allowedActions.join(', ')}`
                );
            }
        }
    }
}

export const getAvailablePermissions = async () => {
    return AVAILABLE_PERMISSIONS;
};

export const listRoles = async (organizationId: string) => {
    const dbRoles = await prisma.organizationRole.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'asc' }
    });

    const formattedRoles: Array<{
        id: string;
        name: string;
        description: string | undefined;
        permissions: RolePermissions;
        isDefault: boolean;
    }> = dbRoles.map((role: OrganizationRole) => ({
        id: role.id,
        name: role.role,
        description: role.description || undefined,
        permissions:
            typeof role.permission === 'string'
                ? JSON.parse(role.permission)
                : (role.permission as unknown as RolePermissions),
        isDefault: isDefaultRole(role.role)
    }));

    // If no roles in DB, return default roles from config
    if (formattedRoles.length === 0) {
        const defaultRolesList = Object.entries(DEFAULT_ROLES).map(
            ([name, permissions]) => ({
                id: `default-${name}`,
                name,
                description: undefined,
                permissions,
                isDefault: true
            })
        );

        return {
            default: defaultRolesList,
            custom: [],
            all: defaultRolesList
        };
    }

    return {
        default: formattedRoles.filter((r) => r.isDefault),
        custom: formattedRoles.filter((r) => !r.isDefault),
        all: formattedRoles
    };
};

export const getRole = async (organizationId: string, roleId: string) => {
    const role = await prisma.organizationRole.findFirst({
        where: { id: roleId, organizationId }
    });

    if (!role) {
        throw new NotFoundError('Role not found');
    }

    return {
        id: role.id,
        name: role.role,
        description: role.description || undefined,
        permissions:
            typeof role.permission === 'string'
                ? JSON.parse(role.permission)
                : (role.permission as unknown as RolePermissions),
        isDefault: isDefaultRole(role.role)
    };
};

export const createRole = async (
    input: CreateRoleInput,
    organizationId: string
) => {
    if (isDefaultRole(input.name) || input.name.toLowerCase() === 'owner') {
        throw new BadRequestError(
            `Role name '${input.name}' is reserved. Use a different name.`
        );
    }

    validatePermissions(input.permissions);

    const existing = await prisma.organizationRole.findFirst({
        where: { organizationId, role: input.name.toLowerCase() }
    });

    if (existing) {
        throw new BadRequestError(
            `A role with name '${input.name}' already exists in this organization.`
        );
    }

    const role = await prisma.organizationRole.create({
        data: {
            organizationId,
            role: input.name.toLowerCase(),
            permission: JSON.stringify(input.permissions),
            description: input.description
        }
    });

    return {
        id: role.id,
        name: role.role,
        description: role.description || undefined,
        permissions:
            typeof role.permission === 'string'
                ? JSON.parse(role.permission)
                : (role.permission as unknown as RolePermissions),
        isDefault: false
    };
};

export const updateRole = async (
    roleId: string,
    input: UpdateRoleInput,
    organizationId: string
) => {
    const role = await prisma.organizationRole.findFirst({
        where: { id: roleId, organizationId }
    });

    if (!role) {
        throw new NotFoundError('Role not found');
    }

    if (isDefaultRole(role.role)) {
        throw new BadRequestError('Cannot modify default roles');
    }

    if (
        input.name &&
        (input.name.toLowerCase() === 'owner' || isDefaultRole(input.name))
    ) {
        throw new BadRequestError(
            `Role name '${input.name}' is reserved. Use a different name.`
        );
    }

    if (input.permissions) {
        validatePermissions(input.permissions);
    }

    if (input.name && input.name !== role.role) {
        const nameExists = await prisma.organizationRole.findFirst({
            where: {
                organizationId,
                role: input.name.toLowerCase(),
                NOT: { id: roleId }
            }
        });

        if (nameExists) {
            throw new BadRequestError(
                `A role with name '${input.name}' already exists in this organization.`
            );
        }
    }

    const updatedRole = await prisma.organizationRole.update({
        where: { id: roleId },
        data: {
            ...(input.name && { role: input.name.toLowerCase() }),
            ...(input.description !== undefined && {
                description: input.description
            }),
            ...(input.permissions && {
                permission: JSON.stringify(input.permissions)
            })
        }
    });

    return {
        id: updatedRole.id,
        name: updatedRole.role,
        description: updatedRole.description || undefined,
        permissions:
            typeof updatedRole.permission === 'string'
                ? JSON.parse(updatedRole.permission)
                : (updatedRole.permission as unknown as RolePermissions),
        isDefault: isDefaultRole(updatedRole.role)
    };
};

export const deleteRole = async (roleId: string, organizationId: string) => {
    const role = await prisma.organizationRole.findFirst({
        where: { id: roleId, organizationId }
    });

    if (!role) {
        throw new NotFoundError('Role not found');
    }

    if (isDefaultRole(role.role)) {
        throw new BadRequestError('Cannot delete default roles');
    }

    await prisma.organizationRole.delete({
        where: { id: roleId }
    });

    return { success: true, message: 'Role deleted successfully' };
};
