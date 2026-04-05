import { z } from 'zod';

export const createOrder = z.object({
    customerId: z.string().min(1),
    externalId: z.string().trim().optional(),
    discountAmount: z.number().min(0).default(0),
    refundAmount: z.number().min(0).default(0),
    subtotal: z.number().min(0).optional(),
    taxAmount: z.number().min(0).optional(),
    shippingAmount: z.number().min(0).optional(),
    totalAmount: z.number().min(0).optional(),
    currency: z.string().default('USD'),
    fulfillmentStatus: z
        .enum(['unfulfilled', 'partial', 'fulfilled'])
        .optional(),
    fulfillmentItems: z.any().optional(),
    note: z.string().trim().optional(),
    tags: z.string().trim().optional(),
    source: z.string().trim().optional(),
    referringSite: z.string().url().optional(),
    items: z
        .array(
            z.object({
                productId: z.string().min(1),
                quantity: z.number().int().min(1),
                price: z.number().min(0)
            })
        )
        .min(1),
    createdAt: z.coerce.date().default(() => new Date()),
    updatedAt: z.coerce.date().default(() => new Date())
});

export const updateOrder = z.object({
    externalId: z.string().trim().optional(),
    discountAmount: z.number().min(0).optional(),
    refundAmount: z.number().min(0).optional(),
    subtotal: z.number().min(0).optional(),
    taxAmount: z.number().min(0).optional(),
    shippingAmount: z.number().min(0).optional(),
    totalAmount: z.number().min(0).optional(),
    currency: z.string().optional(),
    fulfillmentStatus: z
        .enum(['unfulfilled', 'partial', 'fulfilled'])
        .optional(),
    fulfillmentItems: z.any().optional(),
    note: z.string().trim().optional(),
    tags: z.string().trim().optional(),
    source: z.string().trim().optional(),
    referringSite: z.string().url().optional(),
    shippingStatus: z
        .enum(['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'])
        .optional(),
    paymentStatus: z.enum(['PENDING', 'PAID', 'FAILED', 'REFUNDED']).optional(),
    updatedAt: z.coerce.date().default(() => new Date())
});

export const orderFilters = z.object({
    search: z.coerce.string().optional(),
    status: z.enum(['unfulfilled', 'partial', 'fulfilled']).optional(),
    paymentStatus: z.enum(['PENDING', 'PAID', 'FAILED', 'REFUNDED']).optional(),
    shippingStatus: z
        .enum(['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'])
        .optional(),
    customerId: z.coerce.string().optional(),
    sortBy: z
        .enum(['createdAt', 'updatedAt', 'totalAmount'])
        .optional()
        .default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc')
});

export type OrderFilters = z.infer<typeof orderFilters>;
