import { Worker, type Job } from 'bullmq';
import { getRedisConnectionOptions } from '../config/redis.config.js';
import prisma from '../config/prisma.config.js';
import { handleInboundMessage } from '../api/messaging/messaging.service.js';
import { emitToConversation, emitToOrg } from '../config/socket.config.js';
import logger from '../utils/logger.util.js';
import { decryptSafe } from '../utils/encryption.util.js';

// ----------------------------------------------------
// 1. Webhook Worker: Processes Inbound Webhooks
// ----------------------------------------------------
export const webhookWorker = new Worker(
    'messaging-webhook-queue',
    async (job: Job) => {
        const body = job.data;
        logger.info(`[Worker] Processing webhook job: ${job.id}`);

        if (
            body.object !== 'whatsapp_business_account' &&
            body.object !== 'page' &&
            body.object !== 'instagram'
        ) {
            return;
        }

        for (const entry of body.entry || []) {
            // --- Inbound WhatsApp ---
            for (const change of entry.changes || []) {
                const value = change.value;
                if (value && value.metadata) {
                    const phoneNumberId = value.metadata.phone_number_id;
                    const integration = await prisma.integration.findFirst({
                        where: {
                            provider: 'meta',
                            isActive: true,
                            metadata: {
                                path: ['whatsappPhoneNumberId'],
                                equals: phoneNumberId
                            }
                        }
                    });

                    if (!integration) continue;

                    // Queue status updates separately
                    for (const status of value.statuses || []) {
                        const { addStatusJob } =
                            await import('./messaging.queue.js');
                        await addStatusJob({
                            statusEntry: status,
                            organizationId: integration.orgId
                        });
                    }

                    // Process messages
                    for (const msg of value.messages || []) {
                        const messageContent = getWhatsAppContent(msg);
                        const contact = value.contacts?.find(
                            (c: { wa_id: string }) => c.wa_id === msg.from
                        );
                        const customerName =
                            contact?.profile?.name ||
                            value.contacts?.[0]?.profile?.name;

                        const result = await handleInboundMessage({
                            organizationId: integration.orgId,
                            externalChatId: msg.from,
                            externalMessageId: msg.id,
                            provider: 'whatsapp',
                            content: messageContent,
                            type: msg.type,
                            metadata: msg,
                            customerPhone: msg.from,
                            customerName
                        });

                        // Emit visual changes
                        emitToConversation(
                            result.conversation.id,
                            'message:created',
                            {
                                message: result.message
                            }
                        );
                        emitToOrg(integration.orgId, 'inbox:updated', {
                            conversation: result.conversation
                        });
                    }
                }
            }

            // --- Facebook Messenger & Instagram ---
            if (entry.messaging) {
                const isInstagram = body.object === 'instagram';
                const provider = isInstagram ? 'instagram' : 'facebook';
                const entryId = entry.id;

                const integration = await prisma.integration.findFirst({
                    where: {
                        provider: 'meta',
                        isActive: true,
                        metadata: {
                            path: [
                                isInstagram
                                    ? 'instagramBusinessAccountId'
                                    : 'facebookPageId'
                            ],
                            equals: entryId
                        }
                    }
                });

                if (!integration) continue;

                for (const msgEvent of entry.messaging || []) {
                    // Handle Message status updates (delivery/read ticks)
                    if (msgEvent.delivery || msgEvent.read) {
                        const { addStatusJob } =
                            await import('./messaging.queue.js');
                        await addStatusJob({
                            statusEntry: msgEvent,
                            organizationId: integration.orgId
                        });
                    }

                    // Handle Inbound Message
                    if (
                        msgEvent.message &&
                        !msgEvent.message.is_echo &&
                        !msgEvent.message.is_deleted
                    ) {
                        const { content, type } = getMessagingContent(
                            msgEvent.message
                        );
                        const result = await handleInboundMessage({
                            organizationId: integration.orgId,
                            externalChatId: msgEvent.sender.id,
                            externalMessageId: msgEvent.message.mid,
                            provider,
                            content,
                            type,
                            metadata: msgEvent
                        });

                        emitToConversation(
                            result.conversation.id,
                            'message:created',
                            {
                                message: result.message
                            }
                        );
                        emitToOrg(integration.orgId, 'inbox:updated', {
                            conversation: result.conversation
                        });
                    }
                }
            }
        }
    },
    { connection: getRedisConnectionOptions(), concurrency: 5 }
);

// Helper formats
function getWhatsAppContent(msg: {
    type?: string;
    text?: { body?: string };
    image?: { caption?: string };
    document?: { caption?: string; filename?: string };
    video?: { caption?: string };
    audio?: Record<string, unknown>;
    button?: { text?: string };
    [key: string]: unknown;
}) {
    if (msg.type === 'text') return msg.text?.body || '';
    if (msg.type === 'image') return msg.image?.caption || '[Image]';
    if (msg.type === 'document')
        return msg.document?.caption || msg.document?.filename || '[Document]';
    if (msg.type === 'video') return msg.video?.caption || '[Video]';
    if (msg.type === 'audio') return '[Audio/Voice Note]';
    if (msg.type === 'button') return msg.button?.text || '[Button]';
    return `[${msg.type} Message]`;
}

