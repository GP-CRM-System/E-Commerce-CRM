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

const router = Router();

interface MetaWebhookBody {
    object: string;
    entry?: Array<{
        id: string;
        changes?: Array<{
            value: {
                messages?: Array<{
                    id: string;
                    from: string;
                    type: string;
                    text?: { body: string };
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
            message?: {
                mid: string;
                text?: string;
                is_echo?: boolean;
            };
        }>;
    }>;
}

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
        res.status(200).send('EVENT_RECEIVED');

        try {
            await processMetaWebhook(body);
        } catch (err) {
            logger.error(
                { err, body: JSON.stringify(body) },
                'Error processing Meta webhook'
            );
        }
    }
);

async function processMetaWebhook(body: MetaWebhookBody) {
    if (body.object !== 'whatsapp_business_account' && body.object !== 'page') {
        logger.debug(
            { object: body.object },
            'Received non-messaging webhook object'
        );
        return;
    }

    for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
            const value = change.value;
            if (value && value.messages && value.metadata) {
                const phoneNumberId = value.metadata.phone_number_id;
                const integrations = await prisma.$queryRaw<
                    { orgId: string }[]
                >`
                    SELECT "orgId" FROM "Integration" 
                    WHERE provider = 'meta' 
                    AND metadata->>'whatsappPhoneNumberId' = ${phoneNumberId}
                    LIMIT 1
                `;

                const organizationId = integrations[0]?.orgId;
                if (!organizationId) {
                    logger.warn(
                        { phoneNumberId },
                        'Received WhatsApp webhook for unknown phone number ID'
                    );
                    continue;
                }

                for (const msg of value.messages || []) {
                    const customerPhone = msg.from;
                    let messageContent: string;
                    if (msg.type === 'text')
                        messageContent = msg.text?.body || '';
                    else if (msg.type === 'image')
                        messageContent = '[Image Message]';
                    else if (msg.type === 'document')
                        messageContent = '[Document Message]';
                    else messageContent = `[${msg.type} Message]`;

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

        if (entry.messaging) {
            const pageId = entry.id;
            const integrations = await prisma.$queryRaw<{ orgId: string }[]>`
                SELECT "orgId" FROM "Integration" 
                WHERE provider = 'meta' 
                AND metadata->>'facebookPageId' = ${pageId}
                LIMIT 1
            `;

            const organizationId = integrations[0]?.orgId;
            if (!organizationId) {
                logger.warn(
                    { pageId },
                    'Received Messenger webhook for unknown page ID'
                );
                continue;
            }

            for (const msgEvent of entry.messaging || []) {
                if (msgEvent.message && !msgEvent.message.is_echo) {
                    const senderId = msgEvent.sender.id;
                    const messageId = msgEvent.message.mid;
                    const content = msgEvent.message.text || '[Attachment]';

                    await handleInboundMessage({
                        organizationId,
                        externalChatId: senderId,
                        externalMessageId: messageId,
                        provider: 'facebook',
                        content,
                        type: msgEvent.message.text ? 'text' : 'attachment',
                        metadata: msgEvent
                    });
                }
            }
        }
    }
}

export default router;
