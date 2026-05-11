import prisma from '../../config/prisma.config.js';

export async function getBestSellingProducts(
    organizationId: string,
    limit: number = 10
) {
    type RawRow = {
        productId: string;
        totalQuantity: bigint;
        totalRevenue: bigint;
    };
    const raw = await prisma.$queryRaw<RawRow[]>`
        SELECT
            oi."productId",
            CAST(SUM(oi.quantity) AS BIGINT) AS "totalQuantity",
            CAST(SUM(oi.price * oi.quantity) AS BIGINT) AS "totalRevenue"
        FROM "orderItem" oi
        JOIN "order" o ON oi."orderId" = o.id
        WHERE o."organizationId" = ${organizationId}
        GROUP BY oi."productId"
        ORDER BY "totalQuantity" DESC
        LIMIT ${limit}
    `;

    const productIds = raw.map((r) => r.productId);
    const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: {
            id: true,
            name: true,
            sku: true,
            category: true,
            price: true,
            imageUrl: true
        }
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    return raw.map((r) => ({
        product: productMap.get(r.productId) || null,
        totalQuantitySold: Number(r.totalQuantity),
        totalRevenue: Number(r.totalRevenue)
    }));
}

export async function getCategoryRevenue(organizationId: string) {
    const orderItems = await prisma.orderItem.findMany({
        where: {
            order: { organizationId }
        },
        select: {
            quantity: true,
            price: true,
            product: {
                select: {
                    category: true
                }
            }
        }
    });

    const map = new Map<string, { quantity: number; revenue: number }>();

    for (const item of orderItems) {
        const category = item.product.category || 'Uncategorized';
        const existing = map.get(category) || { quantity: 0, revenue: 0 };
        existing.quantity += item.quantity;
        existing.revenue += Number(item.price) * item.quantity;
        map.set(category, existing);
    }

    return Array.from(map.entries())
        .map(([category, data]) => ({
            category,
            totalQuantitySold: data.quantity,
            totalRevenue: data.revenue
        }))
        .sort((a, b) => b.totalRevenue - a.totalRevenue);
}

export async function getCustomerCategorySpend(
    organizationId: string,
    customerId: string
) {
    const orderItems = await prisma.orderItem.findMany({
        where: {
            order: { organizationId, customerId }
        },
        select: {
            quantity: true,
            price: true,
            product: {
                select: {
                    category: true
                }
            }
        }
    });

    const map = new Map<string, { quantity: number; spent: number }>();

    for (const item of orderItems) {
        const category = item.product.category || 'Uncategorized';
        const existing = map.get(category) || { quantity: 0, spent: 0 };
        existing.quantity += item.quantity;
        existing.spent += Number(item.price) * item.quantity;
        map.set(category, existing);
    }

    return Array.from(map.entries())
        .map(([category, data]) => ({
            category,
            totalQuantityPurchased: data.quantity,
            totalSpent: data.spent
        }))
        .sort((a, b) => b.totalSpent - a.totalSpent);
}
