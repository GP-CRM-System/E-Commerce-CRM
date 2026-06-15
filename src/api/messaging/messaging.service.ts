import prisma from '../../config/prisma.config.js';
import type { Prisma } from '../../generated/prisma/client.js';
import logger from '../../utils/logger.util.js';
import { AppError } from '../../utils/response.util.js';
import { emitToOrg } from '../../config/socket.config.js';
import { decryptSafe } from '../../utils/encryption.util.js';

type MetaProvider = 'whatsapp' | 'facebook' | 'messenger' | 'instagram';
type StoredMetaProvider = 'whatsapp' | 'facebook' | 'instagram';

const normalizeProvider = (provider: MetaProvider): StoredMetaProvider =>
    provider === 'messenger' ? 'facebook' : provider;

export function cleanWhatsAppNumber(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('01') && cleaned.length === 11) {
        cleaned = '20' + cleaned.slice(1);
    }
    return cleaned;
}

export async function handleInboundMessage(data: {
    organizationId: string;
    externalChatId: string;
    externalMessageId: string;
    provider: MetaProvider;
    content: string;
    type?: string;
    metadata?: Record<string, unknown>;
    customerPhone?: string;
    customerEmail?: string;
    customerName?: string;
}) {
    const provider = normalizeProvider(data.provider);

    // Normalize WhatsApp external ID and phone number formats
    const externalChatId =
        provider === 'whatsapp'
            ? cleanWhatsAppNumber(data.externalChatId)
            : data.externalChatId;
    const customerPhone =
        provider === 'whatsapp' && data.customerPhone
            ? cleanWhatsAppNumber(data.customerPhone)
            : data.customerPhone;

    const customerIdentityFilters = [
        ...(customerPhone
            ? [{ phone: customerPhone }, { phone: `+${customerPhone}` }]
            : []),
        ...(data.customerEmail ? [{ email: data.customerEmail }] : [])
    ];

    // 1. Find or create customer
    let customer = customerIdentityFilters.length
        ? await prisma.customer.findFirst({
              where: {
                  organizationId: data.organizationId,
                  OR: customerIdentityFilters
              }
          })
        : null;

    if (!customer) {
        const label =
            provider === 'whatsapp'
                ? `WhatsApp ${customerPhone?.slice(-4) || 'User'}`
                : provider === 'facebook'
                  ? 'Messenger User'
                  : 'Instagram User';
        customer = await prisma.customer.create({
            data: {
                organizationId: data.organizationId,
                name:
                    data.customerName ||
                    (customerPhone ? `+${customerPhone}` : label),
                phone: customerPhone || null,
                email: data.customerEmail || null,
                source: 'OTHER'
            }
        });
    } else {
        const updateData: { phone?: string; name?: string } = {};
        if (provider === 'whatsapp' && customer.phone !== customerPhone) {
            updateData.phone = customerPhone;
        }

        // If the customer has a temporary phone-number name or generic label, but Meta sends a real name, update it!
        const isDefaultOrPhoneName =
            customer.name.startsWith('+') ||
            customer.name.includes('User') ||
            customer.name === customer.phone;

        if (
            data.customerName &&
            isDefaultOrPhoneName &&
            customer.name !== data.customerName
        ) {
            updateData.name = data.customerName;
        }

        if (Object.keys(updateData).length > 0) {
            customer = await prisma.customer.update({
                where: { id: customer.id },
                data: updateData
            });
        }
    }

    // 2. Find or create conversation
    let conversation = await prisma.conversation.findFirst({
        where: {
            organizationId: data.organizationId,
            OR: [
                { externalId: externalChatId },
                { externalId: `+${externalChatId}` }
            ],
            provider
        }
    });

    if (!conversation) {
        conversation = await prisma.conversation.create({
            data: {
                organizationId: data.organizationId,
                customerId: customer?.id,
                externalId: externalChatId,
                provider,
                status: 'OPEN'
            }
        });
    } else if (conversation.externalId !== externalChatId) {
        // Auto-normalize existing conversation externalId format
        conversation = await prisma.conversation.update({
            where: { id: conversation.id },
            data: { externalId: externalChatId }
        });
    }

    const existingMessage = await prisma.message.findFirst({
        where: {
            conversationId: conversation.id,
            externalId: data.externalMessageId
        }
    });

    if (existingMessage) {
        return { conversation, message: existingMessage };
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
    const updatedConversation = await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
        include: { customer: { select: { name: true, email: true } } }
    });

    emitToOrg(data.organizationId, 'message:created', {
        conversation: updatedConversation,
        message
    });

    return { conversation: updatedConversation, message };
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

    // Fetch tenant's Meta integration matching the conversation's channel
    const channelMetadataKey =
        conversation.provider === 'whatsapp'
            ? 'whatsappPhoneNumberId'
            : conversation.provider === 'facebook'
              ? 'facebookPageId'
              : 'instagramBusinessAccountId';

    const metaIntegrations = await prisma.integration.findMany({
        where: {
            orgId: data.organizationId,
            provider: 'meta',
            isActive: true
        }
    });

    const integration = metaIntegrations.find(
        (i) =>
            i.metadata &&
            (i.metadata as Record<string, string>)[channelMetadataKey]
    );

    if (!integration) {
        throw new AppError(
            `Meta integration for ${conversation.provider} not configured or inactive`,
            400,
            'INTEGRATION_ERROR'
        );
    }

    const accessToken = decryptSafe(integration.accessToken);
    const metaConfig = (integration.metadata as Record<string, string>) || {};

    let externalMessageId = `local-${Date.now()}`;
    let messageStatus: 'SENT' | 'FAILED' = 'SENT';
    let errorMessage: string | undefined;

    try {
        if (conversation.provider === 'whatsapp') {
            const phoneNumberId = metaConfig.whatsappPhoneNumberId;
            if (!phoneNumberId) {
                throw new Error(
                    'WhatsApp Phone Number ID not configured for this integration'
                );
            }

            const response = await fetch(
                `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        messaging_product: 'whatsapp',
                        recipient_type: 'individual',
                        to: conversation.externalId,
                        type: data.type === 'template' ? 'template' : 'text',
                        ...(data.type === 'template'
                            ? { template: data.metadata?.template }
                            : { text: { body: data.content } })
                    })
                }
            );

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
                throw new Error(
                    'Facebook Page ID not configured for this integration'
                );
            }

            const response = await fetch(
                `https://graph.facebook.com/v22.0/${pageId}/messages`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        recipient: { id: conversation.externalId },
                        messaging_type: 'RESPONSE',
                        message: { text: data.content }
                    })
                }
            );

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
        } else if (conversation.provider === 'instagram') {
            const igId = metaConfig.instagramBusinessAccountId;
            if (!igId) {
                throw new Error(
                    'Instagram Business Account ID not configured for this integration'
                );
            }

            const response = await fetch(
                `https://graph.facebook.com/v22.0/${igId}/messages`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        recipient: { id: conversation.externalId },
                        messaging_type: 'RESPONSE',
                        message: { text: data.content }
                    })
                }
            );

            const result = (await response.json()) as {
                error?: { message?: string };
                message_id?: string;
            };
            if (!response.ok) {
                logger.error({ result }, 'Failed to send Instagram message');
                throw new Error(result.error?.message || 'Meta API error');
            }
            if (result.message_id) {
                externalMessageId = result.message_id;
            }
        }
    } catch (error) {
        const err = error as Error;
        logger.error(
            { err, conversationId: conversation.id },
            'Outbound message failed'
        );
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

    const updatedConversation = await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
        include: { customer: { select: { name: true, email: true } } }
    });

    emitToOrg(data.organizationId, 'message:created', {
        conversation: updatedConversation,
        message
    });

    if (messageStatus === 'FAILED') {
        throw new AppError(
            `Message delivery failed: ${errorMessage}`,
            500,
            'DELIVERY_FAILED'
        );
    }

    return message;
}

