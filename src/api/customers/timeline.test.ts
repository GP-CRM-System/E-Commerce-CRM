import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import request from 'supertest';
import app from '../../app.js';
import prisma from '../../config/prisma.config.js';
import {
    createTestUser,
    cleanupTestUser,
    type TestAuth
} from '../../test/helpers/auth.js';

describe('Customer Timeline API', () => {
    let auth: TestAuth;
    let email: string;
    let customerId: string;

    beforeAll(async () => {
        email = `timeline-${Date.now()}@test.com`;
        auth = await createTestUser(
            email,
            'Timeline Org',
            `timeline-org-${Date.now()}`
        );

        const customer = await prisma.customer.create({
            data: {
                organizationId: auth.orgId,
                name: 'Timeline Customer',
                email: 'timeline@customer.com'
            }
        });
        customerId = customer.id;

        // Create some timeline data
        await prisma.order.create({
            data: {
                organizationId: auth.orgId,
                customerId: customer.id,
                totalAmount: 100,
                currency: 'EGP',
                shippingStatus: 'PENDING',
                paymentStatus: 'PAID'
            }
        });

        await prisma.customerEvent.create({
            data: {
                customerId: customer.id,
                eventType: 'test_event',
                description: 'Test event occurred',
                source: 'test'
            }
        });

        await prisma.note.create({
            data: {
                customerId: customer.id,
                authorId: auth.userId,
                body: 'Test note body'
            }
        });
    });

    afterAll(async () => {
        if (auth) await cleanupTestUser(email, auth.orgId);
    });

    it('should get customer timeline', async () => {
        const response = await request(app)
            .get(`/api/customers/${customerId}/timeline`)
            .set('Authorization', `Bearer ${auth.token}`);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(3);

        const types = response.body.data.items.map(
            (i: { type: string }) => i.type
        );
        expect(types).toContain('order');
        expect(types).toContain('event');
        expect(types).toContain('note');
    });
});
