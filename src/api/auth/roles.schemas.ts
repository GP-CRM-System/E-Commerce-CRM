import { z } from 'zod';
import type { RolePermissions } from '../../config/roles.config.js';
import { AVAILABLE_PERMISSIONS } from '../../config/roles.config.js';

const RESOURCE_KEYS = Object.keys(AVAILABLE_PERMISSIONS) as [
    string,
    ...string[]
];

const isValidPermissions = (permissions: Record<string, string[]>): boolean => {
    for (const [resource, actions] of Object.entries(permissions)) {
        if (!RESOURCE_KEYS.includes(resource)) return false;
        const allowed = AVAILABLE_PERMISSIONS[
            resource as keyof typeof AVAILABLE_PERMISSIONS
        ] as readonly string[];
        for (const action of actions) {
            if (!allowed.includes(action)) return false;
        }
    }
    return true;
};

export const permissionSchemas: Record<
    keyof RolePermissions,
    z.ZodType<unknown>
> = {
    organization: z.array(z.enum(['read', 'update', 'delete'])),
    member: z.array(z.enum(['read', 'create', 'update', 'delete'])),
    invitation: z.array(z.enum(['read', 'create', 'cancel'])),
    team: z.array(z.enum(['read', 'create', 'update', 'delete'])),
    ac: z.array(z.enum(['read', 'create', 'update', 'delete'])),
    customers: z.array(z.enum(['read', 'write', 'delete'])),
    orders: z.array(z.enum(['read', 'write', 'delete'])),
    products: z.array(z.enum(['read', 'write', 'delete'])),
    imports: z.array(z.enum(['read', 'write'])),
    exports: z.array(z.enum(['read', 'write'])),
    integrations: z.array(z.enum(['read', 'write', 'delete'])),
    webhooks: z.array(z.enum(['read', 'write', 'delete'])),
    sync: z.array(z.enum(['read', 'write'])),
    segments: z.array(z.enum(['read', 'write', 'delete'])),
    campaigns: z.array(z.enum(['read', 'write', 'delete'])),
    supportTickets: z.array(z.enum(['read', 'write', 'delete'])),
    tags: z.array(z.enum(['read', 'write', 'delete'])),
    reports: z.array(z.enum(['read'])),
    notifications: z.array(z.enum(['read', 'write', 'delete'])),
    templates: z.array(z.enum(['read', 'write', 'delete'])),
    conversations: z.array(z.enum(['read', 'write', 'delete']))
};

export const createRoleSchema = z.object({
    name: z
        .string()
        .min(1, 'Role name is required')
        .max(50, 'Role name must be 50 characters or less')
        .regex(
            /^[a-z0-9-]+$/,
            'Role name must contain only lowercase letters, numbers, and hyphens'
        ),
    description: z
        .string()
        .max(200, 'Description must be 200 characters or less')
        .optional(),
    permissions: z
        .record(z.string(), z.array(z.string()))
        .refine(isValidPermissions, {
            message: 'Invalid permissions: resource or action not allowed'
        })
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
    name: z
        .string()
        .min(1, 'Role name is required')
        .max(50, 'Role name must be 50 characters or less')
        .regex(
            /^[a-z0-9-]+$/,
            'Role name must contain only lowercase letters, numbers, and hyphens'
        )
        .optional(),
    description: z
        .string()
        .max(200, 'Description must be 200 characters or less')
        .optional(),
    permissions: z
        .record(z.string(), z.array(z.string()))
        .refine(isValidPermissions, {
            message: 'Invalid permissions: resource or action not allowed'
        })
        .optional()
});

export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

export const roleIdSchema = z.object({
    roleId: z.string().min(1, 'Role ID is required')
});

export type RoleIdParams = z.infer<typeof roleIdSchema>;
