import logger from '../../utils/logger.util.js';
import prisma from '../../config/prisma.config.js';
import { z } from 'zod';
import * as productSchema from './product.schemas.js';
import type { Product, ProductVariant } from '../../generated/prisma/client.js';
import type { ProductFilters } from './product.schemas.js';

export async function getAllProducts(
    organizationId: string,
    take: number,
    skip: number,
    filters?: ProductFilters
): Promise<{
    products: Product[];
    total: number;
}> {
    try {
        const search = filters?.search;
        const category = filters?.category;
        const status = filters?.status;
        const minPrice = filters?.minPrice;
        const maxPrice = filters?.maxPrice;
        const sortBy = filters?.sortBy || 'createdAt';
        const sortOrder = filters?.sortOrder || 'desc';

        const [products, total] = await Promise.all([
            prisma.product.findMany({
                where: {
                    organizationId,
                    ...(search && {
                        OR: [
                            { name: { contains: search, mode: 'insensitive' } },
                            {
                                description: {
                                    contains: search,
                                    mode: 'insensitive'
                                }
                            },
                            { sku: { contains: search, mode: 'insensitive' } }
                        ]
                    }),
                    ...(category && {
                        category: { equals: category, mode: 'insensitive' }
                    }),
                    ...(status && { status }),
                    ...(minPrice !== undefined && { price: { gte: minPrice } }),
                    ...(maxPrice !== undefined && { price: { lte: maxPrice } })
                },
                orderBy: {
                    [sortBy]: sortOrder
                },
                take,
                skip,
                include: {
                    variants: true
                }
            }),
            prisma.product.count({
                where: {
                    organizationId,
                    ...(search && {
                        OR: [
                            { name: { contains: search, mode: 'insensitive' } },
                            {
                                description: {
                                    contains: search,
                                    mode: 'insensitive'
                                }
                            },
                            { sku: { contains: search, mode: 'insensitive' } }
                        ]
                    }),
                    ...(category && {
                        category: { equals: category, mode: 'insensitive' }
                    }),
                    ...(status && { status }),
                    ...(minPrice !== undefined && { price: { gte: minPrice } }),
                    ...(maxPrice !== undefined && { price: { lte: maxPrice } })
                }
            })
        ]);

        return { products, total };
    } catch (error) {
        logger.error(`Error fetching products: ${error}`);
        throw error;
    }
}

export async function createProduct(
    data: z.infer<typeof productSchema.createProduct>,
    activeOrganizationId: string
): Promise<Product> {
    try {
        const product = await prisma.product.create({
            data: {
                ...data,
                organizationId: activeOrganizationId,
                createdAt: new Date(),
                updatedAt: new Date()
            }
        });

        return product;
    } catch (error) {
        logger.error(`Error creating product: ${error}`);
        throw error;
    }
}

export async function getProductDetails(
    id: string,
    organizationId: string
): Promise<Product | null> {
    try {
        const product = await prisma.product.findUnique({
            where: {
                id,
                organizationId
            },
            include: {
                variants: true,
                orderItems: true
            }
        });

        return product;
    } catch (error) {
        logger.error(`Error fetching product: ${error}`);
        throw error;
    }
}

export async function updateProduct(
    id: string,
    data: z.infer<typeof productSchema.updateProduct>,
    organizationId: string
): Promise<Product> {
    try {
        const product = await prisma.product.update({
            where: {
                id,
                organizationId
            },
            data: {
                ...data,
                updatedAt: new Date()
            }
        });

        return product;
    } catch (error) {
        logger.error(`Error updating product: ${error}`);
        throw error;
    }
}

export async function deleteProduct(
    id: string,
    organizationId: string
): Promise<Product> {
    try {
        const product = await prisma.product.delete({
            where: {
                id,
                organizationId
            }
        });

        return product;
    } catch (error) {
        logger.error(`Error deleting product: ${error}`);
        throw error;
    }
}

export async function createVariant(
    productId: string,
    data: z.infer<typeof productSchema.createProductVariant>
): Promise<ProductVariant> {
    try {
        const variant = await prisma.productVariant.create({
            data: {
                ...data,
                productId
            }
        });

        return variant;
    } catch (error) {
        logger.error(`Error creating variant: ${error}`);
        throw error;
    }
}

export async function updateVariant(
    variantId: string,
    productId: string,
    data: z.infer<typeof productSchema.updateProductVariant>
): Promise<ProductVariant> {
    try {
        const variant = await prisma.productVariant.update({
            where: {
                id: variantId,
                productId
            },
            data
        });

        return variant;
    } catch (error) {
        logger.error(`Error updating variant: ${error}`);
        throw error;
    }
}

export async function deleteVariant(
    variantId: string,
    productId: string
): Promise<ProductVariant> {
    try {
        const variant = await prisma.productVariant.delete({
            where: {
                id: variantId,
                productId
            }
        });

        return variant;
    } catch (error) {
        logger.error(`Error deleting variant: ${error}`);
        throw error;
    }
}

export async function findProductByExternalId(
    externalId: string,
    organizationId: string
): Promise<Product | null> {
    return prisma.product.findFirst({
        where: {
            externalId,
            organizationId
        }
    });
}

export async function findProductBySku(
    sku: string,
    organizationId: string
): Promise<Product | null> {
    return prisma.product.findFirst({
        where: {
            sku,
            organizationId
        }
    });
}
