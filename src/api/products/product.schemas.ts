import { z } from 'zod';

export const createProduct = z.object({
    name: z.string().min(1).max(100).trim().nonempty(),
    price: z.number().min(0),
    description: z.string().trim().optional(),
    externalId: z.string().trim().optional(),
    sku: z.string().trim().optional(),
    category: z.string().trim().optional(),
    imageUrl: z.string().url().optional(),
    barcode: z.string().trim().optional(),
    weight: z.number().min(0).optional(),
    weightUnit: z.enum(['kg', 'lb', 'oz', 'g']).optional(),
    inventory: z.number().int().min(0).default(0),
    status: z.enum(['active', 'draft', 'archived']).default('active'),
    createdAt: z.coerce.date().default(() => new Date()),
    updatedAt: z.coerce.date().default(() => new Date())
});

export const updateProduct = z.object({
    name: z.string().min(1).max(100).trim().optional(),
    price: z.number().min(0).optional(),
    description: z.string().trim().optional(),
    externalId: z.string().trim().optional(),
    sku: z.string().trim().optional(),
    category: z.string().trim().optional(),
    imageUrl: z.string().url().optional(),
    barcode: z.string().trim().optional(),
    weight: z.number().min(0).optional(),
    weightUnit: z.enum(['kg', 'lb', 'oz', 'g']).optional(),
    inventory: z.number().int().min(0).optional(),
    status: z.enum(['active', 'draft', 'archived']).optional(),
    updatedAt: z.coerce.date().default(() => new Date())
});

export const createProductVariant = z.object({
    name: z.string().min(1).trim().nonempty(),
    sku: z.string().trim().optional(),
    price: z.number().min(0),
    barcode: z.string().trim().optional(),
    weight: z.number().min(0).optional(),
    weightUnit: z.enum(['kg', 'lb', 'oz', 'g']).optional(),
    inventory: z.number().int().min(0).default(0),
    position: z.number().int().min(0).default(0),
    imageUrl: z.string().url().optional(),
    externalId: z.string().trim().optional(),
    options: z.any().optional()
});

export const updateProductVariant = z.object({
    name: z.string().min(1).trim().optional(),
    sku: z.string().trim().optional(),
    price: z.number().min(0).optional(),
    barcode: z.string().trim().optional(),
    weight: z.number().min(0).optional(),
    weightUnit: z.enum(['kg', 'lb', 'oz', 'g']).optional(),
    inventory: z.number().int().min(0).optional(),
    position: z.number().int().min(0).optional(),
    imageUrl: z.string().url().optional(),
    externalId: z.string().trim().optional(),
    options: z.any().optional()
});
