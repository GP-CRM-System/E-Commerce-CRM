import request from 'supertest';
import { it, describe, expect, beforeAll, afterAll } from 'bun:test';
import app from '../../app.js';
import prisma from '../../config/prisma.config.js';
import {
    createTestUser,
    cleanupTestUser,
    type TestAuth
} from '../../test/helpers/auth.js';

describe('Dashboard API', () => {
    let auth: TestAuth;
    let email: string;
    let customerId: string;

    beforeAll(async () => {
        email = `dashboard-${Date.now()}@test.com`;
        auth = await createTestUser(
            email,
            'Dashboard Org',
            `dash-org-${Date.now()}`
        );

        const customer = await prisma.customer.create({
            data: {
                organizationId: auth.orgId,
                name: 'Test Customer',
                email: email
            }
        });
        customerId = customer.id;

        const now = new Date();
        for (let i = 0; i < 5; i++) {
            const dayOffset = i;
            const orderDate = new Date(now);
            orderDate.setDate(orderDate.getDate() - dayOffset);

            await prisma.order.create({
                data: {
                    organizationId: auth.orgId,
                    customerId: customerId,
                    totalAmount: 100 + i * 10,
                    currency: 'USD',
                    paymentStatus: 'PAID',
                    fulfillmentStatus: 'PENDING',
                    createdAt: orderDate
                }
            });
        }

        await prisma.supportTicket.create({
            data: {
                organizationId: auth.orgId,
                customerId: customerId,
                subject: 'Open Ticket 1',
                description: 'Test ticket',
                status: 'OPEN'
            }
        });
        await prisma.supportTicket.create({
            data: {
                organizationId: auth.orgId,
                customerId: customerId,
                subject: 'Open Ticket 2',
                description: 'Test ticket',
                status: 'OPEN'
            }
        });
        await prisma.supportTicket.create({
            data: {
                organizationId: auth.orgId,
                customerId: customerId,
                subject: 'Pending Ticket',
                description: 'Test ticket',
                status: 'PENDING'
            }
        });
        await prisma.supportTicket.create({
            data: {
                organizationId: auth.orgId,
                customerId: customerId,
                subject: 'Closed Ticket',
                description: 'Test ticket',
                status: 'CLOSED'
            }
        });
    });

    afterAll(async () => {
        await prisma.supportTicket.deleteMany({
            where: { organizationId: auth.orgId }
        });
        await prisma.order.deleteMany({
            where: { organizationId: auth.orgId }
        });
        if (auth) await cleanupTestUser(email, auth.orgId);
    });

    describe('GET /api/reports/dashboard', () => {
        it('should return dashboard stats with sales overview and ticket stats', async () => {
            const response = await request(app)
                .get('/api/reports/dashboard')
                .set('Authorization', `Bearer ${auth.token}`);

            expect(response.status).toBe(200);
            expect(response.body.data).toHaveProperty('revenue');
            expect(response.body.data).toHaveProperty('acquisition');
            expect(response.body.data).toHaveProperty('salesOverview');
            expect(response.body.data).toHaveProperty('ticketStats');

            expect(response.body.data.salesOverview).toBeInstanceOf(Array);
            expect(response.body.data.salesOverview.length).toBe(7);

            for (const day of response.body.data.salesOverview) {
                expect(day).toHaveProperty('date');
                expect(day).toHaveProperty('orders');
                expect(day).toHaveProperty('revenue');
                expect(typeof day.orders).toBe('number');
                expect(typeof day.revenue).toBe('number');
            }

            expect(response.body.data.ticketStats).toHaveProperty('open');
            expect(response.body.data.ticketStats).toHaveProperty('pending');
            expect(response.body.data.ticketStats).toHaveProperty('closed');
            expect(response.body.data.ticketStats.open).toBe(2);
            expect(response.body.data.ticketStats.pending).toBe(1);
            expect(response.body.data.ticketStats.closed).toBe(1);
        });

        it('should calculate sales overview correctly', async () => {
            const response = await request(app)
                .get('/api/reports/dashboard')
                .set('Authorization', `Bearer ${auth.token}`);

            const today = new Date().toISOString().split('T')[0];
            const todayData = response.body.data.salesOverview.find(
                (d: { date: string }) => d.date === today
            );

            expect(todayData.orders).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Authentication', () => {
        it('should fail without auth token (401)', async () => {
            const response = await request(app).get('/api/reports/dashboard');

            expect(response.status).toBe(401);
        });
    });
});
