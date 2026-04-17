import { Router, type Request, type Response } from 'express';
import logger from '../../utils/logger.util.js';
import { env } from '../../config/env.config.js';

const router = Router();

// GET /api/messaging/meta/webhook - Webhook verification
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

// POST /api/messaging/meta/webhook - Webhook reception
router.post('/meta/webhook', async (req: Request, res: Response) => {
    const body = req.body;

    logger.info({ body }, 'Received Meta webhook');

    // Body validation and signature check would go here in production
    // For now, return 200 immediately to Meta
    res.status(200).send('EVENT_RECEIVED');

    // Process asynchronously
    try {
        // await processMetaWebhook(body);
    } catch (err) {
        logger.error({ err }, 'Error processing Meta webhook');
    }
});

// async function processMetaWebhook(
// body: any
// ) {
// Basic normalization logic for WhatsApp/FB/IG
// Task 6.2 requirement
// }

export default router;
