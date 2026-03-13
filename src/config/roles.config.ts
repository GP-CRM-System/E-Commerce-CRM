export const DEFAULT_ROLES = {
    root: {
        organization: ['update', 'delete'],
        member: ['create', 'update', 'delete'],
        invitation: ['create', 'cancel'],
        team: ['create', 'update', 'delete'],
        ac: ['create', 'read', 'update', 'delete'],
        orders: ['read', 'write', 'delete'],
        employees: ['read', 'write', 'delete']
    },
    admin: {
        organization: ['update'],
        member: ['create', 'update', 'delete'],
        invitation: ['create', 'cancel'],
        team: ['create', 'update', 'delete'],
        ac: ['create', 'read', 'update', 'delete'],
        orders: ['read', 'write', 'delete'],
        employees: ['read', 'write', 'delete']
    },
    member: {
        organization: [],
        member: [],
        invitation: [],
        team: [],
        ac: [],
        orders: ['read'],
        employees: ['read']
    }
} as const;

export type DefaultRoleName = keyof typeof DEFAULT_ROLES;