export async function startConversation(data: {
    organizationId: string;
    provider: MetaProvider;
    recipientId: string;
    content: string;
    type?: string;
    metadata?: Record<string, unknown>;
    customerPhone?: string;
    customerName?: string;
}) {
    const provider = normalizeProvider(data.provider);

    const recipientId =
        provider === 'whatsapp'
            ? cleanWhatsAppNumber(data.recipientId)
            : data.recipientId;
    const customerPhone =
        provider === 'whatsapp' && data.customerPhone
            ? cleanWhatsAppNumber(data.customerPhone)
            : data.customerPhone;

    // 1. Find or create customer
    let customer = await prisma.customer.findFirst({
        where: {
            organizationId: data.organizationId,
            ...(provider === 'whatsapp'
                ? {
                      OR: [
                          { phone: recipientId },
                          { phone: `+${recipientId}` },
                          ...(customerPhone
                              ? [
                                    { phone: customerPhone },
                                    { phone: `+${customerPhone}` }
                                ]
                              : [])
                      ]
                  }
                : {
                      phone: recipientId
                  })
        }
    });

    if (!customer) {
        customer = await prisma.customer.create({
            data: {
                organizationId: data.organizationId,
                name:
                    data.customerName ||
                    (provider === 'whatsapp' ? `+${recipientId}` : recipientId),
                phone: provider === 'whatsapp' ? recipientId : recipientId,
                source: 'OTHER'
            }
        });
    } else if (provider === 'whatsapp' && customer.phone !== recipientId) {
        // Auto-normalize existing customer phone format to clean digits
        await prisma.customer.update({
            where: { id: customer.id },
            data: { phone: recipientId }
        });
    }

    // 2. Find or create conversation
    let conversation = await prisma.conversation.findFirst({
        where: {
            organizationId: data.organizationId,
            OR: [
                { externalId: recipientId },
                { externalId: `+${recipientId}` }
            ],
            provider
        }
    });

    if (!conversation) {
        conversation = await prisma.conversation.create({
            data: {
                organizationId: data.organizationId,
                customerId: customer.id,
                externalId: recipientId,
                provider,
                status: 'OPEN'
            }
        });
    } else if (conversation.externalId !== recipientId) {
        // Auto-normalize existing conversation externalId format
        conversation = await prisma.conversation.update({
            where: { id: conversation.id },
            data: { externalId: recipientId }
        });
    }

    // 3. Send the message
    const message = await sendOutboundMessage({
        organizationId: data.organizationId,
        conversationId: conversation.id,
        content: data.content,
        type: data.type,
        metadata: data.metadata
    });

    return { conversation, message };
}

