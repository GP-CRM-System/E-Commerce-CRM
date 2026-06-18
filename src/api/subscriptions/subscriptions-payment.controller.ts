import type { Response, Request } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import * as subscriptionService from './subscriptions.service.js';
import { env } from '../../config/env.config.js';
import {
    createIntention,
    verifyCallbackSignature,
    parseRedirectQueryParams,
    type PaymobIntentionPayload,
    type PaymobCallbackPayload
} from '../../utils/paymob.util.js';
import {
    ResponseHandler,
    HttpStatus,
    ErrorCode
} from '../../utils/response.util.js';
import { asyncHandler } from '../../middlewares/error.middleware.js';
import { z } from 'zod';
import logger from '../../utils/logger.util.js';

const initializeSubscriptionSchema = z.object({
    planId: z.string().min(1),
    billingCycle: z.enum(['monthly', 'yearly']).optional().default('monthly')
});

export const initializeSubscription = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const parsed = initializeSubscriptionSchema.safeParse(req.body);

        if (!parsed.success) {
            return ResponseHandler.error(
                res,
                'Invalid request',
                ErrorCode.VALIDATION_ERROR,
                HttpStatus.BAD_REQUEST
            );
        }

        const { planId, billingCycle } = parsed.data;

        try {
            const result = await subscriptionService.subscribeOrganization(
                organizationId,
                planId,
                billingCycle
            );

            if (result.paymentRequired) {
                const amountCents = Math.round(result.amount! * 100);

                const nameParts = (req.user.name || 'CRM Merchant').split(' ');
                const firstName = nameParts[0] || 'CRM';
                const lastName = nameParts.slice(1).join(' ') || 'Merchant';

                const notificationUrl = `${env.appUrl}/api/subscriptions/paymob/callback`;
                const redirectionUrl = `${env.appUrl}/api/subscriptions/paymob/redirect`;

                const intentionPayload: PaymobIntentionPayload = {
                    amount: amountCents,
                    currency: 'EGP',
                    payment_methods: [env.paymobCardIntegrationId!],
                    items: [
                        {
                            name: result.subscription.plan.displayName,
                            amount: amountCents,
                            description: `CRM Subscription Upgrade to ${result.subscription.plan.displayName} (${billingCycle})`,
                            quantity: 1
                        }
                    ],
                    billing_data: {
                        apartment: 'dummy',
                        first_name: firstName,
                        last_name: lastName,
                        street: 'dummy',
                        building: 'dummy',
                        phone_number: '+201000000000',
                        city: 'Cairo',
                        country: 'EGY',
                        email: req.user.email,
                        floor: 'dummy',
                        state: 'Cairo'
                    },
                    notification_url: notificationUrl,
                    redirection_url: redirectionUrl,
                    special_reference: `${organizationId}__${Date.now()}`
                };

                const intention = await createIntention(intentionPayload);

                const paymentUrl = `https://accept.paymob.com/unifiedcheckout/?publicKey=${env.paymobPublicKey}&clientSecret=${intention.client_secret}`;

                return ResponseHandler.success(
                    res,
                    'Payment required',
                    HttpStatus.PAYMENT_REQUIRED,
                    {
                        subscription: result.subscription,
                        paymob: {
                            clientSecret: intention.client_secret,
                            paymentUrl,
                            intentionId: intention.id
                        }
                    },
                    req.url
                );
            }

            return ResponseHandler.success(
                res,
                'Subscription activated',
                HttpStatus.OK,
                result,
                req.url
            );
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Failed to initialize subscription';
            logger.error({ error }, 'Failed to initialize subscription');
            return ResponseHandler.error(
                res,
                message,
                ErrorCode.SERVER_ERROR,
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }
);

export const subscriptionCallback = asyncHandler(
    async (req: Request, res: Response) => {
        const body = req.body as PaymobCallbackPayload;
        const hmacReceived = (req.query.hmac || body.hmac) as string;

        if (!hmacReceived) {
            logger.warn('Paymob callback missing HMAC signature');
            return res.status(400).send('Missing hmac signature');
        }

        const isValid = verifyCallbackSignature(body, hmacReceived);

        if (!isValid) {
            return res.status(403).send('Invalid checksum signature');
        }

        const { obj } = body;
        const isSuccess = obj.success === true;
        const rawRef =
            obj.merchant_order_id || obj.extra?.special_reference;
        // Extract organizationId from compound reference (orgId__timestamp)
        const organizationId = rawRef?.split('__')[0];

        if (!organizationId) {
            logger.warn('Paymob callback missing organizationId reference');
            return res.status(400).send('Missing organization reference');
        }

        if (isSuccess) {
            logger.info(
                { organizationId, transactionId: obj.id },
                'Activating CRM subscription via Paymob success webhook'
            );
            await subscriptionService.activateSubscription(
                organizationId,
                String(obj.id)
            );
        } else {
            logger.warn(
                { organizationId, transactionId: obj.id },
                'Paymob payment transaction unsuccessful'
            );
        }

        return res.status(200).send('OK');
    }
);

export const subscriptionRedirect = asyncHandler(
    async (req: Request, res: Response) => {
        const parsed = parseRedirectQueryParams(
            req.query as Record<string, string | undefined>
        );

        if (!parsed) {
            logger.warn('Paymob redirect callback missing required params');
            return res
                .status(400)
                .send(
                    '<html><body><h1>Payment Failed</h1><p>Missing payment callback parameters.</p></body></html>'
                );
        }

        const isValid = verifyCallbackSignature(parsed.payload, parsed.hmac);

        if (!isValid) {
            return res
                .status(403)
                .send(
                    '<html><body><h1>Payment Verification Failed</h1><p>Invalid signature.</p></body></html>'
                );
        }

        const { obj } = parsed.payload;
        // Extract organizationId from compound reference (orgId__timestamp)
        const organizationId = obj.merchant_order_id?.split('__')[0];

        if (!organizationId) {
            logger.warn(
                'Paymob redirect callback missing organization reference'
            );
            return res
                .status(400)
                .send(
                    '<html><body><h1>Payment Failed</h1><p>Missing organization reference.</p></body></html>'
                );
        }

        if (obj.success) {
            await subscriptionService.activateSubscription(
                organizationId,
                obj.id
            );
            logger.info(
                { organizationId, transactionId: obj.id },
                'Subscription activated via Paymob redirect callback'
            );
        }

        res.setHeader('Content-Type', 'text/html');
        return res.status(200).send(`
            <html>
            <body style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f5f5f5;">
                <div style="text-align: center; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                    <h1 style="color: ${obj.success ? '#22c55e' : '#ef4444'};">
                        ${obj.success ? '✓ Payment Successful!' : '✗ Payment Failed'}
                    </h1>
                    <p>${obj.success ? 'Your CRM subscription has been activated.' : 'The payment was not completed.'}</p>
                    <p style="color: #666; font-size: 14px;">Transaction ID: ${obj.id}</p>
                    <a href="${env.appUrl}" style="display: inline-block; margin-top: 20px; padding: 10px 24px; background: #3b82f6; color: white; text-decoration: none; border-radius: 6px;">
                        Return to Dashboard
                    </a>
                </div>
            </body>
            </html>
        `);
    }
);
