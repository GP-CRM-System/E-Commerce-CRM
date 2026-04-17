import prisma from '../../config/prisma.config.js';
import type { Prisma } from '../../generated/prisma/client.js';

export async function handleInboundMessage(data: {
    organizationId: string;
    externalChatId: string;
    externalMessageId: string;
    provider: 'whatsapp' | 'facebook' | 'instagram';
    content: string;
    type?: string;
    metadata?: Record<string, unknown>;
    customerPhone?: string;
    customerEmail?: string;
}) {
    // 1. Find or create customer
    const customer = await prisma.customer.findFirst({
        where: {
            organizationId: data.organizationId,
            OR: [
                ...(data.customerPhone ? [{ phone: data.customerPhone }] : []),
                ...(data.customerEmail ? [{ email: data.customerEmail }] : [])
            ]
        }
    });

    // 2. Find or create conversation
    let conversation = await prisma.conversation.findFirst({
        where: {
            organizationId: data.organizationId,
            externalId: data.externalChatId
        }
    });

    if (!conversation) {
        conversation = await prisma.conversation.create({
            data: {
                organizationId: data.organizationId,
                customerId: customer?.id,
                externalId: data.externalChatId,
                provider: data.provider,
                status: 'OPEN'
            }
        });
    }

    // 3. Create message
    const message = await prisma.message.create({
        data: {
            conversationId: conversation.id,
            externalId: data.externalMessageId,
            direction: 'INBOUND',
            content: data.content,
            type: data.type || 'text',
            status: 'READ',
            metadata: (data.metadata as Prisma.InputJsonValue) || {}
        }
    });

    // 4. Update conversation timestamp
    await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() }
    });

    return { conversation, message };
}

export async function sendOutboundMessage(data: {
    organizationId: string;
    conversationId: string;
    content: string;
    type?: string;
    metadata?: Record<string, unknown>;
}) {
    const conversation = await prisma.conversation.findUnique({
        where: { id: data.conversationId, organizationId: data.organizationId }
    });

    if (!conversation) throw new Error('Conversation not found');

    // In a real app, call Meta API here using env.metaAccessToken

    const message = await prisma.message.create({
        data: {
            conversationId: conversation.id,
            direction: 'OUTBOUND',
            content: data.content,
            type: data.type || 'text',
            status: 'SENT',
            metadata: (data.metadata as Prisma.InputJsonValue) || {}
        }
    });

    await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() }
    });

    return message;
}
