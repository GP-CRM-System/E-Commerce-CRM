import request from 'supertest';
import { it, describe, expect, beforeAll, afterAll } from 'bun:test';
import crypto from 'crypto';
import app from '../../app.js';
import prisma from '../../config/prisma.config.js';
import { auth } from '../auth/auth.js';
import { fromNodeHeaders } from 'better-auth/node';
import * as webhookService from './webhook.service.js';

let authToken: string;
let testOrgId: string;
let testIntegrationId: string;
const TEST_SECRET = 'test-shopify-secret';

describe('Webhook & Idempotency API', () => {
    beforeAll(async () => {
        const testEmail = 'webhook-test@test.com';

        // Clean up
        await prisma.webhookIdempotencyKey.deleteMany({});
        await prisma.webhookLog.deleteMany({});
        await prisma.integration.deleteMany({});
        await prisma.user.deleteMany({ where: { email: testEmail } });
        await prisma.organization.deleteMany({
            where: { name: 'Webhook Test Org' }
        });

        const signup = await auth.api.signUpEmail({
            body: {
                email: testEmail,
                password: 'Password123!',
                name: 'Webhook Test User'
            }
        });
        if (!signup || !signup.token) throw new Error('Signup failed');
        authToken = signup.token;

        const org = (await auth.api.createOrganization({
            headers: fromNodeHeaders({ authorization: `Bearer ${authToken}` }),
            body: {
                name: 'Webhook Test Org',
                slug: 'webhook-test-org-' + Date.now()
            }
        })) as { organization?: { id: string }; id?: string };

        testOrgId = org.organization?.id ?? org.id ?? '';

        await auth.api.setActiveOrganization({
            headers: fromNodeHeaders({ authorization: `Bearer ${authToken}` }),
            body: { organizationId: testOrgId }
        });

        const integration = await prisma.integration.create({
            data: {
                orgId: testOrgId,
                provider: 'shopify',
                name: 'Test Store',
                shopDomain: 'test-webhook.myshopify.com',
                accessToken: 'test-token',
                apiSecret: TEST_SECRET,
                isActive: true
            }
        });
        testIntegrationId = integration.id;
    });

    afterAll(async () => {
        await prisma.webhookIdempotencyKey.deleteMany({});
        await prisma.webhookLog.deleteMany({});
        await prisma.integration.deleteMany({ where: { orgId: testOrgId } });
        await prisma.organization.deleteMany({ where: { id: testOrgId } });
    });

    describe('Webhook Service Units', () => {
        it('should generate consistent idempotency keys', () => {
            const payload = { foo: 'bar' };
            const topic = 'orders/create';
            const key1 = webhookService.generateIdempotencyKey(payload, topic);
            const key2 = webhookService.generateIdempotencyKey(payload, topic);
            expect(key1).toBe(key2);
            expect(key1).toHaveLength(64); // SHA256 hex
        });

        it('should use webhook ID as key if provided', () => {
            const key = webhookService.generateIdempotencyKey(
                {},
                'topic',
                '12345'
            );
            expect(key).toBe('wh:12345');
        });

        it('should detect duplicates atomically', async () => {
            const key = 'test-key-' + Date.now();
            const res1 = await webhookService.checkAndStoreIdempotencyAtomic(
                testIntegrationId,
                'shopify',
                key,
                'test/topic'
            );
            expect(res1.isDuplicate).toBe(false);

            const res2 = await webhookService.checkAndStoreIdempotencyAtomic(
                testIntegrationId,
                'shopify',
                key,
                'test/topic'
            );
            expect(res2.isDuplicate).toBe(true);
        });

        it('should allow reusing expired keys', async () => {
            const key = 'expired-key-' + Date.now();

            // Create an expired key manually
            await prisma.webhookIdempotencyKey.create({
                data: {
                    integrationId: testIntegrationId,
                    provider: 'shopify',
                    key,
                    topic: 'test',
                    expiresAt: new Date(Date.now() - 1000) // 1s ago
                }
            });

            const res = await webhookService.checkAndStoreIdempotencyAtomic(
                testIntegrationId,
                'shopify',
                key,
                'test'
            );
            expect(res.isDuplicate).toBe(false);
        });
    });

    describe('POST /api/webhooks/shopify/:integrationId', () => {
        const payload = { id: 12345, email: 'test@example.com' };
        const topic = 'customers/create';

        const getSignature = (body: string, secret: string) => {
            return crypto
                .createHmac('sha256', secret)
                .update(body, 'utf8')
                .digest('base64');
        };

        it('should process a valid webhook', async () => {
            const bodyStr = JSON.stringify(payload);
            const sig = getSignature(bodyStr, TEST_SECRET);

            const response = await request(app)
                .post(`/api/webhooks/shopify/${testIntegrationId}`)
                .set('x-shopify-topic', topic)
                .set('x-shopify-hmac-sha256', sig)
                .set('x-shopify-shop-domain', 'test-webhook.myshopify.com')
                .send(payload);

            expect(response.status).toBe(200);
            expect(response.body.received).toBe(true);
        });

        it('should reject invalid signature', async () => {
            const response = await request(app)
                .post(`/api/webhooks/shopify/${testIntegrationId}`)
                .set('x-shopify-topic', topic)
                .set('x-shopify-hmac-sha256', 'invalid-sig')
                .send(payload);

            expect(response.status).toBe(401);
        });

        it('should reject duplicates', async () => {
            const uniquePayload = { id: Date.now(), email: 'dup@test.com' };
            const uniqueBody = JSON.stringify(uniquePayload);
            const uniqueSig = getSignature(uniqueBody, TEST_SECRET);

            const res1 = await request(app)
                .post(`/api/webhooks/shopify/${testIntegrationId}`)
                .set('x-shopify-topic', topic)
                .set('x-shopify-hmac-sha256', uniqueSig)
                .send(uniquePayload);
            expect(res1.status).toBe(200);
            expect(res1.body.duplicate).toBeUndefined();

            const res2 = await request(app)
                .post(`/api/webhooks/shopify/${testIntegrationId}`)
                .set('x-shopify-topic', topic)
                .set('x-shopify-hmac-sha256', uniqueSig)
                .send(uniquePayload);
            expect(res2.status).toBe(200);
            expect(res2.body.duplicate).toBe(true);
        });
    });

    describe('POST /api/cron/cleanup/idempotency', () => {
        it('should cleanup expired keys', async () => {
            // Create an expired key
            await prisma.webhookIdempotencyKey.create({
                data: {
                    integrationId: testIntegrationId,
                    provider: 'shopify',
                    key: 'cleanup-test-' + Date.now(),
                    topic: 'test',
                    expiresAt: new Date(Date.now() - 1000)
                }
            });

            const response = await request(app)
                .post('/api/cron/cleanup/idempotency')
                .set('Authorization', `Bearer ${authToken}`)
                .send({});

            expect(response.status).toBe(200);
            expect(response.body.data.deletedCount).toBeGreaterThan(0);
        });

        it('should reject unauthenticated cron request', async () => {
            const response = await request(app).post(
                '/api/cron/cleanup/idempotency'
            );
            expect(response.status).toBe(401);
        });
    });
});
