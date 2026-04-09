import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';

const OPERATORS = [
    'eq',
    'neq',
    'gt',
    'gte',
    'lt',
    'lte',
    'contains',
    'startsWith',
    'endsWith',
    'in',
    'notIn',
    'isNull',
    'isNotNull'
] as const;

const ALLOWED_FIELDS = [
    'name',
    'phone',
    'email',
    'city',
    'address',
    'source',
    'lifecycleStage',
    'externalId',
    'totalOrders',
    'totalSpent',
    'totalRefunded',
    'avgOrderValue',
    'firstOrderAt',
    'lastOrderAt',
    'avgDaysBetweenOrders',
    'churnRiskScore',
    'rfmScore',
    'rfmSegment',
    'rfmRecency',
    'rfmFrequency',
    'rfmMonetary',
    'lastScoredAt',
    'cohortMonth',
    'acceptsMarketing',
    'isLoyaltyMember',
    'accountAgeMonths',
    'engagementScore',
    'satisfactionScore',
    'supportTicketsCount'
] as const;

type FieldName = (typeof ALLOWED_FIELDS)[number];

const fieldSchema = z.enum(ALLOWED_FIELDS);
const operatorSchema = z.enum(OPERATORS);

const conditionSchema: z.ZodType<SegmentCondition> = z.lazy(() =>
    z.object({
        field: fieldSchema,
        operator: operatorSchema,
        value: z
            .union([z.string(), z.number(), z.boolean(), z.date()])
            .optional()
    })
);

const MAX_DEPTH = 5;

const andGroupSchema: z.ZodType<SegmentAndGroup> = z.lazy(() =>
    z.object({
        and: z.array(z.union([conditionSchema, orGroupSchema, andGroupSchema]))
    })
);

const orGroupSchema: z.ZodType<SegmentOrGroup> = z.lazy(() =>
    z.object({
        or: z.array(z.union([conditionSchema, andGroupSchema, orGroupSchema]))
    })
);

export const segmentFilterSchema = z.union([
    conditionSchema,
    andGroupSchema,
    orGroupSchema
]);

export type SegmentFilter = z.infer<typeof segmentFilterSchema>;

function getFilterDepth(filter: unknown, currentDepth = 1): number {
    if (currentDepth > MAX_DEPTH) return currentDepth;
    if (!filter || typeof filter !== 'object') return currentDepth;

    if ('and' in filter && Array.isArray(filter.and)) {
        if (filter.and.length === 0) return currentDepth;
        return Math.max(
            currentDepth,
            ...filter.and.map((item) => getFilterDepth(item, currentDepth + 1))
        );
    }
    if ('or' in filter && Array.isArray(filter.or)) {
        if (filter.or.length === 0) return currentDepth;
        return Math.max(
            currentDepth,
            ...filter.or.map((item) => getFilterDepth(item, currentDepth + 1))
        );
    }
    return currentDepth;
}

export type SegmentCondition = {
    field: FieldName;
    operator: (typeof OPERATORS)[number];
    value?: string | number | boolean | Date;
};
export type SegmentAndGroup = {
    and: (SegmentCondition | SegmentOrGroup | SegmentAndGroup)[];
};
export type SegmentOrGroup = {
    or: (SegmentCondition | SegmentAndGroup | SegmentOrGroup)[];
};

export function isCondition(item: unknown): item is SegmentCondition {
    return (
        typeof item === 'object' &&
        item !== null &&
        'field' in item &&
        'operator' in item
    );
}

export function isGroup(
    item: unknown
): item is SegmentAndGroup | SegmentOrGroup {
    return (
        typeof item === 'object' &&
        item !== null &&
        ('and' in item || 'or' in item)
    );
}

function mapOperator(operator: string): string {
    const mapping: Record<string, string> = {
        eq: 'equals',
        neq: 'not',
        contains: 'contains',
        startsWith: 'startsWith',
        endsWith: 'endsWith',
        in: 'in',
        notIn: 'notIn'
    };

    return mapping[operator] || operator;
}

function resolveConditionValue(
    field: string,
    operator: string,
    value: unknown
): unknown {
    const dateFields = [
        'firstOrderAt',
        'lastOrderAt',
        'lastScoredAt',
        'createdAt',
        'updatedAt'
    ];

    if (dateFields.includes(field) && typeof value === 'string') {
        return new Date(value);
    }

    const numericFields = [
        'totalOrders',
        'totalSpent',
        'totalRefunded',
        'avgOrderValue',
        'avgDaysBetweenOrders',
        'churnRiskScore',
        'rfmScore',
        'rfmRecency',
        'rfmFrequency',
        'rfmMonetary',
        'accountAgeMonths',
        'engagementScore',
        'satisfactionScore',
        'supportTicketsCount'
    ];

    if (numericFields.includes(field) && typeof value === 'string') {
        return parseFloat(value);
    }

    return value;
}

function buildConditionWhere(
    condition: SegmentCondition
): Prisma.CustomerWhereInput {
    const { field, operator, value } = condition;

    if (operator === 'isNull') {
        return { [field]: null };
    }
    if (operator === 'isNotNull') {
        return { [field]: { not: null } };
    }

    const resolvedValue = resolveConditionValue(field, operator, value);

    return {
        [field]: { [mapOperator(operator)]: resolvedValue }
    } as Prisma.CustomerWhereInput;
}

function buildGroupWhere(
    group: SegmentAndGroup | SegmentOrGroup
): Prisma.CustomerWhereInput {
    if ('and' in group) {
        const conditions = group.and.map((item) => {
            if (isCondition(item)) {
                return buildConditionWhere(item);
            }
            return buildGroupWhere(item);
        });
        return { AND: conditions };
    }

    if ('or' in group) {
        const conditions = group.or.map((item) => {
            if (isCondition(item)) {
                return buildConditionWhere(item);
            }
            return buildGroupWhere(item);
        });
        return { OR: conditions };
    }

    return {};
}

export function buildPrismaWhere(filter: unknown): Prisma.CustomerWhereInput {
    if (!filter) {
        return {};
    }

    const parseResult = segmentFilterSchema.safeParse(filter);
    if (!parseResult.success) {
        throw new Error(`Invalid segment filter: ${parseResult.error.message}`);
    }

    const parsed = parseResult.data;

    if (isCondition(parsed)) {
        return buildConditionWhere(parsed);
    }

    return buildGroupWhere(parsed);
}

export function validateSegmentFilter(filter: unknown): {
    valid: boolean;
    error?: string;
} {
    const result = segmentFilterSchema.safeParse(filter);
    if (!result.success) {
        return {
            valid: false,
            error: result.error.message
        };
    }

    if (getFilterDepth(filter) > MAX_DEPTH) {
        return {
            valid: false,
            error: `Filter nesting exceeds maximum depth of ${MAX_DEPTH}`
        };
    }

    return { valid: true };
}
