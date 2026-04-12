import { z } from 'zod';

export const createCustomer = z.object({
    name: z.string().min(2).max(50).trim().nonempty(),
    phone: z.string().min(11).max(13).trim().optional(),
    email: z.email().trim().optional(),
    city: z.string().trim().optional(),
    address: z.string().trim().optional(),
    source: z
        .enum([
            'WEBSITE',
            'SOCIAL',
            'REFERRAL',
            'ORGANIC',
            'EMAIL',
            'CAMPAIGN',
            'OTHER'
        ])
        .default('OTHER'),
    lifecycleStage: z
        .enum([
            'PROSPECT',
            'ONE_TIME',
            'RETURNING',
            'LOYAL',
            'VIP',
            'AT_RISK',
            'CHURNED',
            'WINBACK'
        ])
        .default('PROSPECT'),

    // E-Commerce Specific Fields
    externalId: z.string().trim().optional(),
    acceptsMarketing: z.boolean().default(false),

    // Advanced E-commerce Metrics (Optional for manual entry/sync)
    totalOrders: z.number().int().min(0).optional(),
    totalSpent: z.number().min(0).optional(),
    totalRefunded: z.number().min(0).optional(),
    avgOrderValue: z.number().min(0).optional(),
    firstOrderAt: z.coerce.date().optional(),
    lastOrderAt: z.coerce.date().optional(),
    avgDaysBetweenOrders: z.number().optional(),
    churnRiskScore: z.number().min(0).max(1).optional(),
    rfmScore: z.string().optional(),
    rfmSegment: z.string().optional(),
    cohortMonth: z.string().optional(),

    createdAt: z.coerce.date().default(() => new Date()),
    updatedAt: z.coerce.date().default(() => new Date())
});

export const updateCustomer = z.object({
    name: z.string().min(2).max(50).trim().optional(),
    phone: z.string().min(11).max(13).trim().optional(),
    email: z.string().email().trim().optional(),
    city: z.string().trim().optional(),
    address: z.string().trim().optional(),
    source: z
        .enum([
            'WEBSITE',
            'SOCIAL',
            'REFERRAL',
            'ORGANIC',
            'EMAIL',
            'CAMPAIGN',
            'OTHER'
        ])
        .optional(),
    lifecycleStage: z
        .enum([
            'PROSPECT',
            'ONE_TIME',
            'RETURNING',
            'LOYAL',
            'VIP',
            'AT_RISK',
            'CHURNED',
            'WINBACK'
        ])
        .optional(),

    // E-Commerce Specific Fields
    externalId: z.string().trim().optional(),
    acceptsMarketing: z.boolean().optional(),

    // Advanced E-commerce Metrics
    totalOrders: z.number().int().min(0).optional(),
    totalSpent: z.number().min(0).optional(),
    totalRefunded: z.number().min(0).optional(),
    avgOrderValue: z.number().min(0).optional(),
    firstOrderAt: z.coerce.date().optional(),
    lastOrderAt: z.coerce.date().optional(),
    avgDaysBetweenOrders: z.number().optional(),
    churnRiskScore: z.number().min(0).max(1).optional(),
    rfmScore: z.string().optional(),
    rfmSegment: z.string().optional(),
    cohortMonth: z.string().optional(),

    updatedAt: z.coerce.date().default(() => new Date())
});

export const createNote = z.object({
    body: z.string().min(1, 'Note body cannot be empty').nonempty().trim()
});

export const updateNote = z.object({
    body: z.string().min(1, 'Note body cannot be empty').nonempty().trim()
});

export const createEvent = z.object({
    eventType: z.enum([
        'ORDER_PLACED',
        'ORDER_SHIPPED',
        'ORDER_DELIVERED',
        'ORDER_CANCELLED',
        'ORDER_REFUNDED',
        'ORDER_RETURNED'
    ]),
    description: z.string().trim(),
    metadata: z.any().optional().nullable(),
    source: z.string().trim(),
    occurredAt: z.coerce.date().default(() => new Date())
});

export const updateEvent = z.object({
    eventType: z
        .enum([
            'ORDER_PLACED',
            'ORDER_SHIPPED',
            'ORDER_DELIVERED',
            'ORDER_CANCELLED',
            'ORDER_REFUNDED',
            'ORDER_RETURNED'
        ])
        .optional(),
    description: z.string().trim().optional(),
    metadata: z.any().optional(),
    source: z.string().trim().optional(),
    occurredAt: z.coerce.date().optional()
});

export const customerFilters = z.object({
    search: z.string().optional(),
    city: z.string().optional(),
    source: z
        .enum([
            'WEBSITE',
            'SOCIAL',
            'REFERRAL',
            'ORGANIC',
            'EMAIL',
            'CAMPAIGN',
            'OTHER'
        ])
        .optional(),
    lifecycleStage: z
        .enum([
            'PROSPECT',
            'ONE_TIME',
            'RETURNING',
            'LOYAL',
            'VIP',
            'AT_RISK',
            'CHURNED',
            'WINBACK'
        ])
        .optional(),
    tagId: z.string().optional(),
    segmentId: z.string().optional(),
    sortBy: z
        .enum([
            'createdAt',
            'updatedAt',
            'name',
            'totalSpent',
            'totalOrders',
            'lastOrderAt'
        ])
        .optional()
        .default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc')
});

export type CustomerFilters = z.infer<typeof customerFilters>;
