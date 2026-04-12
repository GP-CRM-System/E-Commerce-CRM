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
    organizationId: string
) {
    const validation = validateSegmentFilter(data.filter);
    if (!validation.valid) {
        throw new AppError(
            `Invalid segment filter: ${validation.error}`,
            400,
            'VALIDATION_ERROR'
        );
    }

    return prisma.segment.create({
        data: {
            name: data.name,
            description: data.description,
            filter: data.filter as Prisma.InputJsonValue,
            organizationId
        }
    });
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
            skip
        }),
        prisma.segment.count({ where })
    ]);

    return { segments, total };
}

export async function getSegmentById(id: string, organizationId: string) {
    const segment = await prisma.segment.findUnique({
        where: { id }
    });

    if (!segment) {
        throw new AppError('Segment not found', 404, 'NOT_FOUND');
    }

    if (segment.organizationId !== organizationId) {
        throw new AppError('Segment not found', 404, 'NOT_FOUND');
    }

    return segment;
}

export async function updateSegment(
    id: string,
    data: UpdateSegmentInput,
    organizationId: string
) {
    const existing = await getSegmentById(id, organizationId);

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

    return prisma.segment.update({
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
}

export async function deleteSegment(id: string, organizationId: string) {
    const existing = await getSegmentById(id, organizationId);

    await prisma.segment.delete({
        where: { id: existing.id }
    });
}

export async function getSegmentCustomerCount(
    segmentId: string,
    organizationId: string
): Promise<number> {
    const segment = await getSegmentById(segmentId, organizationId);

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
