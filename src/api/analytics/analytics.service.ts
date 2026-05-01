import { subDays, startOfDay, format, isSameDay } from 'date-fns';
import prisma from '../../config/prisma.config.js';

export const getAnalytics = async (organizationId: string) => {
    const now = new Date();
    const lastWeek = subDays(now, 7);

    const [
        customerCount,
        prevCustomerCount,
        productCount,
        prevProductCount,
        orderCount,
        prevOrderCount,
        ticketsByStatus,
        customersByLifecycle,
        ordersByShipping,
        topProducts,
        auditLogs,
        dailyOrders,
        campaignConversions
    ] = await Promise.all([
        // 1. Customers
        prisma.customer.count({ where: { organizationId } }),
        prisma.customer.count({
            where: { organizationId, createdAt: { lt: lastWeek } }
        }),
        // 2. Products
        prisma.product.count({ where: { organizationId } }),
        prisma.product.count({
            where: { organizationId, createdAt: { lt: lastWeek } }
        }),
        // 3. Orders
        prisma.order.count({ where: { organizationId } }),
        prisma.order.count({
            where: { organizationId, createdAt: { lt: lastWeek } }
        }),
        // 5. Tickets
        prisma.supportTicket.groupBy({
            by: ['status'],
            where: { organizationId },
            _count: true
        }),
        // 6. Lifecycle Stages
        prisma.customer.groupBy({
            by: ['lifecycleStage'],
            where: { organizationId },
            _count: true
        }),
        // 7. Shipping Status
        prisma.order.groupBy({
            by: ['shippingStatus'],
            where: { organizationId },
            _count: true
        }),
        // 8. Top 5 Products
        prisma.orderItem.groupBy({
            by: ['productId'],
            where: { order: { organizationId } },
            _sum: { quantity: true },
            orderBy: { _sum: { quantity: 'desc' } },
            take: 5
        }),
        // 9. Audit Logs (for top employee)
        prisma.auditLog.groupBy({
            by: ['userId'],
            where: { organizationId, userId: { not: null } },
            _count: true,
            orderBy: { _count: { id: 'desc' } },
            take: 1
        }),
        // 4. Daily Orders (Last 7 days)
        prisma.order.findMany({
            where: {
                organizationId,
                createdAt: { gte: startOfDay(lastWeek) }
            },
            select: { createdAt: true }
        }),
        // 4. Campaign Conversions (Last 7 days)
        prisma.campaignRecipient.count({
            where: {
                campaign: { organizationId },
                status: 'CLICKED',
                sentAt: { gte: startOfDay(lastWeek) }
            }
        })
    ]);

    const calculateChange = (current: number, previous: number) => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return parseFloat((((current - previous) / previous) * 100).toFixed(2));
    };

    const topProductsWithNames = await Promise.all(
        topProducts.map(async (item) => {
            const product = await prisma.product.findUnique({
                where: { id: item.productId },
                select: { name: true }
            });
            return {
                name: product?.name || 'Unknown',
                sales: item._sum.quantity || 0
            };
        })
    );

    let topEmployee = null;
    if (auditLogs.length > 0 && auditLogs[0] !== undefined) {
        const user = await prisma.user.findUnique({
            where: { id: auditLogs[0].userId! },
            select: { name: true }
        });
        topEmployee = {
            name: user?.name || 'Unknown',
            activityCount: auditLogs[0]._count
        };
    }

    const campaignPerformance = Array.from({ length: 7 }).map((_, i) => {
        const date = subDays(now, 6 - i);
        const count = dailyOrders.filter((d) =>
            isSameDay(d.createdAt, date)
        ).length;

        return {
            date: format(date, 'yyyy-MM-dd'),
            orders: count,
            conversions: Math.round(count * 0.1)
        };
    });

    return {
        summary: {
            customers: {
                total: customerCount,
                change: calculateChange(customerCount, prevCustomerCount)
            },
            products: {
                total: productCount,
                change: calculateChange(productCount, prevProductCount)
            },
            orders: {
                total: orderCount,
                change: calculateChange(orderCount, prevOrderCount)
            }
        },
        campaignPerformance,
        ticketsByStatus: Object.fromEntries(
            ticketsByStatus.map((t) => [t.status, t._count])
        ),
        customersByLifecycle: Object.fromEntries(
            customersByLifecycle.map((c) => [c.lifecycleStage, c._count])
        ),
        ordersByShipping: Object.fromEntries(
            ordersByShipping.map((o) => [o.shippingStatus, o._count])
        ),
        topProducts: topProductsWithNames,
        supportOverview: {
            totalResolved:
                ticketsByStatus.find((t) => t.status === 'CLOSED')?._count || 0,
            topEmployee
        },
        campaignConversions
    };
};
