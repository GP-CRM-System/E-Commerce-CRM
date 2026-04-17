import prisma from '../../config/prisma.config.js';
import { startOfMonth, subMonths, endOfMonth } from 'date-fns';

export async function getRevenueStats(organizationId: string) {
    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(lastMonthStart);

    const [currentMonthOrders, lastMonthOrders] = await Promise.all([
        prisma.order.findMany({
            where: {
                organizationId,
                paymentStatus: 'PAID',
                createdAt: { gte: currentMonthStart }
            },
            select: { totalAmount: true }
        }),
        prisma.order.findMany({
            where: {
                organizationId,
                paymentStatus: 'PAID',
                createdAt: { gte: lastMonthStart, lte: lastMonthEnd }
            },
            select: { totalAmount: true }
        })
    ]);

    const currentRevenue = currentMonthOrders.reduce(
        (acc, o) => acc + Number(o.totalAmount || 0),
        0
    );
    const lastRevenue = lastMonthOrders.reduce(
        (acc, o) => acc + Number(o.totalAmount || 0),
        0
    );

    const revenueGrowth =
        lastRevenue > 0
            ? ((currentRevenue - lastRevenue) / lastRevenue) * 100
            : 100;

    return {
        currentRevenue,
        lastRevenue,
        revenueGrowth,
        currentOrderCount: currentMonthOrders.length,
        lastOrderCount: lastMonthOrders.length,
        orderGrowth:
            lastMonthOrders.length > 0
                ? ((currentMonthOrders.length - lastMonthOrders.length) /
                      lastMonthOrders.length) *
                  100
                : 100
    };
}

export async function getCustomerAcquisitionStats(organizationId: string) {
    const now = new Date();
    const sixMonthsAgo = startOfMonth(subMonths(now, 5));

    const customers = await prisma.customer.findMany({
        where: {
            organizationId,
            createdAt: { gte: sixMonthsAgo }
        },
        select: { createdAt: true }
    });

    const months: Record<string, number> = {};
    for (let i = 0; i < 6; i++) {
        const month = startOfMonth(subMonths(now, i))
            .toISOString()
            .substring(0, 7);
        months[month] = 0;
    }

    customers.forEach((c) => {
        const month = c.createdAt.toISOString().substring(0, 7);
        if (months[month] !== undefined) months[month]++;
    });

    return Object.entries(months)
        .map(([month, count]) => ({ month, count }))
        .reverse();
}
