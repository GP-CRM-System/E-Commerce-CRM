import prisma from '../../config/prisma.config.js';
import { subDays, startOfDay } from 'date-fns';

export async function getDashboardStats(organizationId: string) {
    const today = new Date();
    const sevenDaysAgo = subDays(today, 7);
    const fourteenDaysAgo = subDays(today, 14);

    const [
        totalCustomers,
        activeCampaigns,
        totalProducts,
        totalOrders,
        customerPercentage,
        campaignPercentage,
        productPercentage,
        orderPercentage,
        recentActivity,
        salesOverview,
        ticketStats
    ] = await Promise.all([
        prisma.customer.count({ where: { organizationId } }),
        prisma.campaign.count({
            where: { organizationId, status: { in: ['SENDING', 'SENT'] } }
        }),
        prisma.product.count({ where: { organizationId } }),
        prisma.order.count({ where: { organizationId } }),
        (Number(
            prisma.customer.count({
                where: { organizationId, createdAt: { gte: sevenDaysAgo } }
            })
        ) /
            Number(
                prisma.customer.count({
                    where: {
                        organizationId,
                        createdAt: { gte: fourteenDaysAgo }
                    }
                })
            )) *
            100,
        (Number(
            prisma.campaign.count({
                where: { organizationId, createdAt: { gte: sevenDaysAgo } }
            })
        ) /
            Number(
                prisma.campaign.count({
                    where: {
                        organizationId,
                        createdAt: { gte: fourteenDaysAgo }
                    }
                })
            )) *
            100,
        (Number(
            prisma.product.count({
                where: { organizationId, createdAt: { gte: sevenDaysAgo } }
            })
        ) /
            Number(
                prisma.product.count({
                    where: {
                        organizationId,
                        createdAt: { gte: fourteenDaysAgo }
                    }
                })
            )) *
            100,
        (Number(
            prisma.order.count({
                where: { organizationId, createdAt: { gte: sevenDaysAgo } }
            })
        ) /
            Number(
                prisma.order.count({
                    where: {
                        organizationId,
                        createdAt: { gte: fourteenDaysAgo }
                    }
                })
            )) *
            100,
        prisma.customerEvent.findMany({
            where: { customer: { organizationId } },
            orderBy: { occurredAt: 'desc' },
            take: 5
        }),
        getSalesOverview(organizationId),
        getTicketStats(organizationId)
    ]);

    return {
        cards: {
            customers: {
                value: totalCustomers,
                percentage: customerPercentage
            },
            campaigns: {
                value: activeCampaigns,
                percentage: campaignPercentage
            },
            products: {
                value: totalProducts,
                percentage: productPercentage
            },
            orders: {
                value: totalOrders,
                percentage: orderPercentage
            }
        },
        recentActivity,
        salesOverview,
        ticketStats
    };
}

export async function getSalesOverview(organizationId: string) {
    const today = new Date();
    const sevenDaysAgo = startOfDay(subDays(today, 6));

    const orders = await prisma.order.findMany({
        where: {
            organizationId,
            createdAt: { gte: sevenDaysAgo }
        },
        select: {
            createdAt: true,
            totalAmount: true
        }
    });

    const dailyData: Record<string, { orders: number; revenue: number }> = {};

    for (let i = 6; i >= 0; i--) {
        const date = subDays(today, i);
        const dateKey = date.toISOString().split('T')[0] as string;
        dailyData[dateKey] = { orders: 0, revenue: 0 };
    }

    for (const order of orders) {
        const dateKey = order.createdAt.toISOString().split('T')[0] as string;
        const day = dailyData[dateKey];
        if (day) {
            day.orders += 1;
            day.revenue += Number(order.totalAmount);
        }
    }

    return Object.entries(dailyData).map(([date, data]) => ({
        date,
        orders: data.orders,
        revenue: data.revenue
    }));
}

export async function getTicketStats(organizationId: string) {
    const [open, pending, closed] = await Promise.all([
        prisma.supportTicket.count({
            where: { organizationId, status: 'OPEN' }
        }),
        prisma.supportTicket.count({
            where: { organizationId, status: 'PENDING' }
        }),
        prisma.supportTicket.count({
            where: { organizationId, status: 'CLOSED' }
        })
    ]);

    return { open, pending, closed };
}
