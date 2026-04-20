import request from 'supertest';
import { it, describe, expect, beforeAll, afterAll } from 'bun:test';
import app from '../../app.js';
import prisma from '../../config/prisma.config.js';
import {
    createTestUser,
    cleanupTestUser,
    type TestAuth
} from '../../test/helpers/auth.js';

describe('Tickets API', () => {
    let authA: TestAuth;
    let customerId: string;
    let ticketId: string;

    beforeAll(async () => {
        authA = await createTestUser(
            `tickets-a-${Date.now()}@test.com`,
            'Tickets Org A',
            `tickets-org-a-${Date.now()}`
        );

        const customer = await prisma.customer.create({
            data: {
                name: 'Test Customer for Tickets',
                email: 'ticket-customer@test.com',
                organizationId: authA.orgId
            }
        });
        customerId = customer.id;
    });

    afterAll(async () => {
        if (authA) await cleanupTestUser(authA.email, authA.orgId);
    });

    describe('GET /api/tickets', () => {
        it('should return empty list for new org', async () => {
            const res = await request(app)
                .get('/api/tickets')
                .set('Authorization', `Bearer ${authA.token}`);

            expect(res.status).toBe(200);
            expect(res.body.data).toBeDefined();
            expect(res.body.pagination).toBeDefined();
        });

        it('should accept pagination params', async () => {
            const res = await request(app)
                .get('/api/tickets?page=1&limit=10')
                .set('Authorization', `Bearer ${authA.token}`);

            expect(res.status).toBe(200);
            expect(res.body.pagination.page).toBe(1);
            expect(res.body.pagination.limit).toBe(10);
        });

        it('should reject unauthorized requests', async () => {
            const res = await request(app).get('/api/tickets');

            expect(res.status).toBe(401);
        });
    });

    describe('POST /api/tickets', () => {
        it('should create a ticket', async () => {
            const ticketData = {
                customerId,
                subject: 'Test Ticket',
                description: 'This is a test ticket',
                priority: 'MEDIUM'
            };

            const res = await request(app)
                .post('/api/tickets')
                .set('Authorization', `Bearer ${authA.token}`)
                .send(ticketData);

            expect(res.status).toBe(201);
            expect(res.body.data).toHaveProperty('id');
            expect(res.body.data.subject).toBe(ticketData.subject);

            ticketId = res.body.data.id;
        });

        it('should require customerId', async () => {
            const res = await request(app)
                .post('/api/tickets')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ subject: 'No customer' });

            expect(res.status).toBe(400);
        });

        it('should require subject', async () => {
            const res = await request(app)
                .post('/api/tickets')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ customerId });

            expect(res.status).toBe(400);
        });
    });

    describe('GET /api/tickets/:id', () => {
        it('should get a ticket by id', async () => {
            const res = await request(app)
                .get(`/api/tickets/${ticketId}`)
                .set('Authorization', `Bearer ${authA.token}`);

            expect(res.status).toBe(200);
            expect(res.body.data.id).toBe(ticketId);
        });

        it('should return 404 for non-existent ticket', async () => {
            const res = await request(app)
                .get('/api/tickets/non-existent-id')
                .set('Authorization', `Bearer ${authA.token}`);

            expect(res.status).toBe(404);
        });
    });

    describe('PATCH /api/tickets/:id', () => {
        it('should accept update data', async () => {
            const res = await request(app)
                .patch(`/api/tickets/${ticketId}`)
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ priority: 'HIGH' });

            expect(res.status).toBe(200);
        });
    });
});