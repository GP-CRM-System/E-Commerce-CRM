import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import request from 'supertest';
import app from '../../app.js';
import prisma from '../../config/prisma.config.js';
import { addDays, subDays } from 'date-fns';

describe('Analytics API', () => {
    let orgId: string;
    let userId: string;
    let sessionToken: string;

    beforeAll(async () => {
        // Setup Test Org and User
        const org = await prisma.organization.create({
            data: {
                name: 'Test Org',
                slug: `test-org-${Date.now()}`
            }
        });
        orgId = org.id;

        const user = await prisma.user.create({
            data: {
                name: 'Analyst',
                email: `analyst-${Date.now()}@example.com`
            }
        });
        userId = user.id;

        await prisma.member.create({
            data: {
                organizationId: orgId,
                userId: userId,
                role: 'admin',
                createdAt: new Date()
            }
        });

        const session = await prisma.session.create({
            data: {
                userId: userId,
                token: `test-token-${Date.now()}`,
                expiresAt: addDays(new Date(), 1),
                activeOrganizationId: orgId
            }
        });
        sessionToken = session.token;

        // Seed Data
        const lastWeek = subDays(new Date(), 10);

        // 1. Customers (2 current, 1 old)
        await prisma.customer.createMany({
            data: [
                {
                    name: 'Old',
                    organizationId: orgId,
                    createdAt: lastWeek,
                    lifecycleStage: 'PROSPECT'
                },
                {
                    name: 'New 1',
                    organizationId: orgId,
                    lifecycleStage: 'LOYAL'
                },
                {
                    name: 'New 2',
                    organizationId: orgId,
                    lifecycleStage: 'LOYAL'
                }
            ]
        });

        // 2. Products (1 current)
        const product = await prisma.product.create({
            data: { name: 'Product X', price: 100, organizationId: orgId }
        });

        // 3. Orders (1 current)
        const customer = await prisma.customer.findFirst({
            where: { organizationId: orgId }
        });
        await prisma.order.create({
            data: {
                organizationId: orgId,
                customerId: customer!.id,
                shippingStatus: 'SHIPPED',
                orderItems: {
                    create: { productId: product.id, quantity: 5, price: 100 }
                }
            }
        });

        // 4. Tickets
        await prisma.supportTicket.createMany({
            data: [
                {
                    subject: 'Help',
                    description: '...',
                    status: 'OPEN',
                    organizationId: orgId,
                    customerId: customer!.id
                },
                {
                    subject: 'Fixed',
                    description: '...',
                    status: 'CLOSED',
                    organizationId: orgId,
                    customerId: customer!.id
                }
            ]
        });

        // 5. Audit Log
        await prisma.auditLog.create({
            data: {
                organizationId: orgId,
                userId: userId,
                action: 'TEST',
                targetId: '1',
                targetType: 'TEST'
            }
        });
    });

    afterAll(async () => {
        // Cleanup handled by schema cascading if needed, or manual here
    });

    it('should return 401 if not authenticated', async () => {
        const res = await request(app).get('/api/analytics');
        expect(res.status).toBe(401);
    });

    it('should return analytics data for the active organization', async () => {
        const res = await request(app)
            .get('/api/analytics')
            .set('Authorization', `Bearer ${sessionToken}`);

        expect(res.status).toBe(200);
        const data = res.body.data;

        // 1. Totals & Changes
        expect(data.summary.customers.total).toBe(3);
        expect(data.summary.customers.change).toBeGreaterThan(0);

        // 2. Performance
        expect(data.campaignPerformance).toBeArray();
        expect(data.campaignPerformance).toHaveLength(7);

        // 3. Tickets
        expect(data.ticketsByStatus).toMatchObject({ OPEN: 1, CLOSED: 1 });

        // 4. Lifecycle
        expect(data.customersByLifecycle).toMatchObject({
            PROSPECT: 1,
            LOYAL: 2
        });

        // 5. Shipping
        expect(data.ordersByShipping).toMatchObject({ SHIPPED: 1 });

        // 6. Top Products
        expect(data.topProducts[0]).toMatchObject({
            name: 'Product X',
            sales: 5
        });

        // 7. Support Overview
        expect(data.supportOverview.totalResolved).toBe(1);
        expect(data.supportOverview.topEmployee.name).toBe('Analyst');
    });
});
