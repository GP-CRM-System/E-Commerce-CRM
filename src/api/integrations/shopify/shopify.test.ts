import { describe, expect, it, mock, beforeEach, afterEach } from 'bun:test';
import type { Response, Request, NextFunction, RequestHandler } from 'express';
import { startAuth, callback } from './shopify.controller.js';
import { shopify } from './shopify.client.js';
import prisma from '../../../config/prisma.config.js';
import { AuditService } from '../../audit/audit.service.js';
import * as encryptionUtil from '../../../utils/encryption.util.js';
import { AuthorizationError } from '../../../utils/response.util.js';
import type { AuthenticatedRequest } from '../../../middlewares/auth.middleware.js';

// Mock dependencies
mock.module('../../../utils/encryption.util.js', () => ({
    encrypt: mock(() => 'encrypted_mock_token')
}));

mock.module('../../audit/audit.service.js', () => ({
    AuditService: {
        log: mock(async () => {})
    }
}));

describe('Shopify Integration Controller', () => {
    let req: Partial<AuthenticatedRequest>;
    let res: Partial<Response>;

    let originalConsoleError: typeof console.error;

    beforeEach(() => {
        originalConsoleError = console.error;
        console.error = mock();

        req = {
            session: {
                activeOrganizationId: 'org_123',
                id: 'sess_1',
                userId: 'user_1',
                createdAt: new Date(),
                updatedAt: new Date(),
                expiresAt: new Date(),
                token: 'mock_token',
                role: 'admin',
                permissions: null
            },
            query: {},
            signedCookies: {}
        };
        res = {
            status: mock().mockReturnThis(),
            json: mock().mockReturnThis(),
            cookie: mock(),
            clearCookie: mock(),
            redirect: mock()
        };

        // Reset Shopify mocks
        shopify.auth.begin = mock(async () => {});
        shopify.auth.callback = mock(async () => ({
            session: {
                shop: 'test-store.myshopify.com',
                accessToken: 'shpat_mock123'
            },
            headers: {}
        })) as unknown as (typeof shopify.auth)['callback'];

        // Reset Prisma mocks
        prisma.integration.findFirst = mock(
            async () => null
        ) as unknown as typeof prisma.integration.findFirst;
        prisma.integration.create = mock(
            async (args: Parameters<typeof prisma.integration.create>[0]) => ({
                id: 'int_123',
                ...(args.data as Record<string, unknown>)
            })
        ) as unknown as typeof prisma.integration.create;
        prisma.integration.update = mock(
            async (args: Parameters<typeof prisma.integration.update>[0]) => ({
                id: 'int_123',
                ...(args.data as Record<string, unknown>)
            })
        ) as unknown as typeof prisma.integration.update;
    });

    afterEach(() => {
        console.error = originalConsoleError;
    });

    const runHandler = async (
        handler: RequestHandler,
        req: Partial<AuthenticatedRequest>,
        res: Partial<Response>
    ) => {
        let err: unknown;
        handler(
            req as unknown as Request,
            res as unknown as Response,
            ((e: unknown) => {
                err = e;
            }) as unknown as NextFunction
        );
        // wait for a short tick to let all promises settle
        await new Promise((resolve) => setTimeout(resolve, 20));
        if (err) throw err;
    };

    describe('startAuth', () => {
        it('throws AuthorizationError if no active organization', async () => {
            req.session!.activeOrganizationId = undefined;

            await expect(runHandler(startAuth, req, res)).rejects.toThrow(
                AuthorizationError
            );
        });

        it('returns 400 if shop domain is missing or invalid', async () => {
            req.query = { shop: 'invalid-domain' };

            await runHandler(startAuth, req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringContaining(
                        'valid Shopify store domain'
                    )
                })
            );
        });

        it('initiates OAuth flow with valid shop domain', async () => {
            req.query = { shop: 'test-store.myshopify.com' };

            await runHandler(startAuth, req, res);

            expect(res.cookie).toHaveBeenCalledWith(
                'shopify_oauth_session',
                expect.stringContaining('"orgId":"org_123"'),
                expect.objectContaining({ httpOnly: true, signed: true })
            );
            expect(shopify.auth.begin).toHaveBeenCalledWith(
                expect.objectContaining({
                    shop: 'test-store.myshopify.com',
                    callbackPath: '/api/integrations/shopify/callback'
                })
            );
        });
    });

    describe('callback', () => {
        it('returns 400 if org cookie is missing', async () => {
            req.signedCookies = {};
            req.query = {};

            await runHandler(callback, req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringContaining('expired or invalid')
                })
            );
        });

        it('handles successful callback and creates new integration', async () => {
            const nonce = 'test-nonce-123';
            req.signedCookies = {
                shopify_oauth_session: JSON.stringify({
                    orgId: 'org_123',
                    nonce
                })
            };
            req.query = { state: nonce };

            await runHandler(callback, req, res);

            expect(res.clearCookie).toHaveBeenCalledWith(
                'shopify_oauth_session'
            );
            expect(shopify.auth.callback).toHaveBeenCalled();
            expect(encryptionUtil.encrypt).toHaveBeenCalledWith(
                'shpat_mock123'
            );

            expect(prisma.integration.findFirst).toHaveBeenCalled();
            expect(prisma.integration.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        orgId: 'org_123',
                        provider: 'shopify',
                        shopDomain: 'test-store.myshopify.com',
                        accessToken: 'encrypted_mock_token'
                    })
                })
            );

            expect(AuditService.log).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'integration.connected',
                    organizationId: 'org_123'
                })
            );

            expect(res.redirect).toHaveBeenCalledWith(
                expect.stringContaining('?success=true&provider=shopify')
            );
        });

        it('updates existing integration if found', async () => {
            const nonce = 'test-nonce-123';
            req.signedCookies = {
                shopify_oauth_session: JSON.stringify({
                    orgId: 'org_123',
                    nonce
                })
            };
            req.query = { state: nonce };
            prisma.integration.findFirst = mock(async () => ({
                id: 'int_existing'
            })) as unknown as typeof prisma.integration.findFirst;

            await runHandler(callback, req, res);

            expect(prisma.integration.create).not.toHaveBeenCalled();
            expect(prisma.integration.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'int_existing' },
                    data: expect.objectContaining({
                        accessToken: 'encrypted_mock_token',
                        syncStatus: 'pending'
                    })
                })
            );
        });

        it('redirects with error if OAuth fails', async () => {
            const nonce = 'test-nonce-123';
            req.signedCookies = {
                shopify_oauth_session: JSON.stringify({
                    orgId: 'org_123',
                    nonce
                })
            };
            req.query = { state: nonce };
            shopify.auth.callback = mock(async () => {
                throw new Error('OAuth failed');
            }) as unknown as (typeof shopify.auth)['callback'];

            await runHandler(callback, req, res);

            expect(res.redirect).toHaveBeenCalledWith(
                expect.stringContaining('?error=shopify_auth_failed')
            );
        });

        it('returns 400 if state parameter does not match nonce', async () => {
            req.signedCookies = {
                shopify_oauth_session: JSON.stringify({
                    orgId: 'org_123',
                    nonce: 'correct-nonce'
                })
            };
            req.query = { state: 'wrong-nonce' };

            await runHandler(callback, req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringContaining('CSRF')
                })
            );
        });
    });
});
