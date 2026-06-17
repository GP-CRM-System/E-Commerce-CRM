import type { Response } from 'express';
import crypto from 'crypto';
import { asyncHandler } from '../../../middlewares/error.middleware.js';
import type { AuthenticatedRequest } from '../../../middlewares/auth.middleware.js';
import { shopify } from './shopify.client.js';
import { env } from '../../../config/env.config.js';
import prisma from '../../../config/prisma.config.js';
import { encrypt } from '../../../utils/encryption.util.js';
import { AuditService } from '../../audit/audit.service.js';
import {
    AuthorizationError,
    HttpStatus
} from '../../../utils/response.util.js';
import logger from '../../../utils/logger.util.js';
import { addShopifyFullSyncJob } from '../../../queues/shopify-sync.queue.js';
import { registerWebhooks } from '../integration.service.js';
import { REGISTRABLE_WEBHOOK_TOPICS } from '../integration.schemas.js';

function generateNonce(): string {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * GET /api/integrations/shopify/auth
 * Initiates the Shopify OAuth flow.
 * Expects ?shop=my-store.myshopify.com
 */
export const startAuth = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { activeOrganizationId } = req.session;
        if (!activeOrganizationId) {
            throw new AuthorizationError('No active organization selected');
        }

        const shop = String(req.query.shop);
        if (!shop || !shop.includes('.myshopify.com')) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                success: false,
                message:
                    'A valid Shopify store domain (e.g., example.myshopify.com) is required.'
            });
        }

        // Generate a nonce for CSRF protection and store it with orgId in a signed cookie
        const nonce = generateNonce();
        const cookieData = JSON.stringify({
            orgId: activeOrganizationId,
            nonce
        });
        res.cookie('shopify_oauth_session', cookieData, {
            httpOnly: true,
            secure: env.nodeEnv === 'production',
            signed: true,
            maxAge: 1000 * 60 * 15 // 15 minutes
        });

        const sanitizedShop = shopify.utils.sanitizeShop(shop, true);
        if (!sanitizedShop) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                success: false,
                message: 'Invalid shop domain'
            });
        }

        await shopify.auth.begin({
            shop: sanitizedShop,
            callbackPath: '/api/integrations/shopify/callback',
            isOnline: false,
            rawRequest: req,
            rawResponse: res
        });
    }
);

/**
 * GET /api/integrations/shopify/callback
 * Handles the OAuth callback from Shopify, saves the token, and redirects.
 */
export const callback = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        // 1. Validate the cookie and extract orgId + nonce
        const cookieData = req.signedCookies['shopify_oauth_session'];
        if (!cookieData) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                success: false,
                message: 'OAuth session expired or invalid. Please try again.'
            });
        }

        let parsed: { orgId: string; nonce: string };
        try {
            parsed = JSON.parse(cookieData);
        } catch {
            return res.status(HttpStatus.BAD_REQUEST).json({
                success: false,
                message: 'OAuth session corrupted. Please try again.'
            });
        }

        const { orgId, nonce } = parsed;
        if (!orgId || !nonce) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                success: false,
                message: 'OAuth session invalid. Please try again.'
            });
        }

        // 2. Clear the cookie
        res.clearCookie('shopify_oauth_session');

        // 3. Validate the state parameter from Shopify matches our nonce
        const state = req.query.state as string;
        if (!state || state !== nonce) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                success: false,
                message: 'CSRF validation failed. Please try again.'
            });
        }

        try {
            // 4. Process the callback (exchanges code for token, validates HMAC)
            const callbackResponse = await shopify.auth.callback({
                rawRequest: req,
                rawResponse: res
            });

            const { session } = callbackResponse;

            // 5. Encrypt the access token
            const encryptedToken = encrypt(session.accessToken!);

            // 6. Find existing or create the Integration record in the database
            let integration = await prisma.integration.findFirst({
                where: {
                    orgId,
                    provider: 'shopify',
                    shopDomain: session.shop
                }
            });

            if (integration) {
                integration = await prisma.integration.update({
                    where: { id: integration.id },
                    data: {
                        accessToken: encryptedToken,
                        syncStatus: 'pending',
                        isActive: true,
                        updatedAt: new Date()
                    }
                });
            } else {
                integration = await prisma.integration.create({
                    data: {
                        orgId,
                        provider: 'shopify',
                        shopDomain: session.shop,
                        accessToken: encryptedToken,
                        syncStatus: 'pending',
                        isActive: true
                    }
                });
            }

            // 7. Log the action
            await AuditService.log({
                organizationId: orgId,
                userId: req.session?.userId || null,
                action: 'integration.connected',
                targetId: integration.id,
                targetType: 'integration',
                metadata: { provider: 'shopify', shop: session.shop }
            });

            // 8. Enqueue initial data sync (fire-and-forget)
            addShopifyFullSyncJob(integration.id).catch((err) => {
                logger.warn({ err }, 'Failed to enqueue initial Shopify sync');
            });

            // 9. Auto-register webhooks (fire-and-forget)
            // app/uninstalled is excluded since Shopify sends it automatically
            registerWebhooks(
                integration.id,
                orgId,
                REGISTRABLE_WEBHOOK_TOPICS as unknown as string[],
                env.appUrl || 'http://localhost:3000'
            ).catch((err) => {
                logger.warn(
                    { err },
                    'Failed to auto-register Shopify webhooks'
                );
            });

            // 10. Redirect back to the frontend connections tab
            const frontendUrl = (env.appUrl || 'http://localhost:5173').replace(
                /\/$/,
                ''
            );
            res.redirect(
                `${frontendUrl}/dashboard/settings?tab=connections&shopify=connected`
            );
        } catch (error) {
            logger.error({ err: error }, 'Shopify OAuth callback failed');
            const frontendUrl = (env.appUrl || 'http://localhost:5173').replace(
                /\/$/,
                ''
            );
            res.redirect(
                `${frontendUrl}/dashboard/settings?tab=connections&shopify=error`
            );
        }
    }
);
