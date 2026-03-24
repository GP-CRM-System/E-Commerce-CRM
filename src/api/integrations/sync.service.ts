import logger from '../../utils/logger.util.js';
import prisma from '../../config/prisma.config.js';
import type { Integration } from '../../generated/prisma/client.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { ShopifyWebhookPayload } from './webhook.service.js';
import { getShopifyClient } from './integration.service.js';

interface SyncStats {
    itemsProcessed: number;
    itemsCreated: number;
    itemsUpdated: number;
    itemsFailed: number;
}

export async function createSyncLog(
    integrationId: string,
    syncType: string,
    entityType: string
) {
    return prisma.syncLog.create({
        data: {
            integrationId,
            syncType,
            entityType,
            status: 'started',
            startedAt: new Date()
        }
    });
}

export async function updateSyncLog(
    syncLogId: string,
    stats: Partial<SyncStats>,
    status: string,
    errorMessage?: string
) {
    return prisma.syncLog.update({
        where: { id: syncLogId },
        data: {
            ...stats,
            status,
            completedAt:
                status === 'completed' || status === 'failed'
                    ? new Date()
                    : undefined,
            errorMessage
        }
    });
}

export async function processOrderWebhook(
    integration: Integration,
    topic: string,
    payload: ShopifyWebhookPayload
) {
    const orgId = integration.orgId;
    const externalId = payload.id.toString();

    const existingOrder = await prisma.order.findFirst({
        where: {
            organizationId: orgId,
            externalId
        }
    });

    let customerId: string;

    if (payload.customer) {
        const customerExternalId = payload.customer.id.toString();
        let customer = await prisma.customer.findFirst({
            where: {
                organizationId: orgId,
                externalId: customerExternalId
            }
        });

        if (!customer) {
            const name =
                [payload.customer.first_name, payload.customer.last_name]
                    .filter(Boolean)
                    .join(' ') || 'Unknown';

            customer = await prisma.customer.create({
                data: {
                    name,
                    email: payload.customer.email,
                    phone: payload.customer.phone,
                    externalId: customerExternalId,
                    organizationId: orgId,
                    source: 'ORGANIC',
                    acceptsMarketing:
                        payload.customer.accepts_marketing || false,
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            });
        }

        customerId = customer.id;

        if (payload.customer.email) {
            const customerUpdates: {
                totalOrders?: number;
                totalSpent?: Prisma.Decimal;
                avgOrderValue?: Prisma.Decimal;
                lastOrderAt?: Date;
                firstOrderAt?: Date;
                externalId?: string;
            } = {};

            const existingOrders = await prisma.order.count({
                where: { customerId }
            });

            const totalSpent = await prisma.order.aggregate({
                where: { customerId },
                _sum: { totalAmount: true }
            });

            customerUpdates.totalOrders = existingOrders;
            customerUpdates.totalSpent = new Prisma.Decimal(
                totalSpent._sum.totalAmount || 0
            );

            if (existingOrders > 0) {
                customerUpdates.avgOrderValue = new Prisma.Decimal(
                    Number(totalSpent._sum.totalAmount || 0) / existingOrders
                );
            }

            if (payload.created_at) {
                customerUpdates.lastOrderAt = new Date(payload.created_at);
                if (existingOrders === 0) {
                    customerUpdates.firstOrderAt = new Date(payload.created_at);
                }
            }

            await prisma.customer.update({
                where: { id: customerId },
                data: customerUpdates
            });
        }
    } else {
        throw new Error('Order has no customer data');
    }

    const orderData: {
        organizationId: string;
        customerId: string;
        externalId: string;
        shippingStatus:
            | 'PENDING'
            | 'PROCESSING'
            | 'SHIPPED'
            | 'DELIVERED'
            | 'CANCELLED';
        paymentStatus: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
        subtotal?: Prisma.Decimal;
        taxAmount?: Prisma.Decimal;
        shippingAmount?: Prisma.Decimal;
        totalAmount?: Prisma.Decimal;
        discountAmount?: Prisma.Decimal;
        currency?: string;
        fulfillmentStatus?: string;
        shopifyOrderId?: string;
        shopifyCreatedAt?: Date;
        shopifyUpdatedAt?: Date;
        tags?: string;
        note?: string;
        source?: string;
        referringSite?: string;
        updatedAt: Date;
    } = {
        organizationId: orgId,
        customerId,
        externalId,
        shippingStatus: 'PENDING',
        paymentStatus: 'PENDING',
        updatedAt: new Date()
    };

    if (payload.subtotal_price) {
        orderData.subtotal = new Prisma.Decimal(payload.subtotal_price);
    }
    if (payload.total_tax) {
        orderData.taxAmount = new Prisma.Decimal(payload.total_tax);
    }
    if (payload.total_discounts) {
        orderData.discountAmount = new Prisma.Decimal(payload.total_discounts);
    }
    if (payload.total_price) {
        orderData.totalAmount = new Prisma.Decimal(payload.total_price);
    }
    if (payload.currency) {
        orderData.currency = payload.currency;
    }
    if (payload.fulfillment_status) {
        orderData.fulfillmentStatus = payload.fulfillment_status;
        if (payload.fulfillment_status === 'fulfilled') {
            orderData.shippingStatus = 'SHIPPED';
        }
    }
    if (payload.tags) {
        orderData.tags = payload.tags;
    }
    if (payload.note) {
        orderData.note = payload.note;
    }
    if (payload.source) {
        orderData.source = payload.source;
    }
    if (payload.referring_site) {
        orderData.referringSite = payload.referring_site;
    }

    if (topic === 'orders/paid' || payload.financial_status === 'paid') {
        orderData.paymentStatus = 'PAID';
    } else if (payload.financial_status === 'refunded') {
        orderData.paymentStatus = 'REFUNDED';
    } else if (payload.financial_status === 'failed') {
        orderData.paymentStatus = 'FAILED';
    }

    if (payload.id) {
        orderData.shopifyOrderId = payload.id.toString();
    }
    if (payload.created_at) {
        orderData.shopifyCreatedAt = new Date(payload.created_at);
    }
    if (payload.updated_at) {
        orderData.shopifyUpdatedAt = new Date(payload.updated_at);
    }

    if (existingOrder) {
        await prisma.order.update({
            where: { id: existingOrder.id },
            data: orderData
        });

        if (payload.line_items) {
            await syncOrderItems(existingOrder.id, payload.line_items);
        }
    } else {
        const newOrder = await prisma.order.create({
            data: orderData
        });

        if (payload.line_items) {
            await syncOrderItems(newOrder.id, payload.line_items);
        }
    }

    await prisma.customerEvent.create({
        data: {
            customerId,
            eventType: topic.replace('orders/', 'ORDER_').toUpperCase(),
            description: `Order ${topic.replace('orders/', '')}: ${payload.name || externalId}`,
            metadata: payload as object,
            source: 'shopify',
            occurredAt: new Date()
        }
    });

    logger.info(`Processed order webhook: ${topic} for order ${externalId}`);
}

async function syncOrderItems(
    orderId: string,
    lineItems: ShopifyWebhookPayload['line_items']
) {
    if (!lineItems) return;

    await prisma.orderItem.deleteMany({ where: { orderId } });

    for (const item of lineItems) {
        let product = await prisma.product.findFirst({
            where: { externalId: item.product_id.toString() }
        });

        if (!product) {
            product = await prisma.product.create({
                data: {
                    name: item.title,
                    price: new Prisma.Decimal(item.price),
                    externalId: item.product_id.toString(),
                    sku: item.sku,
                    organizationId: (await prisma.order.findUnique({
                        where: { id: orderId }
                    }))!.organizationId
                }
            });
        }

        await prisma.orderItem.create({
            data: {
                orderId,
                productId: product.id,
                quantity: item.quantity,
                price: new Prisma.Decimal(item.price)
            }
        });
    }
}

export async function processCustomerWebhook(
    integration: Integration,
    topic: string,
    payload: ShopifyWebhookPayload['customer'] & { id: number }
) {
    if (!payload || !payload.id) {
        logger.warn('Customer webhook missing customer data');
        return;
    }

    const orgId = integration.orgId;
    const externalId = payload.id.toString();

    const name =
        [payload.first_name, payload.last_name].filter(Boolean).join(' ') ||
        'Unknown';

    const address = payload.addresses?.[0];

    const existingCustomer = await prisma.customer.findFirst({
        where: {
            organizationId: orgId,
            externalId
        }
    });

    const customerData: {
        name: string;
        email?: string;
        phone?: string;
        city?: string;
        address?: string;
        acceptsMarketing?: boolean;
        updatedAt: Date;
    } = {
        name,
        updatedAt: new Date()
    };

    if (payload.email) {
        customerData.email = payload.email;
    }
    if (payload.phone) {
        customerData.phone = payload.phone;
    }
    if (address) {
        customerData.city = address.city || undefined;
        customerData.address =
            [address.address1, address.city, address.province, address.zip]
                .filter(Boolean)
                .join(', ') || undefined;
    }
    if (payload.accepts_marketing !== undefined) {
        customerData.acceptsMarketing = payload.accepts_marketing;
    }

    if (existingCustomer) {
        if (topic === 'customers/disable') {
            await prisma.customer.update({
                where: { id: existingCustomer.id },
                data: {
                    lifecycleStage: 'CHURNED',
                    updatedAt: new Date()
                }
            });
        } else {
            await prisma.customer.update({
                where: { id: existingCustomer.id },
                data: customerData
            });
        }
    } else if (topic !== 'customers/disable') {
        await prisma.customer.create({
            data: {
                ...customerData,
                externalId,
                organizationId: orgId,
                source: 'ORGANIC',
                createdAt: new Date()
            }
        });
    }

    logger.info(
        `Processed customer webhook: ${topic} for customer ${externalId}`
    );
}

export async function processProductWebhook(
    integration: Integration,
    topic: string,
    payload: ShopifyWebhookPayload
) {
    const orgId = integration.orgId;
    const externalId = payload.id.toString();

    const existingProduct = await prisma.product.findFirst({
        where: {
            organizationId: orgId,
            externalId
        }
    });

    if (topic === 'products/delete') {
        if (existingProduct) {
            await prisma.product.delete({ where: { id: existingProduct.id } });
        }
        return;
    }

    const productData: {
        name: string;
        externalId: string;
        organizationId: string;
        price: Prisma.Decimal;
        description?: string;
        imageUrl?: string;
        shopifyProductId?: string;
        shopifyCreatedAt?: Date;
        shopifyUpdatedAt?: Date;
        updatedAt: Date;
    } = {
        name: payload.title || 'Unknown Product',
        externalId,
        organizationId: orgId,
        price: new Prisma.Decimal(payload.variants?.[0]?.price || '0'),
        updatedAt: new Date()
    };

    if (payload.body_html) {
        productData.description = payload.body_html.replace(/<[^>]*>/g, '');
    }
    if (payload.image?.src) {
        productData.imageUrl = payload.image.src;
    }
    if (payload.id) {
        productData.shopifyProductId = payload.id.toString();
    }
    if (payload.created_at) {
        productData.shopifyCreatedAt = new Date(payload.created_at);
    }
    if (payload.updated_at) {
        productData.shopifyUpdatedAt = new Date(payload.updated_at);
    }

    if (existingProduct) {
        await prisma.product.update({
            where: { id: existingProduct.id },
            data: productData
        });
    } else {
        await prisma.product.create({ data: productData });
    }

    logger.info(
        `Processed product webhook: ${topic} for product ${externalId}`
    );
}

export async function fullSync(
    integrationId: string,
    entityTypes: string[] = ['customers', 'orders', 'products']
): Promise<SyncStats> {
    const integration = await prisma.integration.findUnique({
        where: { id: integrationId }
    });

    if (!integration) {
        throw new Error('Integration not found');
    }

    const stats: SyncStats = {
        itemsProcessed: 0,
        itemsCreated: 0,
        itemsUpdated: 0,
        itemsFailed: 0
    };

    const { apiCall } = await getShopifyClient(integration);

    for (const entityType of entityTypes) {
        const syncLog = await createSyncLog(integrationId, 'full', entityType);

        try {
            const endpoint =
                entityType === 'customers'
                    ? '/customers.json?limit=250'
                    : entityType === 'orders'
                      ? '/orders.json?status=any&limit=250'
                      : '/products.json?limit=250';

            const response = await apiCall<{ [key: string]: unknown[] }>(
                endpoint
            );
            const items = response[entityType] || [];

            for (const item of items) {
                try {
                    stats.itemsProcessed++;
                    const recordItem = item as Record<string, unknown>;

                    if (entityType === 'customers') {
                        await syncCustomer(integration.orgId, recordItem);
                        stats.itemsCreated++;
                    } else if (entityType === 'orders') {
                        await syncOrder(integration.orgId, recordItem);
                        stats.itemsCreated++;
                    } else if (entityType === 'products') {
                        await syncProduct(integration.orgId, recordItem);
                        stats.itemsCreated++;
                    }
                } catch (error) {
                    stats.itemsFailed++;
                    logger.error(`Failed to sync ${entityType} item: ${error}`);
                }
            }

            await updateSyncLog(syncLog.id, stats, 'completed');
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            await updateSyncLog(syncLog.id, stats, 'failed', message);
            throw error;
        }
    }

    await prisma.integration.update({
        where: { id: integrationId },
        data: { lastSyncedAt: new Date() }
    });

    return stats;
}

async function syncCustomer(orgId: string, data: Record<string, unknown>) {
    const externalId = String(data.id);
    const name =
        [data.first_name, data.last_name].filter(Boolean).join(' ') ||
        'Unknown';

    const existing = await prisma.customer.findFirst({
        where: { organizationId: orgId, externalId }
    });

    const customerData = {
        name,
        email: data.email as string | undefined,
        phone: data.phone as string | undefined,
        acceptsMarketing: data.accepts_markting as boolean | undefined,
        externalId,
        organizationId: orgId,
        updatedAt: new Date()
    };

    if (existing) {
        await prisma.customer.update({
            where: { id: existing.id },
            data: customerData
        });
    } else {
        await prisma.customer.create({
            data: {
                ...customerData,
                source: 'ORGANIC',
                createdAt: new Date()
            }
        });
    }
}

async function syncOrder(orgId: string, data: Record<string, unknown>) {
    const externalId = String(data.id);
    const customerData = data.customer as Record<string, unknown> | undefined;

    if (!customerData) return;

    const customerExternalId = String(customerData.id);

    let customer = await prisma.customer.findFirst({
        where: { organizationId: orgId, externalId: customerExternalId }
    });

    if (!customer) {
        const name =
            [customerData.first_name, customerData.last_name]
                .filter(Boolean)
                .join(' ') || 'Unknown';

        customer = await prisma.customer.create({
            data: {
                name,
                email: customerData.email as string | undefined,
                phone: customerData.phone as string | undefined,
                externalId: customerExternalId,
                organizationId: orgId,
                source: 'ORGANIC',
                createdAt: new Date(),
                updatedAt: new Date()
            }
        });
    }

    const customerId = customer.id;

    const existingOrder = await prisma.order.findFirst({
        where: { organizationId: orgId, externalId }
    });

    const orderData = {
        organizationId: orgId,
        customerId,
        externalId,
        totalAmount: new Prisma.Decimal(String(data.total_price || '0')),
        currency: String(data.currency || 'USD'),
        shopifyOrderId: externalId,
        shopifyCreatedAt: data.created_at
            ? new Date(data.created_at as string)
            : undefined,
        shopifyUpdatedAt: data.updated_at
            ? new Date(data.updated_at as string)
            : undefined,
        updatedAt: new Date()
    };

    if (existingOrder) {
        await prisma.order.update({
            where: { id: existingOrder.id },
            data: orderData
        });
    } else {
        await prisma.order.create({
            data: {
                ...orderData,
                shippingStatus: 'PENDING' as const,
                paymentStatus: 'PENDING' as const,
                createdAt: new Date()
            }
        });
    }
}

async function syncProduct(orgId: string, data: Record<string, unknown>) {
    const externalId = String(data.id);

    const existing = await prisma.product.findFirst({
        where: { organizationId: orgId, externalId }
    });

    const variants = data.variants as
        | Array<Record<string, unknown>>
        | undefined;
    const firstVariant = variants?.[0];

    const productData = {
        name: String(data.title || 'Unknown'),
        description: data.body_html
            ? String(data.body_html).replace(/<[^>]*>/g, '')
            : undefined,
        price: new Prisma.Decimal(String(firstVariant?.price || '0')),
        imageUrl: (data.images as Array<Record<string, string>>)?.[0]?.src as
            | string
            | undefined,
        externalId,
        organizationId: orgId,
        shopifyProductId: externalId,
        shopifyCreatedAt: data.created_at
            ? new Date(data.created_at as string)
            : undefined,
        shopifyUpdatedAt: data.updated_at
            ? new Date(data.updated_at as string)
            : undefined,
        updatedAt: new Date()
    };

    if (existing) {
        await prisma.product.update({
            where: { id: existing.id },
            data: productData
        });
    } else {
        await prisma.product.create({
            data: {
                ...productData,
                createdAt: new Date()
            }
        });
    }
}
