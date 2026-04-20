import request from 'supertest';
import { it, describe, expect, beforeAll, afterAll } from 'bun:test';
import app from '../../app.js';
import prisma from '../../config/prisma.config.js';
import {
    createTestUser,
    cleanupTestUser,
    type TestAuth
} from '../../test/helpers/auth.js';

let authA: TestAuth;

describe('Reports API', () => {
    beforeAll(async () => {
        authA = await createTestUser(
            `reports-a-${Date.now()}@test.com`,
            'Reports Org A',
            `reports-org-a-${Date.now()}`
        );
    });

    afterAll(async () => {
        if (authA) await cleanupTestUser(authA.email, authA.orgId);
    });

    describe('GET /api/reports/dashboard', () => {
        it('should return empty stats for new org', async () => {
            const res = await request(app)
                .get('/api/reports/dashboard')
                .set('Authorization', `Bearer ${authA.token}`);

            expect(res.status).toBe(200);
            expect(res.body.data.revenue.currentRevenue).toBe(0);
            expect(res.body.data.revenue.lastRevenue).toBe(0);
            expect(res.body.data.revenue.revenueGrowth).toBe(100);
            expect(res.body.data.acquisition.length).toBe(6);
        });

        it('should calculate revenue correctly with paid orders', async () => {
            const customer = await prisma.customer.create({
                data: {
                    name: 'Report Customer',
                    email: 'report-customer@test.com',
                    organizationId: authA.orgId
                }
            });

            const now = new Date();
            const lastMonth = new Date(
                now.getFullYear(),
                now.getMonth() - 1,
                15
            );

            await prisma.order.createMany({
                data: [
                    {
                        organizationId: authA.orgId,
                        customerId: customer.id,
                        externalId: 'ORD-001',
                        totalAmount: 100,
                        paymentStatus: 'PAID',
                        createdAt: now
                    },
                    {
                        organizationId: authA.orgId,
                        customerId: customer.id,
                        externalId: 'ORD-002',
                        totalAmount: 200,
                        paymentStatus: 'PAID',
                        createdAt: lastMonth
                    }
                ]
            });

            const res = await request(app)
                .get('/api/reports/dashboard')
                .set('Authorization', `Bearer ${authA.token}`);

            expect(res.status).toBe(200);
            expect(res.body.data.revenue.currentRevenue).toBe(100);
            expect(res.body.data.revenue.lastRevenue).toBe(200);
        });

        it('should track customer acquisition by month', async () => {
            const now = new Date();

            await prisma.customer.createMany({
                data: [
                    {
                        name: 'Acq Customer 1',
                        email: 'acq1@test.com',
                        organizationId: authA.orgId,
                        createdAt: now
                    },
                    {
                        name: 'Acq Customer 2',
                        email: 'acq2@test.com',
                        organizationId: authA.orgId,
                        createdAt: new Date(
                            now.getFullYear(),
                            now.getMonth() - 3,
                            1
                        )
                    }
                ]
            });

            const res = await request(app)
                .get('/api/reports/dashboard')
                .set('Authorization', `Bearer ${authA.token}`);

            expect(res.status).toBe(200);
            expect(res.body.data.acquisition.length).toBeGreaterThan(0);
        });

        it('should reject unauthorized requests', async () => {
            const res = await request(app).get('/api/reports/dashboard');

            expect(res.status).toBe(401);
        });
    });
});
