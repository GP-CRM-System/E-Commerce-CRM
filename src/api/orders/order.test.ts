import request from 'supertest';
import { it, describe, expect, beforeAll, afterAll } from 'bun:test';
import app from '../../app.js';
import prisma from '../../config/prisma.config.js';
import { auth } from '../auth/auth.js';
import { fromNodeHeaders } from 'better-auth/node';

let authToken: string;
let testOrgId: string;
let testCustomerId: string;
let testProductId: string;
let testOrderId: string;

describe('Orders API', () => {
    beforeAll(async () => {
        await prisma.order.deleteMany({
            where: { organization: { slug: { startsWith: 'order-test-org' } } }
        });
        await prisma.customer.deleteMany({
            where: { organization: { slug: { startsWith: 'order-test-org' } } }
        });
        await prisma.member.deleteMany({
            where: { user: { email: 'order-test@test.com' } }
        });
        await prisma.session.deleteMany({
            where: { user: { email: 'order-test@test.com' } }
        });
        await prisma.account.deleteMany({
            where: { user: { email: 'order-test@test.com' } }
        });
        await prisma.organization.deleteMany({
            where: { slug: { startsWith: 'order-test-org' } }
        });
        await prisma.user.deleteMany({
            where: { email: 'order-test@test.com' }
        });

        const signup = await auth.api.signUpEmail({
            body: {
                email: 'order-test@test.com',
                password: 'Password123!',
                name: 'Order Test User'
            }
        });

        if (!signup) throw new Error('Signup failed');
        authToken = signup.token!;

        const testUserId = signup.user.id;
        await prisma.user.update({
            where: { id: testUserId },
            data: { emailVerified: true }
        });

        const org = await auth.api.createOrganization({
            headers: fromNodeHeaders({ authorization: `Bearer ${authToken}` }),
            body: {
                name: 'Order Test Org',
                slug: 'order-test-org-' + Date.now()
            }
        });

        const orgResponse = org as {
            organization?: { id: string };
            id?: string;
        };
        testOrgId = orgResponse.organization?.id ?? orgResponse.id ?? '';

        await auth.api.setActiveOrganization({
            headers: fromNodeHeaders({ authorization: `Bearer ${authToken}` }),
            body: { organizationId: testOrgId }
        });

        const signin = await auth.api.signInEmail({
            body: { email: 'order-test@test.com', password: 'Password123!' }
        });
        authToken = signin.token!;

        const customer = await prisma.customer.create({
            data: {
                name: 'Order Test Customer',
                email: 'order-customer@test.com',
                organizationId: testOrgId,
                createdAt: new Date(),
                updatedAt: new Date()
            }
        });
        testCustomerId = customer.id;

        const product = await prisma.product.create({
            data: {
                name: 'Order Test Product',
                price: 29.99,
                organizationId: testOrgId,
                createdAt: new Date(),
                updatedAt: new Date()
            }
        });
        testProductId = product.id;
    });

    afterAll(async () => {
        await prisma.orderItem.deleteMany({
            where: { order: { organizationId: testOrgId } }
        });
        await prisma.order.deleteMany({
            where: { organizationId: testOrgId }
        });
        await prisma.product.deleteMany({
            where: { organizationId: testOrgId }
        });
        await prisma.customer.deleteMany({
            where: { organizationId: testOrgId }
        });
    });

    it('should create a new order', async () => {
        const orderData = {
            customerId: testCustomerId,
            externalId: 'ORD-001',
            totalAmount: 99.99,
            subtotal: 89.99,
            taxAmount: 10,
            fulfillmentStatus: 'unfulfilled',
            paymentStatus: 'PENDING',
            items: [
                {
                    productId: testProductId,
                    quantity: 2,
                    price: 44.99
                }
            ]
        };

        const response = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${authToken}`)
            .send(orderData);

        expect(response.status).toBe(201);
        expect(response.body.data).toHaveProperty('id');
        expect(response.body.data.externalId).toBe(orderData.externalId);

        testOrderId = response.body.data.id;
    });

    it('should list all orders', async () => {
        const response = await request(app)
            .get('/api/orders')
            .set('Authorization', `Bearer ${authToken}`)
            .query({ page: '1', limit: '10' });

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.data)).toBe(true);
        expect(response.body.pagination).toBeDefined();
    });

    it('should filter orders by status', async () => {
        const response = await request(app)
            .get('/api/orders')
            .set('Authorization', `Bearer ${authToken}`)
            .query({ status: 'unfulfilled' });

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter orders by paymentStatus', async () => {
        const response = await request(app)
            .get('/api/orders')
            .set('Authorization', `Bearer ${authToken}`)
            .query({ paymentStatus: 'PENDING' });

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter orders by shippingStatus', async () => {
        const response = await request(app)
            .get('/api/orders')
            .set('Authorization', `Bearer ${authToken}`)
            .query({ shippingStatus: 'PENDING' });

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter orders by customerId', async () => {
        const response = await request(app)
            .get('/api/orders')
            .set('Authorization', `Bearer ${authToken}`)
            .query({ customerId: testCustomerId });

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should sort orders by createdAt asc', async () => {
        const response = await request(app)
            .get('/api/orders')
            .set('Authorization', `Bearer ${authToken}`)
            .query({ sortBy: 'createdAt', sortOrder: 'asc' });

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should sort orders by totalAmount desc', async () => {
        const response = await request(app)
            .get('/api/orders')
            .set('Authorization', `Bearer ${authToken}`)
            .query({ sortBy: 'totalAmount', sortOrder: 'desc' });

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should fetch order details', async () => {
        const response = await request(app)
            .get(`/api/orders/${testOrderId}`)
            .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data.id).toBe(testOrderId);
    });

    it('should update an order', async () => {
        const updateData = {
            fulfillmentStatus: 'fulfilled',
            paymentStatus: 'PAID'
        };

        const response = await request(app)
            .put(`/api/orders/${testOrderId}`)
            .set('Authorization', `Bearer ${authToken}`)
            .send(updateData);

        expect(response.status).toBe(200);
        expect(response.body.data.fulfillmentStatus).toBe(
            updateData.fulfillmentStatus
        );
    });

    it('should delete an order', async () => {
        const response = await request(app)
            .delete(`/api/orders/${testOrderId}`)
            .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
    });

    it('should reject unauthenticated requests', async () => {
        const response = await request(app).get('/api/orders');
        expect(response.status).toBe(401);
    });
});
