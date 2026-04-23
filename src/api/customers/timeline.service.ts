import prisma from '../../config/prisma.config.js';

export interface TimelineItem {
    id: string;
    type: 'order' | 'event' | 'note' | 'campaign' | 'audit';
    title: string;
    description: string;
    occurredAt: Date;
    metadata?: Record<string, unknown>;
}

export async function getCustomerTimeline(
    customerId: string,
    organizationId: string,
    limit: number = 50
): Promise<{ items: TimelineItem[]; nextCursor?: string }> {
    // 1. Fetch Orders
    const orders = await prisma.order.findMany({
        where: { customerId, organizationId },
        orderBy: { createdAt: 'desc' },
        take: limit
    });

    // 2. Fetch Events
    const events = await prisma.customerEvent.findMany({
        where: { customerId },
        orderBy: { occurredAt: 'desc' },
        take: limit
    });

    // 3. Fetch Notes
    const notes = await prisma.note.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        include: { author: { select: { name: true } } },
        take: limit
    });

    // 4. Fetch Campaign Interactions
    const campaignInteractions = await prisma.campaignRecipient.findMany({
        where: { customerId, status: { not: 'PENDING' } },
        orderBy: { sentAt: 'desc' },
        include: { campaign: { select: { name: true } } },
        take: limit
    });

    // 5. Fetch Audit Logs related to this customer
    const auditLogs = await prisma.auditLog.findMany({
        where: {
            organizationId,
            targetId: customerId,
            targetType: 'customer'
        },
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true } } },
        take: limit
    });

    // Aggregate all items
    const allItems: TimelineItem[] = [
        ...orders.map((o) => ({
            id: o.id,
            type: 'order' as const,
            title: `Order Placed: ${o.externalId || o.id}`,
            description: `Total Amount: ${o.totalAmount} ${o.currency}`,
            occurredAt: o.createdAt,
            metadata: {
                status: o.shippingStatus,
                paymentStatus: o.paymentStatus
            }
        })),
        ...events.map((e) => ({
            id: e.id,
            type: 'event' as const,
            title: (e.eventType || 'EVENT').replace(/_/g, ' ').toUpperCase(),
            description: e.description,
            occurredAt: e.occurredAt,
            metadata: (e.metadata as Record<string, unknown>) || {}
        })),
        ...notes.map((n) => ({
            id: n.id,
            type: 'note' as const,
            title: 'Internal Note',
            description: n.body,
            occurredAt: n.createdAt,
            metadata: { author: n.author.name }
        })),
        ...campaignInteractions.map((ci) => ({
            id: ci.id,
            type: 'campaign' as const,
            title: `Campaign: ${ci.campaign.name}`,
            description: `Status: ${ci.status}`,
            occurredAt: ci.sentAt || new Date(),
            metadata: {
                openedAt: ci.openedAt?.toISOString(),
                clickedAt: ci.clickedAt?.toISOString()
            }
        })),
        ...auditLogs.map((al) => ({
            id: al.id,
            type: 'audit' as const,
            title: `Action: ${al.action}`,
            description: al.user
                ? `Performed by ${al.user.name}`
                : `Performed by system`,
            occurredAt: al.createdAt
        }))
    ];

    // Sort by occurredAt descending
    const sortedItems = allItems
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
        .slice(0, limit);

    return {
        items: sortedItems,
        nextCursor:
            sortedItems.length === limit && sortedItems.length > 0
                ? sortedItems[sortedItems.length - 1]?.id
                : undefined
    };
}
