import {
    Router,
    type Request,
    type Response,
    type NextFunction
} from 'express';
import crypto from 'crypto';
import logger from '../../utils/logger.util.js';
import { env } from '../../config/env.config.js';
import prisma from '../../config/prisma.config.js';
import { handleInboundMessage } from './messaging.service.js';
import { emitToOrg } from '../../config/socket.config.js';
import { MetaWebhookSchema } from './meta-webhook.schema.js';
import { addWebhookJob } from '../../queues/messaging.queue.js';

const router = Router();

interface MetaWebhookBody {
    object: string;
    entry?: Array<{
        id: string;
        time?: number;
        changes?: Array<{
            value: {
                messages?: Array<{
                    id: string;
                    from: string;
                    type: string;
                    text?: { body: string };
                    image?: {
                        id?: string;
                        caption?: string;
                        mime_type?: string;
                    };
                    document?: {
                        id?: string;
                        caption?: string;
                        filename?: string;
                        mime_type?: string;
                    };
                    audio?: { id?: string; mime_type?: string };
                    video?: {
                        id?: string;
                        caption?: string;
                        mime_type?: string;
                    };
                    button?: { text?: string; payload?: string };
                }>;
                statuses?: Array<{
                    id: string;
                    status: 'sent' | 'delivered' | 'read' | 'failed';
                    errors?: Array<{ title?: string; message?: string }>;
                }>;
                metadata?: {
                    phone_number_id: string;
                };
                contacts?: Array<{
                    wa_id: string;
                }>;
            };
        }>;
        messaging?: Array<{
            sender: { id: string };
            recipient?: { id: string };
            timestamp?: number;
            message?: {
                mid: string;
                text?: string;
                is_echo?: boolean;
                is_deleted?: boolean;
                attachments?: Array<{
                    type?: string;
                    payload?: Record<string, unknown>;
                }>;
            };
        }>;
    }>;
}

type MetaIntegrationMetadata = {
    whatsappPhoneNumberId?: string;
    facebookPageId?: string;
    instagramBusinessAccountId?: string;
};

type WhatsAppWebhookMessage = {
    type: string;
    text?: { body: string };
    image?: { caption?: string };
    document?: { caption?: string; filename?: string };
    audio?: { mime_type?: string };
    video?: { caption?: string };
    button?: { text?: string };
};

type MetaMessagingMessage = {
    text?: string;
    attachments?: Array<{ type?: string; payload?: Record<string, unknown> }>;
};

const findMetaIntegrationOrg = async (
    metadataKey: keyof MetaIntegrationMetadata,
    metadataValue: string
) => {
    const integrations = await prisma.integration.findMany({
        where: { provider: 'meta', isActive: true },
        select: { orgId: true, metadata: true }
    });

    return integrations.find(
        (integration) =>
            (integration.metadata as MetaIntegrationMetadata | null)?.[
                metadataKey
            ] === metadataValue
    )?.orgId;
};

const getWhatsAppContent = (msg: WhatsAppWebhookMessage) => {
    if (msg.type === 'text') return msg.text?.body || '';
    if (msg.type === 'image') return msg.image?.caption || '[Image Message]';
    if (msg.type === 'document') {
        return (
            msg.document?.caption ||
            msg.document?.filename ||
            '[Document Message]'
        );
    }
    if (msg.type === 'video') return msg.video?.caption || '[Video Message]';
    if (msg.type === 'audio') return '[Audio Message]';
    if (msg.type === 'button') return msg.button?.text || '[Button Message]';

    return `[${msg.type} Message]`;
};

const getMessagingContent = (message: MetaMessagingMessage | undefined) => {
    if (!message) return { content: '', type: 'unknown' };
    if (message.text) return { content: message.text, type: 'text' };

    const attachment = message.attachments?.[0];
    const attachmentType = attachment?.type || 'attachment';

    return {
        content: `[${attachmentType.charAt(0).toUpperCase()}${attachmentType.slice(1)} Message]`,
        type: attachmentType
    };
};

const verifyMetaSignature = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    if (!env.metaAppSecret) {
        logger.warn(
            'META_APP_SECRET is not configured, skipping signature verification'
        );
        return next();
    }

    const signature = req.headers['x-hub-signature-256'] as string;
    if (!signature) {
        logger.warn('Missing x-hub-signature-256 header');
        return res.status(400).send('Missing signature');
    }

    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
        logger.warn('rawBody not available for signature verification');
        return res.status(500).send('Server configuration error');
    }

    const expectedSignature = `sha256=${crypto
        .createHmac('sha256', env.metaAppSecret)
        .update(rawBody)
        .digest('hex')}`;

    if (
        !crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignature)
        )
    ) {
        logger.warn('Invalid Meta webhook signature');
        return res.status(403).send('Invalid signature');
    }

    next();
};

