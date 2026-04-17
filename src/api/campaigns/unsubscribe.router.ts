import { Router } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../../config/prisma.config.js';

const router = Router();

interface UnsubscribeToken {
    customerId: string;
    campaignId: string;
}

router.get('/:token', async (req, res) => {
    const { token } = req.params;
    const secret = process.env.BETTER_AUTH_SECRET || 'default-secret';

    try {
        const decoded = jwt.verify(token, secret) as UnsubscribeToken;
        const { customerId, campaignId } = decoded;

        await Promise.all([
            prisma.customer.update({
                where: { id: customerId },
                data: { acceptsMarketing: false }
            }),
            prisma.campaignRecipient.updateMany({
                where: { campaignId, customerId },
                data: { status: 'UNSUBSCRIBED' }
            })
        ]);

        res.setHeader('Content-Type', 'text/html');
        res.send(`
            <html>
                <head>
                    <title>Unsubscribed</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                        .success { color: green; }
                    </style>
                </head>
                <body>
                    <h1 class="success">Successfully Unsubscribed</h1>
                    <p>You have been removed from our marketing list.</p>
                </body>
            </html>
        `);
    } catch {
        res.status(400).send('Invalid or expired unsubscribe link');
    }
});

export function generateUnsubscribeToken(
    customerId: string,
    campaignId: string
): string {
    const secret = process.env.BETTER_AUTH_SECRET || 'default-secret';
    return jwt.sign({ customerId, campaignId }, secret, { expiresIn: '30d' });
}

export default router;
