import prisma from '../../config/prisma.config.js';
import type { Prisma } from '../../generated/prisma/client.js';
import logger from '../../utils/logger.util.js';
import { AppError } from '../../utils/response.util.js';

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
    const conversation = await prisma.conversation.findFirst({
        where: { id: data.conversationId, organizationId: data.organizationId }
    });

    if (!conversation) {
        throw new AppError('Conversation not found', 404, 'RESOURCE_NOT_FOUND');
    }

    // Fetch tenant's Meta integration
    const integration = await prisma.integration.findFirst({
        where: { orgId: data.organizationId, provider: 'meta', isActive: true }
    });

    if (!integration) {
        throw new AppError('Meta integration not configured or inactive', 400, 'INTEGRATION_ERROR');
    }

    const { accessToken, metadata: integrationMetadata } = integration;
    const metaConfig = (integrationMetadata as Record<string, string>) || {};
    
    let externalMessageId = `local-${Date.now()}`;
    let messageStatus: 'SENT' | 'FAILED' = 'SENT';
    let errorMessage: string | undefined;

    try {
        if (conversation.provider === 'whatsapp') {
            const phoneNumberId = metaConfig.whatsappPhoneNumberId;
            if (!phoneNumberId) {
                throw new Error('WhatsApp Phone Number ID not configured for this integration');
            }

            const response = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: conversation.externalId,
                    type: data.type === 'template' ? 'template' : 'text',
                    ...(data.type === 'template' ? { template: data.metadata?.template } : { text: { body: data.content } })
                })
            });

            const result = (await response.json()) as {
                error?: { message?: string };
                messages?: Array<{ id: string }>;
            };
            if (!response.ok) {
                logger.error({ result }, 'Failed to send WhatsApp message');
                throw new Error(result.error?.message || 'Meta API error');
            }
            if (result.messages && result.messages.length > 0) {
                externalMessageId = result.messages[0]?.id ?? externalMessageId;
            }

        } else if (conversation.provider === 'facebook') {
            const pageId = metaConfig.facebookPageId;
            if (!pageId) {
                throw new Error('Facebook Page ID not configured for this integration');
            }

            const response = await fetch(`https://graph.facebook.com/v18.0/${pageId}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    recipient: { id: conversation.externalId },
                    message: { text: data.content }
                })
            });

            const result = (await response.json()) as {
                error?: { message?: string };
                message_id?: string;
            };
            if (!response.ok) {
                logger.error({ result }, 'Failed to send Facebook message');
                throw new Error(result.error?.message || 'Meta API error');
            }
            if (result.message_id) {
                externalMessageId = result.message_id;
            }
        }
    } catch (error) {
        const err = error as Error;
        logger.error({ err, conversationId: conversation.id }, 'Outbound message failed');
        messageStatus = 'FAILED';
        errorMessage = err.message;
    }

    const message = await prisma.message.create({
        data: {
            conversationId: conversation.id,
            externalId: externalMessageId,
            direction: 'OUTBOUND',
            content: data.content,
            type: data.type || 'text',
            status: messageStatus,
            errorMessage,
            metadata: (data.metadata as Prisma.InputJsonValue) || {}
        }
    });

    await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() }
    });

    if (messageStatus === 'FAILED') {
        throw new AppError(`Message delivery failed: ${errorMessage}`, 500, 'DELIVERY_FAILED');
    }

    return message;
}