router.get('/meta/webhook', (req: Request, res: Response) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === env.metaVerifyToken) {
        logger.info('Meta webhook verified');
        return res.status(200).send(challenge);
    }

    return res.status(403).send('Forbidden');
});

router.post(
    '/meta/webhook',
    verifyMetaSignature,
    async (req: Request, res: Response) => {
        const body = req.body;

        try {
            // Hardened validation schema check
            const parsed = MetaWebhookSchema.safeParse(body);
            if (!parsed.success) {
                logger.warn({ error: parsed.error }, '[Webhook] Validation failed for incoming packet');
                return res.status(400).send('Malformed payload structure');
            }

            // Acknowledge immediately to avoid timeout retries (under 3 seconds)
            res.status(200).send('EVENT_RECEIVED');

            // Dispatch parsing and processing to Redis BullMQ worker
            await addWebhookJob(parsed.data);
        } catch (err) {
            logger.error({ err }, '[Webhook] Failed to queue incoming payload');
            if (!res.headersSent) {
                res.status(500).send('Failed to queue job');
            }
        }
    }
);

async function processMetaWebhook(body: MetaWebhookBody) {
    if (
        body.object !== 'whatsapp_business_account' &&
        body.object !== 'page' &&
        body.object !== 'instagram'
    ) {
        logger.debug(
            { object: body.object },
            'Received non-messaging webhook object'
        );
        return;
    }

    for (const entry of body.entry || []) {
        // --- WhatsApp Business Account webhooks ---
        for (const change of entry.changes || []) {
            const value = change.value;
            if (value && value.metadata) {
                const phoneNumberId = value.metadata.phone_number_id;
                const organizationId = await findMetaIntegrationOrg(
                    'whatsappPhoneNumberId',
                    phoneNumberId
                );
                if (!organizationId) {
                    logger.warn(
                        { phoneNumberId },
                        'Received WhatsApp webhook for unknown phone number ID'
                    );
                    continue;
                }

                for (const status of value.statuses || []) {
                    const message = await prisma.message.findFirst({
                        where: { externalId: status.id },
                        include: { conversation: true }
                    });

                    if (message && message.conversation) {
                        const newStatus =
                            status.status === 'read'
                                ? 'READ'
                                : status.status === 'delivered'
                                  ? 'DELIVERED'
                                  : status.status === 'failed'
                                    ? 'FAILED'
                                    : 'SENT';
                        const errorMessage =
                            status.status === 'failed'
                                ? status.errors?.[0]?.message ||
                                  status.errors?.[0]?.title ||
                                  'WhatsApp delivery failed'
                                : null;

                        await prisma.message.update({
                            where: { id: message.id },
                            data: {
                                status: newStatus,
                                errorMessage: errorMessage
                            }
                        });

                        emitToOrg(message.conversation.organizationId, 'message:status_updated', {
                            conversationId: message.conversationId,
                            messageId: message.id,
                            status: newStatus,
                            errorMessage: errorMessage
                        });
                    }
                }

                for (const msg of value.messages || []) {
                    const customerPhone = msg.from;
                    const messageContent = getWhatsAppContent(msg);

                    await handleInboundMessage({
                        organizationId,
                        externalChatId: msg.from,
                        externalMessageId: msg.id,
                        provider: 'whatsapp',
                        content: messageContent,
                        type: msg.type,
                        metadata: msg,
                        customerPhone
                    });
                }
            }
        }

        // --- Facebook Messenger & Instagram webhooks ---
        if (entry.messaging) {
            const isInstagram = body.object === 'instagram';
            const provider = isInstagram ? 'instagram' : 'facebook';

            const entryId = entry.id;
            const organizationId = await findMetaIntegrationOrg(
                isInstagram ? 'instagramBusinessAccountId' : 'facebookPageId',
                entryId
            );
            if (!organizationId) {
                logger.warn(
                    { entryId, provider },
                    `Received ${provider} webhook for unknown ID`
                );
                continue;
            }

            for (const msgEvent of entry.messaging || []) {
                if (
                    msgEvent.message &&
                    !msgEvent.message.is_echo &&
                    !msgEvent.message.is_deleted
                ) {
                    const senderId = msgEvent.sender.id;
                    const messageId = msgEvent.message.mid;
                    const { content, type } = getMessagingContent(
                        msgEvent.message
                    );

                    await handleInboundMessage({
                        organizationId,
                        externalChatId: senderId,
                        externalMessageId: messageId,
                        provider,
                        content,
                        type,
                        metadata: msgEvent
                    });
                }
            }
        }
    }
}

export default router;
