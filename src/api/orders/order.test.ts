import request from 'supertest';
import { it, describe, expect, beforeAll, afterAll } from 'bun:test';
import app from '../../app.js';
import prisma from '../../config/prisma.config.js';
import {
    createTestUser,
    cleanupTestUser,
    type TestAuth
} from '../../test/helpers/auth.js';
import { processSingleCustomerRFM } from '../../queues/rfm.queue.js';

describe('Orders API', () => {
    let authA: TestAuth;
    let authB: TestAuth;
    let customerA: string;
    let productA: string;
    let testOrderId: string;

    let emailA: string;
    let emailB: string;

    beforeAll(async () => {
        emailA = `order-a-${Date.now()}@test.com`;
        emailB = `order-b-${Date.now()}@test.com`;
        authA = await createTestUser(
            emailA,
            'Order Org A',
            `order-org-a-${Date.now()}`
        );
        authB = await createTestUser(
            emailB,
            'Order Org B',
            `order-org-b-${Date.now()}`
        );

        const customer = await prisma.customer.create({
            data: {
                name: 'Order Test Customer A',
                email: 'order-customer-a@test.com',
                organizationId: authA.orgId,
                createdAt: new Date(),
                updatedAt: new Date()
            }
        });
        customerA = customer.id;

        const product = await prisma.product.create({
            data: {
                name: 'Order Test Product A',
                price: 29.99,
                organizationId: authA.orgId,
                createdAt: new Date(),
                updatedAt: new Date()
            }
        });
        productA = product.id;
    });

    afterAll(async () => {
        if (authA) await cleanupTestUser(emailA, authA.orgId);
        if (authB) await cleanupTestUser(emailB, authB.orgId);
    });

    describe('POST /api/orders', () => {
        it('should create a new order with full validation', async () => {
            const orderData = {
                customerId: customerA,
                externalId: 'ORD-001',
                totalAmount: 99.99,
                subtotal: 89.99,
                taxAmount: 10,
                fulfillmentStatus: 'unfulfilled',
                paymentStatus: 'PENDING',
                items: [
                    {
                        productId: productA,
                        quantity: 2,
                        price: 44.99
                    }
                ]
            };

            const response = await request(app)
                .post('/api/orders')
                .set('Authorization', `Bearer ${authA.token}`)
                .send(orderData);

            expect(response.status).toBe(201);
            expect(response.body.data).toHaveProperty('id');
            expect(response.body.data.externalId).toBe(orderData.externalId);
            expect(Number(response.body.data.totalAmount)).toBe(99.99);
            expect(response.body.data.fulfillmentStatus).toBe('unfulfilled');
            expect(response.body.data.paymentStatus).toBe('PENDING');
            expect(response.body.data.organizationId).toBe(authA.orgId);

            testOrderId = response.body.data.id;

            await processSingleCustomerRFM(customerA, authA.orgId);

            const customer = await prisma.customer.findUnique({
                where: { id: customerA },
                select: {
                    totalOrders: true,
                    totalSpent: true,
                    firstOrderAt: true,
                    lastOrderAt: true
                }
            });

            expect(customer?.totalOrders).toBe(1);
            expect(Number(customer?.totalSpent ?? 0)).toBe(
                orderData.totalAmount
            );
            expect(customer?.firstOrderAt).not.toBeNull();
            expect(customer?.lastOrderAt).not.toBeNull();
        });

        it('should fail if customerId is missing (400)', async () => {
            const response = await request(app)
                .post('/api/orders')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    externalId: 'ORD-NO-CUST',
                    totalAmount: 50,
                    fulfillmentStatus: 'unfulfilled',
                    paymentStatus: 'PENDING'
                });

            expect(response.status).toBe(400);
        });

        it('should fail if totalAmount is negative (400)', async () => {
            const response = await request(app)
                .post('/api/orders')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    customerId: customerA,
                    externalId: 'ORD-NEG',
                    totalAmount: -50,
                    fulfillmentStatus: 'unfulfilled',
                    paymentStatus: 'PENDING'
                });

            expect(response.status).toBe(400);
        });

        it('should fail if fulfillmentStatus is invalid (400)', async () => {
            const response = await request(app)
                .post('/api/orders')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    customerId: customerA,
                    externalId: 'ORD-BAD-STATUS',
                    totalAmount: 50,
                    fulfillmentStatus: 'INVALID_STATUS',
                    paymentStatus: 'PENDING'
                });

            expect(response.status).toBe(400);
        });

        it('should fail if paymentStatus is invalid (400)', async () => {
            const response = await request(app)
                .post('/api/orders')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    customerId: customerA,
                    externalId: 'ORD-BAD-PAY',
                    totalAmount: 50,
                    fulfillmentStatus: 'unfulfilled',
                    paymentStatus: 'INVALID'
                });

            expect(response.status).toBe(400);
        });

        it('should reject unauthenticated requests', async () => {
            const response = await request(app)
                .post('/api/orders')
                .send({ customerId: customerA });

            expect(response.status).toBe(401);
        });
    });

    describe('Cross-Tenant Isolation', () => {
        it('should NOT allow Org B to see Org A order', async () => {
            expect(testOrderId).toBeDefined();

            const response = await request(app)
                .get(`/api/orders/${testOrderId}`)
                .set('Authorization', `Bearer ${authB.token}`);

            expect(response.status).toBe(404);
        });

        it('should NOT allow Org B to update Org A order', async () => {
            const response = await request(app)
                .put(`/api/orders/${testOrderId}`)
                .set('Authorization', `Bearer ${authB.token}`)
                .send({ fulfillmentStatus: 'fulfilled' });

            expect(response.status).toBe(404);
        });

        it('should NOT allow Org B to delete Org A order', async () => {
            const response = await request(app)
                .delete(`/api/orders/${testOrderId}`)
                .set('Authorization', `Bearer ${authB.token}`);

            expect(response.status).toBe(404);
        });

        it('should NOT list Org A orders in Org B', async () => {
            const response = await request(app)
                .get('/api/orders')
                .set('Authorization', `Bearer ${authB.token}`);

            expect(response.status).toBe(200);
            expect(response.body.data).toEqual([]);
        });
    });

    describe('GET /api/orders', () => {
        it('should list all orders', async () => {
            const response = await request(app)
                .get('/api/orders')
                .set('Authorization', `Bearer ${authA.token}`)
                .query({ page: '1', limit: '10' });

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.pagination).toBeDefined();
        });

        it('should filter orders by status', async () => {
            const response = await request(app)
                .get('/api/orders')
                .set('Authorization', `Bearer ${authA.token}`)
                .query({ fulfillmentStatus: 'unfulfilled' });

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.data)).toBe(true);
        });

        it('should filter orders by paymentStatus', async () => {
            const response = await request(app)
                .get('/api/orders')
                .set('Authorization', `Bearer ${authA.token}`)
                .query({ paymentStatus: 'PENDING' });

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.data)).toBe(true);
        });

        it('should filter orders by shippingStatus', async () => {
            const response = await request(app)
                .get('/api/orders')
                .set('Authorization', `Bearer ${authA.token}`)
                .query({ shippingStatus: 'PENDING' });

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.data)).toBe(true);
        });

        it('should filter orders by customerId', async () => {
            const response = await request(app)
                .get('/api/orders')
                .set('Authorization', `Bearer ${authA.token}`)
                .query({ customerId: customerA });

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.data)).toBe(true);
        });

        it('should sort orders by createdAt asc', async () => {
            const response = await request(app)
                .get('/api/orders')
                .set('Authorization', `Bearer ${authA.token}`)
                .query({ sortBy: 'createdAt', sortOrder: 'asc' });

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.data)).toBe(true);
        });

        it('should sort orders by totalAmount desc', async () => {
            const response = await request(app)
                .get('/api/orders')
                .set('Authorization', `Bearer ${authA.token}`)
                .query({ sortBy: 'totalAmount', sortOrder: 'desc' });

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.data)).toBe(true);
        });
    });

    describe('GET /api/orders/:id', () => {
        it('should fetch order details', async () => {
            const response = await request(app)
                .get(`/api/orders/${testOrderId}`)
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(200);
            expect(response.body.data.id).toBe(testOrderId);
        });

        it('should return 404 for non-existent order', async () => {
            const response = await request(app)
                .get('/api/orders/non-existent-id')
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(404);
        });
    });

    describe('PUT /api/orders/:id', () => {
        it('should update an order with validation', async () => {
            const beforeCustomer = await prisma.customer.findUnique({
                where: { id: customerA },
                select: {
                    totalOrders: true,
                    totalSpent: true
                }
            });

            const updateData = {
                fulfillmentStatus: 'fulfilled',
                paymentStatus: 'PAID'
            };

            const response = await request(app)
                .put(`/api/orders/${testOrderId}`)
                .set('Authorization', `Bearer ${authA.token}`)
                .send(updateData);

            expect(response.status).toBe(200);
            expect(response.body.data.fulfillmentStatus).toBe('fulfilled');
            expect(response.body.data.paymentStatus).toBe('PAID');

            await processSingleCustomerRFM(customerA, authA.orgId);

            const afterCustomer = await prisma.customer.findUnique({
                where: { id: customerA },
                select: {
                    totalOrders: true,
                    totalSpent: true
                }
            });

            expect(afterCustomer?.totalOrders).toBe(
                beforeCustomer?.totalOrders
            );
            expect(Number(afterCustomer?.totalSpent ?? 0)).toBe(
                Number(beforeCustomer?.totalSpent ?? 0)
            );
        });

        it('should fail with invalid fulfillmentStatus on update (400)', async () => {
            const response = await request(app)
                .put(`/api/orders/${testOrderId}`)
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ fulfillmentStatus: 'INVALID' });

            expect(response.status).toBe(400);
        });

        it('should fail with invalid paymentStatus on update (400)', async () => {
            const response = await request(app)
                .put(`/api/orders/${testOrderId}`)
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ paymentStatus: 'INVALID' });

            expect(response.status).toBe(400);
        });

        it('should return 404 for non-existent order on update', async () => {
            const response = await request(app)
                .put('/api/orders/non-existent-id')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ fulfillmentStatus: 'fulfilled' });

            expect(response.status).toBe(404);
        });
    });

    describe('Historical Order createdAt', () => {
        it('should use historical order createdAt when recalculating customer dates', async () => {
            await prisma.orderItem.deleteMany({
                where: { order: { organizationId: authA.orgId } }
            });
            await prisma.order.deleteMany({
                where: { organizationId: authA.orgId }
            });
            await prisma.order.deleteMany({
                where: { organizationId: authA.orgId }
            });

            const historicalResponse = await request(app)
                .post('/api/orders')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    customerId: customerA,
                    externalId: 'ORD-HISTORICAL',
                    totalAmount: 50,
                    subtotal: 50,
                    fulfillmentStatus: 'unfulfilled',
                    paymentStatus: 'PENDING',
                    createdAt: '2020-01-01T00:00:00.000Z',
                    items: [
                        {
                            productId: productA,
                            quantity: 1,
                            price: 50
                        }
                    ]
                });

            expect(historicalResponse.status).toBe(201);

            const secondResponse = await request(app)
                .post('/api/orders')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    customerId: customerA,
                    externalId: 'ORD-HISTORICAL-2',
                    totalAmount: 50,
                    subtotal: 50,
                    fulfillmentStatus: 'unfulfilled',
                    paymentStatus: 'PENDING',
                    createdAt: '2020-01-02T00:00:00.000Z',
                    items: [
                        {
                            productId: productA,
                            quantity: 1,
                            price: 50
                        }
                    ]
                });

            expect(secondResponse.status).toBe(201);

            await processSingleCustomerRFM(customerA, authA.orgId);

            const customer = await prisma.customer.findUnique({
                where: { id: customerA },
                select: {
                    totalOrders: true,
                    firstOrderAt: true,
                    lastOrderAt: true,
                    avgDaysBetweenOrders: true
                }
            });

            expect(customer?.totalOrders).toBe(2);
            expect(customer?.firstOrderAt?.toISOString()).toBe(
                '2020-01-01T00:00:00.000Z'
            );
            expect(customer?.avgDaysBetweenOrders).not.toBeNull();
        });
    });

    describe('DELETE /api/orders/:id', () => {
        it('should delete an order', async () => {
            const createRes = await request(app)
                .post('/api/orders')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    customerId: customerA,
                    externalId: 'ORD-TO-DELETE-2',
                    totalAmount: 10,
                    subtotal: 10,
                    fulfillmentStatus: 'unfulfilled',
                    paymentStatus: 'PENDING',
                    items: [{ productId: productA, quantity: 1, price: 10 }]
                });

            const newOrderId = createRes.body.data.id;

            const response = await request(app)
                .delete(`/api/orders/${newOrderId}`)
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(204);
        });

        it('should verify order is deleted from DB', async () => {
            const createRes = await request(app)
                .post('/api/orders')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    customerId: customerA,
                    externalId: 'ORD-VERIFY-DELETE',
                    totalAmount: 10,
                    subtotal: 10,
                    fulfillmentStatus: 'unfulfilled',
                    paymentStatus: 'PENDING',
                    items: [{ productId: productA, quantity: 1, price: 10 }]
                });

            const newOrderId = createRes.body.data.id;

            await request(app)
                .delete(`/api/orders/${newOrderId}`)
                .set('Authorization', `Bearer ${authA.token}`);

            const order = await prisma.order.findUnique({
                where: { id: newOrderId }
            });

            expect(order).toBeNull();
        });

        it('should return 404 for non-existent order', async () => {
            const response = await request(app)
                .delete('/api/orders/non-existent-order-id')
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(404);
        });

        it('should reject delete from different org', async () => {
            const createResponse = await request(app)
                .post('/api/orders')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    customerId: customerA,
                    externalId: 'ORD-TO-DELETE',
                    totalAmount: 50,
                    fulfillmentStatus: 'unfulfilled',
                    paymentStatus: 'PENDING',
                    items: [
                        {
                            productId: productA,
                            quantity: 1,
                            price: 50
                        }
                    ]
                });

            const newOrderId = createResponse.body.data.id;

            const response = await request(app)
                .delete(`/api/orders/${newOrderId}`)
                .set('Authorization', `Bearer ${authB.token}`);

            expect(response.status).toBe(404);
        });
    });

    describe('DB State Verification', () => {
        it('should persist correct order items', async () => {
            const createResponse = await request(app)
                .post('/api/orders')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    customerId: customerA,
                    externalId: 'ORD-ITEMS',
                    totalAmount: 150,
                    subtotal: 130,
                    taxAmount: 20,
                    fulfillmentStatus: 'unfulfilled',
                    paymentStatus: 'PENDING',
                    items: [
                        {
                            productId: productA,
                            quantity: 3,
                            price: 43.33
                        },
                        {
                            productId: productA,
                            quantity: 1,
                            price: 0.01
                        }
                    ]
                });

            const orderId = createResponse.body.data.id;

            const items = await prisma.orderItem.findMany({
                where: { orderId },
                orderBy: { price: 'asc' }
            });

            expect(items).toHaveLength(2);
            if (items[0] && items[1]) {
                expect(items[0].quantity).toBe(1);
                expect(items[1].quantity).toBe(3);
            }
        });

        it('should maintain organizationId correctly', async () => {
            const createResponse = await request(app)
                .post('/api/orders')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    customerId: customerA,
                    externalId: 'ORD-ORG-CHECK',
                    totalAmount: 50,
                    fulfillmentStatus: 'unfulfilled',
                    paymentStatus: 'PENDING',
                    items: [
                        {
                            productId: productA,
                            quantity: 1,
                            price: 50
                        }
                    ]
                });

            const orderId = createResponse.body.data.id;

            const order = await prisma.order.findUnique({
                where: { id: orderId },
                select: { organizationId: true }
            });

            expect(order?.organizationId).toBe(authA.orgId);
        });
    });
});
