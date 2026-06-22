import prisma from '../../config/prisma.config.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { CreateTagInput, UpdateTagInput } from './tags.schemas.js';
import { AppError } from '../../utils/response.util.js';

export async function createTag(data: CreateTagInput, organizationId: string) {
    const existing = await prisma.tag.findUnique({
        where: { organizationId_name: { organizationId, name: data.name } }
    });
    if (existing) {
        throw new AppError(
            'A tag with this name already exists',
            409,
            'CONFLICT'
        );
    }

    return prisma.tag.create({
        data: { ...data, organizationId }
    });
}

export async function listTags(
    organizationId: string,
    take: number,
    skip: number,
    search?: string
) {
    const where: Prisma.TagWhereInput = {
        organizationId,
        ...(search && {
            name: { contains: search, mode: 'insensitive' }
        })
    };

    const [tags, total] = await Promise.all([
        prisma.tag.findMany({
            where,
            orderBy: { name: 'asc' },
            take,
            skip
        }),
        prisma.tag.count({ where })
    ]);

    return { tags, total };
}

export async function getTagById(id: string, organizationId: string) {
    const tag = await prisma.tag.findFirst({
        where: { id, organizationId }
    });
    if (!tag) {
        throw new AppError('Tag not found', 404, 'NOT_FOUND');
    }
    return tag;
}

export async function updateTag(
    id: string,
    data: UpdateTagInput,
    organizationId: string
) {
    const tag = await prisma.tag.findFirst({
        where: { id, organizationId }
    });
    if (!tag) {
        throw new AppError('Tag not found', 404, 'NOT_FOUND');
    }

    if (data.name && data.name !== tag.name) {
        const existing = await prisma.tag.findUnique({
            where: { organizationId_name: { organizationId, name: data.name } }
        });
        if (existing) {
            throw new AppError(
                'A tag with this name already exists',
                409,
                'CONFLICT'
            );
        }
    }

    return prisma.tag.update({
        where: { id },
        data
    });
}

export async function deleteTag(id: string, organizationId: string) {
    const tag = await prisma.tag.findFirst({
        where: { id, organizationId }
    });
    if (!tag) {
        throw new AppError('Tag not found', 404, 'NOT_FOUND');
    }

    await prisma.tag.delete({ where: { id } });
}
