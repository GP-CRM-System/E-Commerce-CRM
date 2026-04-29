import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import crypto from 'crypto';
import request from 'supertest';
import app from '../../app.js';
import prisma from '../../config/prisma.config.js';
import {
    createTestUser,
    cleanupTestUser,
    type TestAuth
} from '../../test/helpers/auth.js';

describe('Payment API', () => {
    let auth: TestAuth;
    let email: string;
    let orderId: string;

    beforeAll(async () => {
        email = `payment-${Date.now()}@test.com`;
        auth = await createTestUser(
            email,
            'Payment Org',
            `payment-org-${Date.now()}`
        );

        const customer = await prisma.customer.create({
            data: {
                organizationId: auth.orgId,
                name: 'Payment Customer',
                email: 'payment@customer.com'
            }
        });

        const product = await prisma.product.create({
            data: {
                organizationId: auth.orgId,
                name: 'Test Product',
                price: 100
            }
        });

        const order = await prisma.order.create({
            data: {
                organizationId: auth.orgId,
                customerId: customer.id,
                totalAmount: 100,
                currency: 'EGP',
                subtotal: 100,
                orderItems: {
                    create: {
                        productId: product.id,
                        quantity: 1,
                        price: 100
                    }
                }
            }
        });
        orderId = order.id;
    });

    afterAll(async () => {
        if (auth) await cleanupTestUser(email, auth.orgId);
    });

    it('should initialize payment', async () => {
        const response = await request(app)
            .post(`/api/payments/initialize/${orderId}`)
            .set('Authorization', `Bearer ${auth.token}`);

        expect(response.status).toBe(200);
        expect(response.body.data).toHaveProperty('merchantRefNum', orderId);
        expect(response.body.data).toHaveProperty('signature');
    });

    it('should handle fawry callback', async () => {
        const merchantCode = process.env.FAWRY_MERCHANT_CODE || 'TEST';
        const securityKey = process.env.FAWRY_SECURITY_KEY || 'TEST';
        const fawryRefNo = 'FAWRY123';
        const orderStatus = 'PAID';
        const checksum = crypto
            .createHash('sha256')
            .update(
                `${merchantCode}${orderId}${fawryRefNo}${orderStatus}${securityKey}`
            )
            .digest('hex');

        const response = await request(app)
            .post('/api/payments/fawry/callback')
            .send({
                merchantRefNum: orderId,
                fawryRefNo,
                orderStatus,
                checksum
            });

        expect(response.status).toBe(200);
        expect(response.text).toBe('OK');

        const updatedOrder = await prisma.order.findUnique({
            where: { id: orderId }
        });
        expect(updatedOrder?.paymentStatus).toBe('PAID');
    });

    it('should reject invalid fawry callback checksum', async () => {
        const response = await request(app)
            .post('/api/payments/fawry/callback')
            .send({
                merchantRefNum: orderId,
                fawryRefNo: 'FAWRY123',
                orderStatus: 'PAID',
                checksum: 'invalid'
            });

        expect(response.status).toBe(400);
        expect(response.text).toBe('Verification Failed');
    });
});
