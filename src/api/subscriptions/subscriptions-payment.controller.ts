import type { Response, Request } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import * as subscriptionService from './subscriptions.service.js';
import crypto from 'crypto';
import {
    ResponseHandler,
    HttpStatus,
    ErrorCode
} from '../../utils/response.util.js';
import { asyncHandler } from '../../middlewares/error.middleware.js';
import { z } from 'zod';

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
                const config = {
                    merchantCode: process.env.FAWRY_MERCHANT_CODE || 'TEST',
                    securityKey: process.env.FAWRY_SECURITY_KEY || 'TEST',
                    baseUrl:
                        process.env.FAWRY_BASE_URL ||
                        'https://atfawry.fawrystaging.com'
                };

                const signatureSource = `${config.merchantCode}${organizationId}${result.amount}${config.securityKey}`;
                const signature = crypto
                    .createHash('sha256')
                    .update(signatureSource)
                    .digest('hex');

                return ResponseHandler.success(
                    res,
                    'Payment required',
                    HttpStatus.PAYMENT_REQUIRED,
                    {
                        subscription: result.subscription,
                        fawry: {
                            merchantCode: config.merchantCode,
                            merchantRefNum: organizationId,
                            amount: result.amount,
                            signature,
                            fawryUrl:
                                config.baseUrl + '/atfawry/plugin/fawry-pay.js'
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
        const { merchantRefNum, fawryRefNo, orderStatus, checksum } = req.body;

        if (!merchantRefNum || !fawryRefNo || !orderStatus || !checksum) {
            return res.status(400).send('Missing required fields');
        }

        const config = {
            merchantCode: process.env.FAWRY_MERCHANT_CODE || 'TEST',
            securityKey: process.env.FAWRY_SECURITY_KEY || 'TEST'
        };

        const expectedChecksum = crypto
            .createHash('sha256')
            .update(
                `${config.merchantCode}${merchantRefNum}${fawryRefNo}${orderStatus}${config.securityKey}`
            )
            .digest('hex');

        if (checksum !== expectedChecksum) {
            return res.status(403).send('Invalid checksum');
        }

        if (orderStatus === 'PAID') {
            await subscriptionService.activateSubscription(
                merchantRefNum,
                fawryRefNo
            );
        }

        return res.status(200).send('OK');
    }
);
