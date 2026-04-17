import { Router } from 'express';
import * as campaignService from './campaign.service.js';

const router = Router();

router.get('/open/:recipientId', async (req, res) => {
    try {
        await campaignService.updateRecipientOpened(req.params.recipientId);
    } catch {
        // Silently ignore errors - tracking should not break emails
    }

    const pixel = Buffer.from(
        'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        'base64'
    );

    res.setHeader('Content-Type', 'image/gif');
    res.setHeader(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate'
    );
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(pixel);
});

router.get('/click/:recipientId', async (req, res) => {
    const { url } = req.query;

    if (!url || typeof url !== 'string') {
        res.status(400).send('Missing url parameter');
        return;
    }

    try {
        await campaignService.updateRecipientClicked(req.params.recipientId);
    } catch {
        // Silently ignore errors
    }

    res.redirect(302, url);
});

export default router;
