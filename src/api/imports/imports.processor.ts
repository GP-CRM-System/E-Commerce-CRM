import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import type { CustomerUncheckedCreateInput } from '../../generated/prisma/models/Customer.js';
import type { ProductUncheckedCreateInput } from '../../generated/prisma/models/Product.js';
import type { OrderUncheckedCreateInput } from '../../generated/prisma/models/Order.js';
import type { EntityType, ParsedRow } from '../../types/import.types.js';
import { AppError } from '../../utils/response.util.js';

type PrismaDb = PrismaClient;

export async function processRow(
    db: PrismaDb,
    row: ParsedRow,
    entityType: EntityType,
    organizationId: string,
    duplicateStrategy: 'create_only' | 'upsert'
): Promise<{ id: string; action: 'created' | 'updated' }> {
    switch (entityType) {
        case 'customer':
            return processCustomerRow(
                db,
                row,
                organizationId,
                duplicateStrategy
            );
        case 'product':
            return processProductRow(
                db,
                row,
                organizationId,
                duplicateStrategy
            );
        case 'order':
            return processOrderRow(db, row, organizationId, duplicateStrategy);
        default:
            throw new AppError(`Unknown entity type: ${entityType}`);
    }
}

async function processCustomerRow(
    db: PrismaDb,
    row: ParsedRow,
    organizationId: string,
    duplicateStrategy: 'create_only' | 'upsert'
): Promise<{ id: string; action: 'created' | 'updated' }> {
    const data = row.data;
    const name = data.name as string;

    if (!name) {
        throw new AppError('Name is required');
    }

    const customerData: CustomerUncheckedCreateInput = {
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

    if (duplicateStrategy === 'upsert') {
        const orConditions: Prisma.CustomerWhereInput[] = [];
        if (data.externalId)
            orConditions.push({ externalId: String(data.externalId) });
        if (data.email) orConditions.push({ email: String(data.email) });
        if (data.phone) orConditions.push({ phone: String(data.phone) });

        if (orConditions.length > 0) {
            const existing = await db.customer.findFirst({
                where: {
                    organizationId,
                    OR: orConditions
                }
            });

            if (existing) {
                const updated = await db.customer.update({
                    where: { id: existing.id },
                    data: { ...customerData, updatedAt: new Date() }
                });
                return { id: updated.id, action: 'updated' };
            }
        }
    }

    const created = await db.customer.create({ data: customerData });
    return { id: created.id, action: 'created' };
}

async function processProductRow(
    db: PrismaDb,
    row: ParsedRow,
    organizationId: string,
    duplicateStrategy: 'create_only' | 'upsert'
): Promise<{ id: string; action: 'created' | 'updated' }> {
    const data = row.data;
    const name = data.name as string;
    const price = data.price as number;

    if (!name) {
        throw new AppError('Name is required');
    }
    if (price === undefined || price === null) {
        throw new AppError('Price is required');
    }

    const productData: ProductUncheckedCreateInput = {
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

    if (duplicateStrategy === 'upsert') {
        const orConditions: Prisma.ProductWhereInput[] = [];
        if (data.externalId)
            orConditions.push({ externalId: String(data.externalId) });
        if (data.sku) orConditions.push({ sku: String(data.sku) });

        if (orConditions.length > 0) {
            const existing = await db.product.findFirst({
                where: {
                    organizationId,
                    OR: orConditions
                }
            });

            if (existing) {
                const updated = await db.product.update({
                    where: { id: existing.id },
                    data: { ...productData, updatedAt: new Date() }
                });
                return { id: updated.id, action: 'updated' };
            }
        }
    }

    const created = await db.product.create({ data: productData });
    return { id: created.id, action: 'created' };
}

async function processOrderRow(
    db: PrismaDb,
    row: ParsedRow,
    organizationId: string,
    duplicateStrategy: 'create_only' | 'upsert'
): Promise<{ id: string; action: 'created' | 'updated' }> {
    const data = row.data;

    let customerId = data.customerId as string | undefined;

    if (!customerId && data.externalId) {
        const customer = await db.customer.findFirst({
            where: { externalId: String(data.externalId), organizationId }
        });
        if (customer) {
            customerId = customer.id;
        }
    }

    if (!customerId && data.customerEmail) {
        const customer = await db.customer.findFirst({
            where: { email: String(data.customerEmail), organizationId }
        });
        if (customer) {
            customerId = customer.id;
        }
    }

    if (!customerId) {
        throw new AppError(
            'Customer identifier required (customerId, externalId, or customerEmail)'
        );
    }

    const orderData: OrderUncheckedCreateInput = {
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

    if (duplicateStrategy === 'upsert' && data.externalId) {
        const existing = await db.order.findFirst({
            where: {
                externalId: String(data.externalId),
                organizationId
            }
        });
        if (existing) {
            const updated = await db.order.update({
                where: { id: existing.id },
                data: { ...orderData, updatedAt: new Date() }
            });
            return { id: updated.id, action: 'updated' };
        }
    }

    const created = await db.order.create({ data: orderData });
    return { id: created.id, action: 'created' };
}
