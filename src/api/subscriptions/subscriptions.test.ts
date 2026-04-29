import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import app from '../../app.js';
import prisma from '../../config/prisma.config.js';
import {
    createTestUser,
    cleanupTestUser,
    type TestAuth
} from '../../test/helpers/auth.js';

let auth: TestAuth;

describe('Subscriptions API', () => {
    beforeAll(async () => {
        auth = await createTestUser(
            `sub-${Date.now()}@test.com`,
            'Test Org',
            `test-org-${Date.now()}`
        );
    });

    afterAll(async () => {
        await cleanupTestUser(auth.userId, auth.orgId);
        await prisma.subscription.deleteMany();
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
            const basicPlan = await prisma.plan.findFirst({
                where: { name: 'basic' }
            });

            const response = await request(app)
                .post('/api/subscriptions/initialize')
                .set('Authorization', `Bearer ${auth.token}`)
                .send({ planId: basicPlan?.id });

            expect(response.status).toBe(402);
            expect(response.body.data?.fawry).toBeDefined();
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
            const response = await request(app)
                .patch('/api/subscriptions/cancel')
                .set('Authorization', `Bearer ${auth.token}`)
                .send({ immediately: false });

            expect(response.status).toBe(200);
        });
    });
});
