import {
    Router,
    type Request,
    type Response,
    type NextFunction
} from 'express';
import crypto from 'crypto';
import logger from '../../utils/logger.util.js';
import { env } from '../../config/env.config.js';
import { MetaWebhookSchema } from './meta-webhook.schema.js';
import { addWebhookJob } from '../../queues/messaging.queue.js';

const router = Router();

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
                logger.warn(
                    { error: parsed.error },
                    '[Webhook] Validation failed for incoming packet'
                );
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

export default router;
