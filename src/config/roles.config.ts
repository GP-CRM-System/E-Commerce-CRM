export type RolePermissions = {
    organization: ('read' | 'update' | 'delete')[];
    member: ('read' | 'create' | 'update' | 'delete')[];
    invitation: ('read' | 'create' | 'cancel')[];
    team: ('read' | 'create' | 'update' | 'delete')[];
    ac: ('read' | 'create' | 'update' | 'delete')[];
    customers: ('read' | 'write' | 'delete')[];
    orders: ('read' | 'write' | 'delete')[];
    products: ('read' | 'write' | 'delete')[];
    imports: ('read' | 'write')[];
    exports: ('read' | 'write')[];
    integrations: ('read' | 'write' | 'delete')[];
    webhooks: ('read' | 'write' | 'delete')[];
    sync: ('read' | 'write')[];
    segments: ('read' | 'write' | 'delete')[];
    campaigns: ('read' | 'write' | 'delete')[];
    supportTickets: ('read' | 'write' | 'delete')[];
    tags: ('read' | 'write' | 'delete')[];
    reports: 'read'[];
    notifications: ('read' | 'write' | 'delete')[];
};

export const DEFAULT_ROLES = {
    root: {
        organization: ['read', 'update', 'delete'],
        member: ['read', 'create', 'update', 'delete'],
        invitation: ['read', 'create', 'cancel'],
        team: ['read', 'create', 'update', 'delete'],
        ac: ['create', 'read', 'update', 'delete'],
        customers: ['read', 'write', 'delete'],
        orders: ['read', 'write', 'delete'],
        products: ['read', 'write', 'delete'],
        imports: ['read', 'write'],
        exports: ['read', 'write'],
        integrations: ['read', 'write', 'delete'],
        webhooks: ['read', 'write', 'delete'],
        sync: ['read', 'write'],
        segments: ['read', 'write', 'delete'],
        campaigns: ['read', 'write', 'delete'],
        supportTickets: ['read', 'write', 'delete'],
        tags: ['read', 'write', 'delete'],
        reports: ['read'],
        notifications: ['read', 'write', 'delete']
    },
    admin: {
        organization: ['read', 'update'],
        member: ['read', 'create', 'update', 'delete'],
        invitation: ['read', 'create', 'cancel'],
        team: ['read', 'create', 'update', 'delete'],
        ac: ['read'],
        customers: ['read', 'write', 'delete'],
        orders: ['read', 'write', 'delete'],
        products: ['read', 'write', 'delete'],
        imports: ['read', 'write'],
        exports: ['read', 'write'],
        integrations: ['read', 'write', 'delete'],
        webhooks: ['read', 'write', 'delete'],
        sync: ['read', 'write'],
        segments: ['read', 'write', 'delete'],
        campaigns: ['read', 'write', 'delete'],
        supportTickets: ['read', 'write', 'delete'],
        tags: ['read', 'write', 'delete'],
        reports: ['read'],
        notifications: ['read', 'write', 'delete']
    },
    member: {
        organization: [],
        member: [],
        invitation: [],
        team: [],
        ac: [],
        customers: ['read'],
        orders: ['read'],
        products: ['read'],
        imports: [],
        exports: ['read'],
        integrations: ['read'],
        webhooks: [],
        sync: [],
        segments: ['read'],
        campaigns: ['read'],
        supportTickets: ['read', 'write'],
        tags: ['read'],
        reports: [],
        notifications: ['read']
    }
} as const satisfies Record<string, RolePermissions>;

export type DefaultRoleName = keyof typeof DEFAULT_ROLES;

export const AVAILABLE_PERMISSIONS: RolePermissions = {
    organization: ['read', 'update', 'delete'],
    member: ['read', 'create', 'update', 'delete'],
    invitation: ['read', 'create', 'cancel'],
    team: ['read', 'create', 'update', 'delete'],
    ac: ['read', 'create', 'update', 'delete'],
    customers: ['read', 'write', 'delete'],
    orders: ['read', 'write', 'delete'],
    products: ['read', 'write', 'delete'],
    imports: ['read', 'write'],
    exports: ['read', 'write'],
    integrations: ['read', 'write', 'delete'],
    webhooks: ['read', 'write', 'delete'],
    sync: ['read', 'write'],
    segments: ['read', 'write', 'delete'],
    campaigns: ['read', 'write', 'delete'],
    supportTickets: ['read', 'write', 'delete'],
    tags: ['read', 'write', 'delete'],
    reports: ['read'],
    notifications: ['read', 'write', 'delete']
};