export async function downloadAndUploadMetaMedia(data: {
    accessToken: string;
    mediaIdOrUrl: string;
    mimeType: string;
    fileName: string;
    isWhatsApp: boolean;
}): Promise<{ url: string; storageKey?: string }> {
    let downloadUrl = data.mediaIdOrUrl;

    if (data.isWhatsApp) {
        // Step 1: Retrieve the media URL from Meta Graph API using the media ID
        const response = await fetch(`https://graph.facebook.com/v18.0/${data.mediaIdOrUrl}`, {
            headers: {
                Authorization: `Bearer ${data.accessToken}`
            }
        });

        const result = (await response.json()) as { url?: string; error?: { message?: string } };
        if (!response.ok || !result.url) {
            logger.error({ result }, `[Meta Media] Failed to fetch WhatsApp media metadata for ID: ${data.mediaIdOrUrl}`);
            throw new Error(result.error?.message || 'Failed to retrieve WhatsApp media metadata');
        }

        downloadUrl = result.url;
    }

    // Step 2: Download the binary file using the URL
    const fileResponse = await fetch(downloadUrl, {
        headers: {
            Authorization: `Bearer ${data.accessToken}`
        }
    });

    if (!fileResponse.ok) {
        throw new Error(`Failed to download Meta media from URL: ${downloadUrl}`);
    }

    const arrayBuffer = await fileResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Step 3: Upload the buffer
    const { uploadFile } = await import('../uploads/upload.service.js');
    const uploadResult = await uploadFile(
        {
            buffer,
            originalname: data.fileName,
            mimetype: data.mimeType,
            size: buffer.length
        },
        'attachment'
    );

    return {
        url: uploadResult.url,
        storageKey: uploadResult.publicId
    };
}
