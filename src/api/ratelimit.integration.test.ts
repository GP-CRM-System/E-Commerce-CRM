import { it, describe, expect, beforeAll, afterAll } from 'bun:test';
import prisma from '../config/prisma.config.js';
import { auth } from './auth/auth.js';
import { fromNodeHeaders } from 'better-auth/node';
import { ErrorCode, HttpStatus } from '../utils/response.util.js';

interface MockRequest {
    method: string;
    path: string;
}

interface MockResponse {
    status: (code: number) => MockResponse;
    json: (data: unknown) => MockResponse;
}

let authToken: string;
let testOrgId: string;
let testUserId: string;

describe('Rate Limiting Integration Tests', () => {
    beforeAll(async () => {
        await prisma.customer.deleteMany({
            where: { organization: { slug: { startsWith: 'rl-test-org' } } }
        });
        await prisma.member.deleteMany({
            where: { user: { email: 'rl-test@test.com' } }
        });
        await prisma.session.deleteMany({
            where: { user: { email: 'rl-test@test.com' } }
        });
        await prisma.account.deleteMany({
            where: { user: { email: 'rl-test@test.com' } }
        });
        await prisma.organization.deleteMany({
            where: { slug: { startsWith: 'rl-test-org' } }
        });
        await prisma.user.deleteMany({ where: { email: 'rl-test@test.com' } });

        const signup = await auth.api.signUpEmail({
            body: {
                email: 'rl-test@test.com',
                password: 'Password123!',
                name: 'RL Test User'
            }
        });

        if (!signup) throw new Error('Signup failed');
        authToken = signup.token!;
        testUserId = signup.user.id;

        await prisma.user.update({
            where: { id: testUserId },
            data: { emailVerified: true }
        });

        const org = await auth.api.createOrganization({
            headers: fromNodeHeaders({ authorization: `Bearer ${authToken}` }),
            body: {
                name: 'RL Test Org',
                slug: 'rl-test-org-' + Date.now()
            }
        });

        const orgResponse = org as { organization?: { id: string }; id?: string };
        testOrgId = orgResponse.organization?.id ?? orgResponse.id ?? '';

        await auth.api.setActiveOrganization({
            headers: fromNodeHeaders({ authorization: `Bearer ${authToken}` }),
            body: { organizationId: testOrgId }
        });

        const signin = await auth.api.signInEmail({
            body: { email: 'rl-test@test.com', password: 'Password123!' }
        });

        if (!signin || !signin.token) throw new Error('Signin failed');
        authToken = signin.token;
    });

    afterAll(async () => {
        if (!testOrgId) return;
        await prisma.conversation.deleteMany({ where: { organizationId: testOrgId } });
        await prisma.ticketNote.deleteMany({ where: { ticket: { organizationId: testOrgId } } });
        await prisma.supportTicket.deleteMany({ where: { organizationId: testOrgId } });
        await prisma.transaction.deleteMany({ where: { organizationId: testOrgId } });
        await prisma.notification.deleteMany({ where: { organizationId: testOrgId } });
        await prisma.customerEvent.deleteMany({ where: { customer: { organizationId: testOrgId } } });
        await prisma.note.deleteMany({ where: { customer: { organizationId: testOrgId } } });
        await prisma.orderItem.deleteMany({ where: { order: { organizationId: testOrgId } } });
        await prisma.order.deleteMany({ where: { organizationId: testOrgId } });
        await prisma.customer.deleteMany({ where: { organizationId: testOrgId } });
        await prisma.productVariant.deleteMany({ where: { product: { organizationId: testOrgId } } });
        await prisma.product.deleteMany({ where: { organizationId: testOrgId } });
        await prisma.segment.deleteMany({ where: { organizationId: testOrgId } });
        await prisma.importJobError.deleteMany({ where: { importJob: { organizationId: testOrgId } } });
        await prisma.importJob.deleteMany({ where: { organizationId: testOrgId } });
        await prisma.exportJob.deleteMany({ where: { organizationId: testOrgId } });
        await prisma.syncLog.deleteMany({ where: { integration: { orgId: testOrgId } } });
        await prisma.integration.deleteMany({ where: { orgId: testOrgId } });
        await prisma.webhookLog.deleteMany({ where: { integration: { orgId: testOrgId } } });
        await prisma.campaignRecipient.deleteMany({ where: { campaign: { organizationId: testOrgId } } });
        await prisma.campaign.deleteMany({ where: { organizationId: testOrgId } });
        await prisma.emailTemplate.deleteMany({ where: { organizationId: testOrgId } });
        await prisma.member.deleteMany({ where: { organizationId: testOrgId } });
        await prisma.organizationRole.deleteMany({ where: { organizationId: testOrgId } });
        await prisma.session.deleteMany({ where: { user: { email: 'rl-test@test.com' } } });
        await prisma.account.deleteMany({ where: { user: { email: 'rl-test@test.com' } } });
        await prisma.organization.deleteMany({ where: { id: testOrgId } });
        await prisma.user.deleteMany({ where: { email: 'rl-test@test.com' } });
    });

    describe('Rate Limit Handler Response Format', () => {
        it('should return correct status code for rate limit', async () => {
            const capturedReq: MockRequest = { method: 'POST', path: '/api/customers' };
            let capturedStatus: number | undefined;

            const { rateLimitHandler } = await import('../config/ratelimit.config.js');
            const handlerFn = rateLimitHandler as (req: MockRequest, res: MockResponse) => unknown;

            const mockRes: MockResponse = {
                status: function(code: number) {
                    capturedStatus = code;
                    return this;
                },
                json: function() { return this; }
            };

            handlerFn(capturedReq, mockRes);
            expect(capturedStatus).toBe(HttpStatus.TOO_MANY_REQUESTS);
        });

        it('should include method and path in rate limit error response', async () => {
            const capturedReq: MockRequest = { method: 'GET', path: '/api/test-endpoint' };
            let capturedBody: unknown;

            const { rateLimitHandler } = await import('../config/ratelimit.config.js');
            const handlerFn = rateLimitHandler as (req: MockRequest, res: MockResponse) => unknown;

            const mockRes: MockResponse = {
                status: function() { return this; },
                json: function(data: unknown) {
                    capturedBody = data;
                    return this;
                }
            };

            handlerFn(capturedReq, mockRes);
            const body = capturedBody as { path?: string };
            expect(body.path).toContain('GET /api/test-endpoint');
        });
    });

    describe('Rate Limit Configuration', () => {
        it('should have correct default limits configured', async () => {
            const { createRateLimiter, createAuthRateLimiter } = await import('../config/ratelimit.config.js');

            const apiLimiter = await createRateLimiter();
            const authLimiter = await createAuthRateLimiter();

            expect(apiLimiter).toBeDefined();
            expect(authLimiter).toBeDefined();

            expect(apiLimiter).toBeTypeOf('function');
            expect(authLimiter).toBeTypeOf('function');
        });
    });

    describe('Error Contract Validation', () => {
        it('should return valid error contract for 429 responses', async () => {
            const capturedReq: MockRequest = { method: 'GET', path: '/api/test' };
            let capturedStatus: number | undefined;
            let capturedBody: unknown;

            const { rateLimitHandler } = await import('../config/ratelimit.config.js');
            const handlerFn = rateLimitHandler as (req: MockRequest, res: MockResponse) => unknown;

            const mockRes: MockResponse = {
                status: function(code: number) {
                    capturedStatus = code;
                    return this;
                },
                json: function(data: unknown) {
                    capturedBody = data;
                    return this;
                }
            };

            handlerFn(capturedReq, mockRes);

            expect(capturedStatus).toBe(HttpStatus.TOO_MANY_REQUESTS);
            const body = capturedBody as { message?: string; code?: string; status?: number; timestamp?: Date };
            expect(body).toHaveProperty('message');
            expect(body).toHaveProperty('code');
            expect(body).toHaveProperty('status');
            expect(body).toHaveProperty('timestamp');
            expect(body.status).toBe(429);
            expect(body.code).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);
        });
    });
});