function getMessagingContent(
    message:
        | {
              text?: string;
              attachments?: Array<{
                  type?: string;
                  payload?: Record<string, unknown>;
              }>;
          }
        | undefined
) {
    if (!message) return { content: '', type: 'unknown' };
    if (message.text) return { content: message.text, type: 'text' };
    const att = message.attachments?.[0];
    const type = att?.type || 'attachment';
    return {
        content: `[${type.charAt(0).toUpperCase()}${type.slice(1)} Attachment]`,
        type
    };
}

// ----------------------------------------------------
// 2. Outbound Worker: dispatches API calls to Meta
// ----------------------------------------------------
export const outboundWorker = new Worker(
    'messaging-outbound-queue',
    async (job: Job) => {
        const { messageId, organizationId, conversationId } = job.data;
        logger.info(`[Worker] Dispatching outbound message: ${messageId}`);

        const message = await prisma.message.findUnique({
            where: { id: messageId },
            include: { conversation: true }
        });

        if (!message || message.status !== 'SENT') {
            // PENDING messages are processed (SENT is initial default in DB model prior to update)
            // Wait, we default to SENT in DB currently, we will change it to PENDING in implementation.
        }

        const conversation = message?.conversation;
        if (!conversation) return;

        // Fetch Integration token
        const channelMetadataKey =
            conversation.provider === 'whatsapp'
                ? 'whatsappPhoneNumberId'
                : conversation.provider === 'facebook'
                  ? 'facebookPageId'
                  : 'instagramBusinessAccountId';

        const metaIntegrations = await prisma.integration.findMany({
            where: { orgId: organizationId, provider: 'meta', isActive: true }
        });

        const integration = metaIntegrations.find(
            (i) =>
                i.metadata &&
                (i.metadata as Record<string, string>)[channelMetadataKey]
        );

        if (!integration) {
            throw new Error(
                `Meta integration for ${conversation.provider} not configured or inactive`
            );
        }

        const accessToken = decryptSafe(integration.accessToken);
        const metaConfig =
            (integration.metadata as Record<string, string>) || {};
        let externalMessageId: string | undefined;

        try {
            if (conversation.provider === 'whatsapp') {
                const phoneNumberId = metaConfig.whatsappPhoneNumberId;

                // Construct media/template/text payload for WhatsApp
                const whatsappPayload: Record<string, unknown> = {
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: conversation.externalId
                };

                const msgMetadata =
                    (message.metadata as Record<string, unknown>) || {};

                if (message.type === 'template') {
                    whatsappPayload.type = 'template';
                    whatsappPayload.template = msgMetadata;
                } else if (message.type === 'image') {
                    whatsappPayload.type = 'image';
                    whatsappPayload.image = {
                        link: message.content,
                        caption: msgMetadata.caption || undefined
                    };
                } else if (message.type === 'document') {
                    whatsappPayload.type = 'document';
                    whatsappPayload.document = {
                        link: message.content,
                        filename: msgMetadata.originalName || 'Attachment',
                        caption: msgMetadata.caption || undefined
                    };
                } else if (message.type === 'video') {
                    whatsappPayload.type = 'video';
                    whatsappPayload.video = {
                        link: message.content,
                        caption: msgMetadata.caption || undefined
                    };
                } else if (message.type === 'audio') {
                    whatsappPayload.type = 'audio';
                    whatsappPayload.audio = {
                        link: message.content
                    };
                } else {
                    whatsappPayload.type = 'text';
                    whatsappPayload.text = { body: message.content };
                }

                const response = await fetch(
                    `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
                    {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(whatsappPayload)
                    }
                );

                const result = (await response.json()) as {
                    error?: { message?: string };
                    messages?: Array<{ id: string }>;
                };
                if (!response.ok) {
                    throw new Error(result.error?.message || 'Meta API error');
                }
                externalMessageId = result.messages?.[0]?.id || undefined;
            } else {
                // Facebook Messenger or Instagram
                const endpointId =
                    conversation.provider === 'instagram'
                        ? metaConfig.instagramBusinessAccountId
                        : metaConfig.facebookPageId;

                // Construct media/text payload for Messenger/Instagram
                const messengerMessage: Record<string, unknown> = {};

                if (message.type === 'image') {
                    messengerMessage.attachment = {
                        type: 'image',
                        payload: { url: message.content, is_reusable: true }
                    };
                } else if (message.type === 'video') {
                    messengerMessage.attachment = {
                        type: 'video',
                        payload: { url: message.content, is_reusable: true }
                    };
                } else if (message.type === 'audio') {
                    messengerMessage.attachment = {
                        type: 'audio',
                        payload: { url: message.content, is_reusable: true }
                    };
                } else if (message.type === 'document') {
                    messengerMessage.attachment = {
                        type: 'file',
                        payload: { url: message.content, is_reusable: true }
                    };
                } else {
                    messengerMessage.text = message.content;
                }

                const response = await fetch(
                    `https://graph.facebook.com/v22.0/${endpointId}/messages`,
                    {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            recipient: { id: conversation.externalId },
                            messaging_type: 'RESPONSE',
                            message: messengerMessage
                        })
                    }
                );

                const result = (await response.json()) as {
                    error?: { message?: string };
                    message_id?: string;
                };
                if (!response.ok) {
                    throw new Error(result.error?.message || 'Meta API error');
                }
                externalMessageId = result.message_id || undefined;
            }

            // Sync successful send in DB
            await prisma.message.update({
                where: { id: messageId },
                data: {
                    status: 'SENT',
                    externalId: externalMessageId,
                    providerMessageId: externalMessageId
                }
            });

            // Emit update to conversation thread & inbox
            emitToConversation(conversationId, 'message:status_updated', {
                conversationId,
                messageId,
                status: 'SENT'
            });
        } catch (err: unknown) {
            const error =
                err instanceof Error ? err : new Error('Unknown error');
            logger.warn(
                { err: error, messageId },
                '[Worker] Outbound job attempt failed'
            );
            // Check if transient to retry, or mark failed
            const isPermanent =
                error.message?.includes('invalid') ||
                error.message?.includes('permission') ||
                job.attemptsMade >= 3;
            if (isPermanent) {
                await prisma.message.update({
                    where: { id: messageId },
                    data: {
                        status: 'FAILED',
                        errorMessage: error.message || 'API delivery failed',
                        errorCode: 'API_ERROR'
                    }
                });

                emitToConversation(conversationId, 'message:status_updated', {
                    conversationId,
                    messageId,
                    status: 'FAILED',
                    errorMessage: error.message
                });
            } else {
                throw err; // Trigger retry in BullMQ
            }
        }
    },
    { connection: getRedisConnectionOptions(), concurrency: 5 }
);

