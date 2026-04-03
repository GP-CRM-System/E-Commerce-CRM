import prisma from '../../config/prisma.config.js';
import type { EntityType, ParsedRow } from '../../types/import.types.js';

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function processRow(
    tx: PrismaTx,
    row: ParsedRow,
    entityType: EntityType,
    organizationId: string,
    duplicateStrategy: 'create_only' | 'upsert'
) {
    switch (entityType) {
        case 'customer':
            return processCustomerRow(
                tx,
                row,
                organizationId,
                duplicateStrategy
            );
        case 'product':
            return processProductRow(
                tx,
                row,
                organizationId,
                duplicateStrategy
            );
        case 'order':
            return processOrderRow(tx, row, organizationId, duplicateStrategy);
        default:
            throw new Error(`Unknown entity type: ${entityType}`);
    }
}

async function processCustomerRow(
    tx: PrismaTx,
    row: ParsedRow,
    organizationId: string,
    duplicateStrategy: 'create_only' | 'upsert'
) {
    const data = row.data;
    const name = data.name as string;

    if (!name) {
        throw new Error('Name is required');
    }

    const customerData: Parameters<typeof tx.customer.create>[0]['data'] = {
        name: String(name),
        organizationId,
        createdAt: new Date(),
        updatedAt: new Date()
    };

    if (data.email) customerData.email = String(data.email);
    if (data.phone) customerData.phone = String(data.phone);
    if (data.city) customerData.city = String(data.city);
    if (data.address) customerData.address = String(data.address);
    if (data.source) {
        const sourceVal = String(data.source).toUpperCase() as
            | 'WEBSITE'
            | 'SOCIAL'
            | 'REFERRAL'
            | 'ORGANIC'
            | 'EMAIL'
            | 'CAMPAIGN'
            | 'OTHER';
        if (
            [
                'WEBSITE',
                'SOCIAL',
                'REFERRAL',
                'ORGANIC',
                'EMAIL',
                'CAMPAIGN',
                'OTHER'
            ].includes(sourceVal)
        ) {
            customerData.source = sourceVal;
        }
    }
    if (data.externalId) customerData.externalId = String(data.externalId);
    if (data.acceptsMarketing)
        customerData.acceptsMarketing =
            data.acceptsMarketing === true || data.acceptsMarketing === 'true';

    if (duplicateStrategy === 'upsert' && data.externalId) {
        const existing = await tx.customer.findFirst({
            where: { externalId: String(data.externalId), organizationId }
        });
        if (existing) {
            return tx.customer.update({
                where: { id: existing.id },
                data: { ...customerData, updatedAt: new Date() }
            });
        }
    }

    if (duplicateStrategy === 'upsert' && data.email) {
        const existing = await tx.customer.findFirst({
            where: { email: String(data.email), organizationId }
        });
        if (existing) {
            return tx.customer.update({
                where: { id: existing.id },
                data: { ...customerData, updatedAt: new Date() }
            });
        }
    }

    return tx.customer.create({ data: customerData });
}

async function processProductRow(
    tx: PrismaTx,
    row: ParsedRow,
    organizationId: string,
    duplicateStrategy: 'create_only' | 'upsert'
) {
    const data = row.data;
    const name = data.name as string;
    const price = data.price as number;

    if (!name) {
        throw new Error('Name is required');
    }
    if (price === undefined || price === null) {
        throw new Error('Price is required');
    }

    const productData: Parameters<typeof tx.product.create>[0]['data'] = {
        name: String(name),
        price: Number(price),
        organizationId,
        createdAt: new Date(),
        updatedAt: new Date()
    };

    if (data.description) productData.description = String(data.description);
    if (data.externalId) productData.externalId = String(data.externalId);
    if (data.sku) productData.sku = String(data.sku);
    if (data.category) productData.category = String(data.category);
    if (data.imageUrl) productData.imageUrl = String(data.imageUrl);
    if (data.barcode) productData.barcode = String(data.barcode);
    if (data.weight) productData.weight = Number(data.weight);
    if (data.weightUnit) productData.weightUnit = String(data.weightUnit);
    if (data.inventory) productData.inventory = Number(data.inventory);
    if (data.status) {
        const statusVal = String(data.status).toLowerCase();
        if (['active', 'draft', 'archived'].includes(statusVal)) {
            productData.status = statusVal;
        }
    }

    if (duplicateStrategy === 'upsert' && data.externalId) {
        const existing = await tx.product.findFirst({
            where: { externalId: String(data.externalId), organizationId }
        });
        if (existing) {
            return tx.product.update({
                where: { id: existing.id },
                data: { ...productData, updatedAt: new Date() }
            });
        }
    }

    if (duplicateStrategy === 'upsert' && data.sku) {
        const existing = await tx.product.findFirst({
            where: { sku: String(data.sku), organizationId }
        });
        if (existing) {
            return tx.product.update({
                where: { id: existing.id },
                data: { ...productData, updatedAt: new Date() }
            });
        }
    }

    return tx.product.create({ data: productData });
}

async function processOrderRow(
    tx: PrismaTx,
    row: ParsedRow,
    organizationId: string,
    _duplicateStrategy: 'create_only' | 'upsert'
) {
    void _duplicateStrategy;
    const data = row.data;

    let customerId = data.customerId as string | undefined;

    if (!customerId && data.externalId) {
        const customer = await tx.customer.findFirst({
            where: { externalId: String(data.externalId), organizationId }
        });
        if (customer) {
            customerId = customer.id;
        }
    }

    if (!customerId && data.customerEmail) {
        const customer = await tx.customer.findFirst({
            where: { email: String(data.customerEmail), organizationId }
        });
        if (customer) {
            customerId = customer.id;
        }
    }

    if (!customerId) {
        throw new Error(
            'Customer identifier required (customerId, externalId, or customerEmail)'
        );
    }

    const orderData: Parameters<typeof tx.order.create>[0]['data'] = {
        organizationId,
        customerId,
        createdAt: new Date(),
        updatedAt: new Date()
    };

    if (data.externalId) orderData.externalId = String(data.externalId);
    if (data.discountAmount)
        orderData.discountAmount = Number(data.discountAmount);
    if (data.refundAmount) orderData.refundAmount = Number(data.refundAmount);
    if (data.subtotal) orderData.subtotal = Number(data.subtotal);
    if (data.taxAmount) orderData.taxAmount = Number(data.taxAmount);
    if (data.shippingAmount)
        orderData.shippingAmount = Number(data.shippingAmount);
    if (data.totalAmount) orderData.totalAmount = Number(data.totalAmount);
    if (data.currency) orderData.currency = String(data.currency);
    if (data.fulfillmentStatus) {
        const statusVal = String(data.fulfillmentStatus).toLowerCase();
        if (['unfulfilled', 'partial', 'fulfilled'].includes(statusVal)) {
            orderData.fulfillmentStatus = statusVal;
        }
    }
    if (data.note) orderData.note = String(data.note);
    if (data.tags) orderData.tags = String(data.tags);
    if (data.source) orderData.source = String(data.source);

    return tx.order.create({ data: orderData });
}
