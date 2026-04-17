import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import request from 'supertest';
import app from '../../app.js';
import prisma from '../../config/prisma.config.js';
import {
    createTestUser,
    cleanupTestUser,
    type TestAuth
} from '../../test/helpers/auth.js';

describe('Invoice API', () => {
    let auth: TestAuth;
    let email: string;
    let orderId: string;

    beforeAll(async () => {
        email = `invoice-${Date.now()}@test.com`;
        auth = await createTestUser(
            email,
            'Invoice Org',
            `invoice-org-${Date.now()}`
        );

        const customer = await prisma.customer.create({
            data: {
                organizationId: auth.orgId,
                name: 'Invoice Customer',
                email: 'invoice@customer.com'
            }
        });

        const product = await prisma.product.create({
            data: {
                organizationId: auth.orgId,
                name: 'Test Product',
                price: 50
            }
        });

        const order = await prisma.order.create({
            data: {
                organizationId: auth.orgId,
                customerId: customer.id,
                totalAmount: 50,
                currency: 'EGP',
                subtotal: 50,
                orderItems: {
                    create: {
                        productId: product.id,
                        quantity: 1,
                        price: 50
                    }
                }
            }
        });
        orderId = order.id;
    });

    afterAll(async () => {
        if (auth) await cleanupTestUser(email, auth.orgId);
    });

    it('should generate invoice PDF', async () => {
        const response = await request(app)
            .get(`/api/orders/${orderId}/invoice`)
            .set('Authorization', `Bearer ${auth.token}`);

        expect(response.status).toBe(200);
        expect(response.header['content-type']).toBe('application/pdf');
        expect(response.header['content-disposition']).toContain('attachment');
        expect(response.header['content-disposition']).toContain('.pdf');
        expect(response.body).toBeDefined();
    });
});