// ----------------------------------------------------
// 3. Status Worker: Updates Read / Delivery states
// ----------------------------------------------------
export const statusWorker = new Worker(
    'messaging-status-queue',
    async (job: Job) => {
        const { statusEntry, organizationId } = job.data;
        logger.info(`[Worker] Processing status receipt: ${job.id}`);

        // --- WhatsApp Status Updates ---
        if (statusEntry.id && statusEntry.status) {
            const message = await prisma.message.findFirst({
                where: { externalId: statusEntry.id },
                include: { conversation: true }
            });

            if (message && message.conversation) {
                const statusMap: Record<
                    string,
                    'SENT' | 'DELIVERED' | 'READ' | 'FAILED'
                > = {
                    sent: 'SENT',
                    delivered: 'DELIVERED',
                    read: 'READ',
                    failed: 'FAILED'
                };
                const newStatus = statusMap[statusEntry.status] || 'SENT';
                const errorMessage =
                    statusEntry.status === 'failed'
                        ? statusEntry.errors?.[0]?.message || 'WhatsApp failed'
                        : null;

                await prisma.message.update({
                    where: { id: message.id },
                    data: { status: newStatus, errorMessage }
                });

                emitToConversation(
                    message.conversationId,
                    'message:status_updated',
                    {
                        conversationId: message.conversationId,
                        messageId: message.id,
                        status: newStatus,
                        errorMessage
                    }
                );
            }
        }

        // --- Facebook & Instagram Status Updates ---
        if (statusEntry.delivery || statusEntry.read) {
            const senderId = statusEntry.sender.id;
            const conversation = await prisma.conversation.findFirst({
                where: { externalId: senderId, organizationId }
            });

            if (conversation) {
                if (statusEntry.read) {
                    // Mark all outbound messages read
                    await prisma.message.updateMany({
                        where: {
                            conversationId: conversation.id,
                            direction: 'OUTBOUND',
                            status: { in: ['SENT', 'DELIVERED'] }
                        },
                        data: { status: 'READ' }
                    });

                    emitToConversation(
                        conversation.id,
                        'conversation:read_receipt',
                        {
                            conversationId: conversation.id,
                            status: 'READ'
                        }
                    );
                } else if (statusEntry.delivery) {
                    // Mark all outbound messages delivered
                    await prisma.message.updateMany({
                        where: {
                            conversationId: conversation.id,
                            direction: 'OUTBOUND',
                            status: 'SENT'
                        },
                        data: { status: 'DELIVERED' }
                    });

                    emitToConversation(
                        conversation.id,
                        'conversation:read_receipt',
                        {
                            conversationId: conversation.id,
                            status: 'DELIVERED'
                        }
                    );
                }
            }
        }
    },
    { connection: getRedisConnectionOptions(), concurrency: 5 }
);
