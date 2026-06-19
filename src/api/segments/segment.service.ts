import prisma from '../../config/prisma.config.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { buildPrismaWhere, validateSegmentFilter } from './segment.utils.js';
import type {
    CreateSegmentInput,
    UpdateSegmentInput
} from './segment.schemas.js';
import { AppError } from '../../utils/response.util.js';

export async function createSegment(
    data: CreateSegmentInput,
    organizationId: string,
    creatorId: string | null
) {
    const validation = validateSegmentFilter(data.filter);
    if (!validation.valid) {
        throw new AppError(
            `Invalid segment filter: ${validation.error}`,
            400,
            'VALIDATION_ERROR'
        );
    }

    const segment = await prisma.segment.create({
        data: {
            name: data.name,
            description: data.description,
            filter: data.filter as Prisma.InputJsonValue,
            organizationId,
            creatorId
        }
    });

    const size = await getSegmentCustomerCount(segment.id, organizationId);
    return prisma.segment.update({
        where: { id: segment.id },
        data: { size }
    });
}

const segmentInclude = (organizationId: string) =>
    ({
        creator: {
            select: {
                name: true,
                image: true,
                members: {
                    where: { organizationId },
                    select: { role: true }
                }
            }
        },
        _count: {
            select: { campaigns: true }
        }
    }) as const;

type SegmentWithCreator = Prisma.SegmentGetPayload<{
    include: ReturnType<typeof segmentInclude>;
}>;

function flattenCreator(
    s: SegmentWithCreator,
    _organizationId: string
): Prisma.SegmentGetPayload<object> & {
    creator: string | null;
    creatorRole: string | null;
    creatorImage: string | null;
    usedInCount: number;
} {
    const { creator, _count, ...rest } = s;
    return {
        ...rest,
        creator: creator?.name ?? null,
        creatorRole: creator?.members?.[0]?.role ?? null,
        creatorImage: creator?.image ?? null,
        usedInCount: _count?.campaigns ?? 0
    };
}

export async function getSegments(
    organizationId: string,
    take: number,
    skip: number,
    search?: string
) {
    const where: Prisma.SegmentWhereInput = {
        organizationId,
        ...(search && {
            name: { contains: search, mode: 'insensitive' }
        })
    };

    const [segments, total] = await Promise.all([
        prisma.segment.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take,
            skip,
            include: segmentInclude(organizationId)
        }),
        prisma.segment.count({ where })
    ]);

    return {
        segments: segments.map((s) =>
            flattenCreator(s as unknown as SegmentWithCreator, organizationId)
        ),
        total
    };
}

async function getSegmentForOrg(id: string, organizationId: string) {
    const segment = await prisma.segment.findUnique({ where: { id } });
    if (!segment || segment.organizationId !== organizationId) {
        throw new AppError('Segment not found', 404, 'NOT_FOUND');
    }
    return segment;
}

export async function getSegmentById(id: string, organizationId: string) {
    await getSegmentForOrg(id, organizationId);
    return refreshSegmentSize(id, organizationId);
}

async function refreshSegmentSize(id: string, organizationId: string) {
    const size = await computeSegmentCustomerCount(id, organizationId);
    const segment = await prisma.segment.update({
        where: { id },
        data: { size },
        include: segmentInclude(organizationId)
    });
    return flattenCreator(
        segment as unknown as SegmentWithCreator,
        organizationId
    );
}

async function computeSegmentCustomerCount(
    segmentId: string,
    organizationId: string
): Promise<number> {
    const segment = await prisma.segment.findUnique({
        where: { id: segmentId },
        select: { filter: true }
    });
    if (!segment) return 0;

    const where = buildPrismaWhere(segment.filter);
    return prisma.customer.count({
        where: { ...where, organizationId } as Prisma.CustomerWhereInput
    });
}

export async function updateSegment(
    id: string,
    data: UpdateSegmentInput,
    organizationId: string
) {
    const existing = await getSegmentForOrg(id, organizationId);

    if (data.filter) {
        const validation = validateSegmentFilter(data.filter);
        if (!validation.valid) {
            throw new AppError(
                `Invalid segment filter: ${validation.error}`,
                400,
                'VALIDATION_ERROR'
            );
        }
    }

    const updated = await prisma.segment.update({
        where: { id: existing.id },
        data: {
            ...(data.name !== undefined && { name: data.name }),
            ...(data.description !== undefined && {
                description: data.description
            }),
            ...(data.filter !== undefined && {
                filter: data.filter as Prisma.InputJsonValue
            })
        }
    });

    if (data.filter !== undefined) {
        const size = await computeSegmentCustomerCount(
            existing.id,
            organizationId
        );
        return prisma.segment.update({
            where: { id: existing.id },
            data: { size }
        });
    }

    return updated;
}

export async function deleteSegment(id: string, organizationId: string) {
    const existing = await getSegmentForOrg(id, organizationId);

    await prisma.segment.delete({
        where: { id: existing.id }
    });
}

export async function getSegmentCustomerCount(
    segmentId: string,
    organizationId: string
): Promise<number> {
    const segment = await getSegmentForOrg(segmentId, organizationId);

    const where = buildPrismaWhere(segment.filter);
    const segmentWhere = {
        ...where,
        organizationId
    } as Prisma.CustomerWhereInput;

    return prisma.customer.count({ where: segmentWhere });
}

export async function getSegmentCustomers(
    segmentId: string,
    organizationId: string,
    take: number,
    skip: number,
    sortBy: string,
    sortOrder: 'asc' | 'desc'
) {
    const segment = await getSegmentById(segmentId, organizationId);

    const where = buildPrismaWhere(segment.filter);
    const segmentWhere = {
        ...where,
        organizationId
    } as Prisma.CustomerWhereInput;

    const allowedSortFields = [
        'name',
        'totalSpent',
        'totalOrders',
        'lastOrderAt',
        'createdAt'
    ];
    const actualSortBy = allowedSortFields.includes(sortBy)
        ? sortBy
        : 'createdAt';

    const [customers, total] = await Promise.all([
        prisma.customer.findMany({
            where: segmentWhere,
            orderBy: { [actualSortBy]: sortOrder },
            take,
            skip,
            include: { tags: true }
        }),
        prisma.customer.count({ where: segmentWhere })
    ]);

    return { customers, total };
}

export async function getSegmentPreview(
    segmentId: string,
    organizationId: string,
    limit: number = 5
) {
    const segment = await getSegmentById(segmentId, organizationId);
    const where = buildPrismaWhere(segment.filter);

    const customers = await prisma.customer.findMany({
        where: {
            ...where,
            organizationId
        } as Prisma.CustomerWhereInput,
        take: limit,
        select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            totalSpent: true,
            totalOrders: true
        }
    });

    const total = await getSegmentCustomerCount(segmentId, organizationId);

    return {
        segment,
        preview: customers,
        total
    };
}
