import logger from '../../utils/logger.util.js';
import prisma from '../../config/prisma.config.js';
import { z } from 'zod';
import * as orderSchema from './order.schemas.js';
import type { Order } from '../../generated/prisma/client.js';
import type { OrderFilters } from './order.schemas.js';
import { addRFMScoreJob } from '../../queues/rfm.queue.js';

export async function getAllOrders(
    organizationId: string,
    take: number,
    skip: number,
    filters?: OrderFilters
): Promise<{
    orders: Order[];
    total: number;
}> {
    try {
        const search = filters?.search;
        const status = filters?.status;
        const paymentStatus = filters?.paymentStatus;
        const shippingStatus = filters?.shippingStatus;
        const customerId = filters?.customerId;
        const sortBy = filters?.sortBy || 'createdAt';
        const sortOrder = filters?.sortOrder || 'desc';

        const [orders, total] = await Promise.all([
            prisma.order.findMany({
                where: {
                    organizationId,
                    ...(search && {
                        OR: [
                            {
                                externalId: {
                                    contains: search,
                                    mode: 'insensitive'
                                }
                            },
                            { note: { contains: search, mode: 'insensitive' } }
                        ]
                    }),
                    ...(status && { fulfillmentStatus: status }),
                    ...(paymentStatus && { paymentStatus }),
                    ...(shippingStatus && { shippingStatus }),
                    ...(customerId && { customerId })
                },
                orderBy: {
                    [sortBy]: sortOrder
                },
                take,
                skip,
                include: {
                    customer: true,
                    orderItems: {
                        include: {
                            product: true
                        }
                    }
                }
            }),
            prisma.order.count({
                where: {
                    organizationId,
                    ...(search && {
                        OR: [
                            {
                                externalId: {
                                    contains: search,
                                    mode: 'insensitive'
                                }
                            },
                            { note: { contains: search, mode: 'insensitive' } }
                        ]
                    }),
                    ...(status && { fulfillmentStatus: status }),
                    ...(paymentStatus && { paymentStatus }),
                    ...(shippingStatus && { shippingStatus }),
                    ...(customerId && { customerId })
                }
            })
        ]);

        return { orders, total };
    } catch (error) {
        logger.error(`Error fetching orders: ${error}`);
        throw error;
    }
}

export async function createOrder(
    data: z.infer<typeof orderSchema.createOrder>,
    activeOrganizationId: string
): Promise<Order> {
    try {
        const { items, createdAt, ...orderData } = data;

        const order = await prisma.order.create({
            data: {
                ...orderData,
                organizationId: activeOrganizationId,
                orderItems: {
                    create: items.map((item) => ({
                        productId: item.productId,
                        quantity: item.quantity,
                        price: item.price
                    }))
                },
                createdAt,
                updatedAt: new Date()
            },
            include: {
                orderItems: true,
                customer: true
            }
        });

        if (order.customerId) {
            await triggerCustomerScoreUpdate(
                order.customerId,
                activeOrganizationId
            );
        }

        return order;
    } catch (error) {
        logger.error(`Error creating order: ${error}`);
        throw error;
    }
}

export async function getOrderDetails(
    id: string,
    organizationId: string
): Promise<Order | null> {
    try {
        const order = await prisma.order.findUnique({
            where: {
                id,
                organizationId
            },
            include: {
                customer: true,
                orderItems: {
                    include: {
                        product: true
                    }
                },
                supportTickets: true
            }
        });

        return order;
    } catch (error) {
        logger.error(`Error fetching order: ${error}`);
        throw error;
    }
}

export async function updateOrder(
    id: string,
    data: z.infer<typeof orderSchema.updateOrder>,
    organizationId: string
): Promise<Order> {
    try {
        const order = await prisma.order.update({
            where: {
                id,
                organizationId
            },
            data: {
                ...data,
                updatedAt: new Date()
            },
            include: {
                orderItems: true,
                customer: true
            }
        });

        if (order.customerId) {
            await triggerCustomerScoreUpdate(order.customerId, organizationId);
        }

        return order;
    } catch (error) {
        logger.error(`Error updating order: ${error}`);
        throw error;
    }
}

export async function deleteOrder(
    id: string,
    organizationId: string
): Promise<Order> {
    try {
        await prisma.orderItem.deleteMany({
            where: { orderId: id }
        });

        const order = await prisma.order.delete({
            where: {
                id,
                organizationId
            }
        });

        return order;
    } catch (error) {
        logger.error(`Error deleting order: ${error}`);
        throw error;
    }
}

export async function findCustomerByExternalId(
    externalId: string,
    organizationId: string
): Promise<{ id: string } | null> {
    return prisma.customer.findFirst({
        where: {
            externalId,
            organizationId
        },
        select: { id: true }
    });
}

export async function findCustomerByEmail(
    email: string,
    organizationId: string
): Promise<{ id: string } | null> {
    return prisma.customer.findFirst({
        where: {
            email,
            organizationId
        },
        select: { id: true }
    });
}

export async function findProductByExternalId(
    externalId: string,
    organizationId: string
): Promise<{ id: string } | null> {
    return prisma.product.findFirst({
        where: {
            externalId,
            organizationId
        },
        select: { id: true }
    });
}

export async function findProductBySku(
    sku: string,
    organizationId: string
): Promise<{ id: string } | null> {
    return prisma.product.findFirst({
        where: {
            sku,
            organizationId
        },
        select: { id: true }
    });
}

export async function getInvoiceData(id: string, organizationId: string) {
    const order = await prisma.order.findUnique({
        where: { id, organizationId },
        include: {
            customer: true,
            orderItems: {
                include: {
                    product: true
                }
            }
        }
    });

    if (!order) return null;

    const organization = await prisma.organization.findUnique({
        where: { id: organizationId }
    });

    if (!organization) return null;

    return { order, organization };
}

async function triggerCustomerScoreUpdate(
    customerId: string,
    organizationId: string
): Promise<void> {
    try {
        await addRFMScoreJob(organizationId, undefined, customerId);

        logger.info(`Queued customer metrics recomputation for ${customerId}`);
    } catch (error) {
        logger.error(
            `Failed to trigger customer score update: ${error instanceof Error ? error.stack : error}`
        );
    }
}
