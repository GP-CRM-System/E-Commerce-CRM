import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test';

mock.module('../../utils/paymob.util.js', () => ({
    createIntention: mock(async () => ({
        client_secret: 'mock_client_secret',
        id: 'mock_intention_id'
    })),
    verifyCallbackSignature: mock(() => true)
}));

import app from '../../app.js';
import prisma from '../../config/prisma.config.js';
import {
    createTestUser,
    cleanupTestUser,
    type TestAuth
} from '../../test/helpers/auth.js';
import { Prisma } from '../../generated/prisma/client.js';

let auth: TestAuth;

const testPlans = [
    {
        name: 'free',
        displayName: 'Free',
        price: new Prisma.Decimal(0),
        billingCycle: 'monthly',
        features: { customers: 100, products: 50 },
        isActive: true,
        sortOrder: 1
    },
    {
        name: 'growth',
        displayName: 'Growth',
        price: new Prisma.Decimal(450),
        billingCycle: 'monthly',
        features: { customers: 1000, products: 500 },
        isActive: true,
        sortOrder: 2
    }
];

describe('Subscriptions API', () => {
    beforeAll(async () => {
        auth = await createTestUser(
            `sub-${Date.now()}@test.com`,
            'Test Org',
            `test-org-${Date.now()}`
        );

        // Create test plans (name is not unique, so use findFirst + create/update)
        for (const plan of testPlans) {
            const existing = await prisma.plan.findFirst({
                where: { name: plan.name }
            });
            if (existing) {
                await prisma.plan.update({
                    where: { id: existing.id },
                    data: plan
                });
            } else {
                await prisma.plan.create({ data: plan });
            }
        }
    });

    afterAll(async () => {
        // First delete subscriptions using these plans across ALL organizations,
        // since test plans might be shared or persisted from failed runs.
        await prisma.subscription.deleteMany({
            where: {
                plan: {
                    name: { in: testPlans.map((p) => p.name) }
                }
            }
        });
        await prisma.plan.deleteMany({
            where: { name: { in: testPlans.map((p) => p.name) } }
        });
        await cleanupTestUser(auth.userId, auth.orgId);
    });

    describe('GET /api/subscriptions/plans', () => {
        it('should list subscription plans', async () => {
            const response = await request(app).get('/api/subscriptions/plans');

            expect(response.status).toBe(200);
            expect(response.body.message).toBeDefined();
            expect(Array.isArray(response.body.data)).toBe(true);
        });
    });

    describe('GET /api/subscriptions/current', () => {
        it('should return null when no subscription exists', async () => {
            const response = await request(app)
                .get('/api/subscriptions/current')
                .set('Authorization', `Bearer ${auth.token}`);

            expect(response.status).toBe(200);
            expect(response.body.data).toBeNull();
        });
    });

    describe('POST /api/subscriptions', () => {
        it('should subscribe to free plan without payment', async () => {
            const freePlan = await prisma.plan.findFirst({
                where: { name: 'free' }
            });

            const response = await request(app)
                .post('/api/subscriptions')
                .set('Authorization', `Bearer ${auth.token}`)
                .send({ planId: freePlan?.id });

            expect(response.status).toBe(200);
            expect(response.body.message).toBeDefined();
        });

        it('should return 404 for invalid planId', async () => {
            const response = await request(app)
                .post('/api/subscriptions')
                .set('Authorization', `Bearer ${auth.token}`)
                .send({ planId: 'invalid-plan-id' });

            expect(response.status).toBe(404);
        });
    });

    describe('POST /api/subscriptions/initialize', () => {
        it('should return payment required for paid plans', async () => {
            const growthPlan = await prisma.plan.findFirst({
                where: { name: 'growth' }
            });

            const response = await request(app)
                .post('/api/subscriptions/initialize')
                .set('Authorization', `Bearer ${auth.token}`)
                .send({ planId: growthPlan?.id });

            expect(response.status).toBe(402);
            expect(response.body.data?.paymob).toBeDefined();
        });

        it('should activate free plan immediately', async () => {
            const freePlan = await prisma.plan.findFirst({
                where: { name: 'free' }
            });

            const response = await request(app)
                .post('/api/subscriptions/initialize')
                .set('Authorization', `Bearer ${auth.token}`)
                .send({ planId: freePlan?.id });

            expect(response.status).toBe(200);
            expect(response.body.data?.paymentRequired).toBe(false);
        });
    });

    describe('PATCH /api/subscriptions/cancel', () => {
        it('should cancel active subscription', async () => {
            // First, subscribe to a plan
            const freePlan = await prisma.plan.findFirst({
                where: { name: 'free' }
            });

            await request(app)
                .post('/api/subscriptions')
                .set('Authorization', `Bearer ${auth.token}`)
                .send({ planId: freePlan?.id });

            // Now cancel the subscription
            const response = await request(app)
                .patch('/api/subscriptions/cancel')
                .set('Authorization', `Bearer ${auth.token}`)
                .send({ immediately: false });

            expect(response.status).toBe(200);
        });
    });
});
