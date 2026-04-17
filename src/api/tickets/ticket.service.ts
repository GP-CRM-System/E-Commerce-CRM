import prisma from '../../config/prisma.config.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
    SupportTicketStatus,
    SupportTicketPriority
} from '../../generated/prisma/client.js';

export async function createTicket(data: {
    organizationId: string;
    customerId: string;
    orderId?: string;
    subject: string;
    description: string;
    priority?: SupportTicketPriority;
}) {
    return prisma.supportTicket.create({
        data: {
            organizationId: data.organizationId,
            customerId: data.customerId,
            orderId: data.orderId,
            subject: data.subject,
            description: data.description,
            priority: data.priority || 'MEDIUM',
            status: 'OPEN'
        },
        include: { customer: true }
    });
}

export async function listTickets(
    organizationId: string,
    filters: {
        status?: SupportTicketStatus;
        priority?: SupportTicketPriority;
        assignedToId?: string;
    },
    take: number,
    skip: number
) {
    const where: Prisma.SupportTicketWhereInput = { organizationId };
    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    if (filters.assignedToId) where.assignedToId = filters.assignedToId;

    const [tickets, total] = await Promise.all([
        prisma.supportTicket.findMany({
            where,
            orderBy: { updatedAt: 'desc' },
            include: {
                customer: { select: { name: true } },
                assignedTo: { select: { name: true } }
            },
            take,
            skip
        }),
        prisma.supportTicket.count({ where })
    ]);

    return { tickets, total };
}

export async function getTicketDetails(id: string, organizationId: string) {
    return prisma.supportTicket.findUnique({
        where: { id, organizationId },
        include: {
            customer: true,
            order: true,
            assignedTo: { select: { id: true, name: true, email: true } },
            notes: {
                orderBy: { createdAt: 'desc' },
                include: { author: { select: { name: true } } }
            }
        }
    });
}

export async function updateTicket(
    id: string,
    organizationId: string,
    data: {
        status?: SupportTicketStatus;
        priority?: SupportTicketPriority;
        assignedToId?: string;
    }
) {
    return prisma.supportTicket.update({
        where: { id, organizationId },
        data: {
            ...data,
            updatedAt: new Date()
        }
    });
}

export async function addTicketNote(data: {
    ticketId: string;
    authorId: string;
    body: string;
    isInternal?: boolean;
}) {
    return prisma.$transaction(async (tx) => {
        const note = await tx.ticketNote.create({
            data: {
                ticketId: data.ticketId,
                authorId: data.authorId,
                body: data.body,
                isInternal: data.isInternal !== false
            }
        });

        await tx.supportTicket.update({
            where: { id: data.ticketId },
            data: {
                lastResponseAt: new Date(),
                updatedAt: new Date()
            }
        });

        return note;
    });
}
