import request from 'supertest';
import { it, describe, expect, beforeAll, afterAll } from 'bun:test';
import app from '../../app.js';
import prisma from '../../config/prisma.config.js';
import { auth } from '../auth/auth.js';

import { fromNodeHeaders } from 'better-auth/node';

let authToken: string;
let testUserId: string;
let testOrgId: string;
let testCustomerId: string;
let testNoteId: string;
let testEventId: string;

beforeAll(async () => {
    // 1. Cleanup
    await prisma.customer.deleteMany({
        where: { organization: { slug: { startsWith: 'test-org-slug' } } }
    });
    await prisma.member.deleteMany({
        where: { user: { email: 'test-user@test.com' } }
    });
    await prisma.session.deleteMany({
        where: { user: { email: 'test-user@test.com' } }
    });
    await prisma.account.deleteMany({
        where: { user: { email: 'test-user@test.com' } }
    });
    await prisma.organization.deleteMany({
        where: { slug: { startsWith: 'test-org-slug' } }
    });
    await prisma.user.deleteMany({ where: { email: 'test-user@test.com' } });

    // 2. Sign up test user
    try {
        const signup = await auth.api.signUpEmail({
            body: {
                email: 'test-user@test.com',
                password: 'Password123!',
                name: 'Test User'
            }
        });

        if (!signup) {
            throw new Error('Signup failed');
        }

        testUserId = signup.user.id;
        authToken = signup.token!;

        // Mark as verified manually in DB just in case
        await prisma.user.update({
            where: { id: testUserId },
            data: { emailVerified: true }
        });

        // 3. Create test organization
        const org = await auth.api.createOrganization({
            headers: fromNodeHeaders({
                authorization: `Bearer ${authToken}`
            }),
            body: {
                name: 'Test Organization',
                slug: 'test-org-slug-' + Date.now()
            }
        });

        if (!org) {
            throw new Error('Org creation failed');
        }
        // Better Auth returns org.organization or just org depending on version
        const orgResponse = org as {
            organization?: { id: string };
            id?: string;
        };
        testOrgId = orgResponse.organization?.id ?? orgResponse.id ?? '';

        // 4. Set the organization as active
        await auth.api.setActiveOrganization({
            headers: fromNodeHeaders({
                authorization: `Bearer ${authToken}`
            }),
            body: {
                organizationId: testOrgId
            }
        });

        // 5. Sign in again to get fresh session with org context
        const signin = await auth.api.signInEmail({
            body: {
                email: 'test-user@test.com',
                password: 'Password123!'
            }
        });

        if (!signin || !signin.token) {
            throw new Error('Signin failed');
        }
        authToken = signin.token;
    } catch (err) {
        console.error('Test setup error:', err);
        throw err;
    }
});

afterAll(async () => {
    // Cleanup
    await prisma.customerEvent.deleteMany({
        where: { customer: { organizationId: testOrgId } }
    });
    await prisma.note.deleteMany({
        where: { customer: { organizationId: testOrgId } }
    });
    await prisma.customer.deleteMany({ where: { organizationId: testOrgId } });
    await prisma.member.deleteMany({ where: { organizationId: testOrgId } });
    await prisma.session.deleteMany({ where: { userId: testUserId } });
    await prisma.organizationRole.deleteMany({
        where: { organizationId: testOrgId }
    });
    await prisma.invitation.deleteMany({
        where: { organizationId: testOrgId }
    });
    await prisma.organization.deleteMany({
        where: { slug: { startsWith: 'test-org-slug' } }
    });
    await prisma.user.delete({ where: { id: testUserId } });
});

describe('Customer API', () => {
    it('should create a new customer', async () => {
        const customerData = {
            name: 'John Doe',
            email: 'test-customer@example.com',
            phone: '12345678901', // 11 chars as per schema
            address: '123 Test St',
            city: 'Test City',
            source: 'WEBSITE',
            lifecycleStage: 'PROSPECT',
            externalId: 'ext-123',
            acceptsMarketing: true
        };

        const response = await request(app)
            .post('/api/customers')
            .set('Authorization', `Bearer ${authToken}`)
            .send(customerData);

        expect(response.status).toBe(201);
        expect(response.body.data).toHaveProperty('id');
        expect(response.body.data.name).toBe(customerData.name);
        expect(response.body.data.email).toBe(customerData.email);
        expect(response.body.data.organizationId).toBe(testOrgId);

        testCustomerId = response.body.data.id;
    });

    it('should list all customers', async () => {
        const response = await request(app)
            .get('/api/customers')
            .set('Authorization', `Bearer ${authToken}`)
            .query({ page: '1', limit: '10' });

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.data)).toBe(true);
        expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should filter customers by search', async () => {
        const response = await request(app)
            .get('/api/customers')
            .set('Authorization', `Bearer ${authToken}`)
            .query({ search: 'John' });

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter customers by city', async () => {
        const response = await request(app)
            .get('/api/customers')
            .set('Authorization', `Bearer ${authToken}`)
            .query({ city: 'Test City' });

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter customers by source', async () => {
        const response = await request(app)
            .get('/api/customers')
            .set('Authorization', `Bearer ${authToken}`)
            .query({ source: 'WEBSITE' });

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter customers by lifecycleStage', async () => {
        const response = await request(app)
            .get('/api/customers')
            .set('Authorization', `Bearer ${authToken}`)
            .query({ lifecycleStage: 'PROSPECT' });

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should sort customers by createdAt asc', async () => {
        const response = await request(app)
            .get('/api/customers')
            .set('Authorization', `Bearer ${authToken}`)
            .query({ sortBy: 'createdAt', sortOrder: 'asc' });

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should sort customers by name desc', async () => {
        const response = await request(app)
            .get('/api/customers')
            .set('Authorization', `Bearer ${authToken}`)
            .query({ sortBy: 'name', sortOrder: 'desc' });

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should fetch customer details', async () => {
        const response = await request(app)
            .get(`/api/customers/${testCustomerId}`)
            .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data.id).toBe(testCustomerId);
        expect(response.body.data).toHaveProperty('tags');
        expect(response.body.data).toHaveProperty('notes');
        expect(response.body.data).toHaveProperty('orders');
    });

    it('should update a customer', async () => {
        const updateData = {
            name: 'John Updated',
            lifecycleStage: 'RETURNING'
        };

        const response = await request(app)
            .put(`/api/customers/${testCustomerId}`)
            .set('Authorization', `Bearer ${authToken}`)
            .send(updateData);

        expect(response.status).toBe(200);
        expect(response.body.data.name).toBe(updateData.name);
        expect(response.body.data.lifecycleStage).toBe(
            updateData.lifecycleStage
        );
    });

    it('should return 401 if unauthorized', async () => {
        const response = await request(app).get('/api/customers');
        expect(response.status).toBe(401);
    });

    describe('Note Routes', () => {
        it('should create a new note', async () => {
            const noteData = {
                body: 'This is a test note for the customer'
            };

            const response = await request(app)
                .post(`/api/customers/${testCustomerId}/notes`)
                .set('Authorization', `Bearer ${authToken}`)
                .send(noteData);

            expect(response.status).toBe(201);
            expect(response.body.data).toHaveProperty('id');
            expect(response.body.data.body).toBe(noteData.body);
            expect(response.body.data.customerId).toBe(testCustomerId);

            testNoteId = response.body.data.id;
        });

        it('should list all notes', async () => {
            const response = await request(app)
                .get(`/api/customers/${testCustomerId}/notes`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data.length).toBeGreaterThan(0);
        });

        it('should update a note', async () => {
            const noteData = {
                body: 'Updated test note content'
            };

            const response = await request(app)
                .put(`/api/customers/${testCustomerId}/notes/${testNoteId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .send(noteData);

            expect(response.status).toBe(200);
            expect(response.body.data).toHaveProperty('id');
            expect(response.body.data.body).toBe(noteData.body);
            expect(response.body.data.customerId).toBe(testCustomerId);
        });

        it('should delete a note', async () => {
            const response = await request(app)
                .delete(`/api/customers/${testCustomerId}/notes/${testNoteId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);

            // Verify it's gone
            const verify = await prisma.note.findUnique({
                where: { id: testNoteId }
            });
            expect(verify).toBeNull();
        });
    });

    describe('Event Routes', () => {
        it('should create a new event', async () => {
            const eventData = {
                eventType: 'ORDER_PLACED',
                description: 'Customer placed an order',
                metadata: {
                    orderId: '123',
                    amount: 100
                },
                source: 'shopify',
                occurredAt: new Date().toISOString()
            };

            const response = await request(app)
                .post(`/api/customers/${testCustomerId}/events`)
                .set('Authorization', `Bearer ${authToken}`)
                .send(eventData);

            expect(response.status).toBe(201);
            expect(response.body.data).toHaveProperty('id');
            expect(response.body.data.eventType).toBe(eventData.eventType);
            expect(response.body.data.description).toBe(eventData.description);
            expect(response.body.data.customerId).toBe(testCustomerId);

            testEventId = response.body.data.id;
        });

        it('should list all events', async () => {
            const response = await request(app)
                .get(`/api/customers/${testCustomerId}/events`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data.length).toBeGreaterThan(0);
        });

        it('should update an event', async () => {
            const eventData = {
                description: 'Updated event description'
            };

            const response = await request(app)
                .put(`/api/customers/${testCustomerId}/events/${testEventId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .send(eventData);

            expect(response.status).toBe(200);
            expect(response.body.data).toHaveProperty('id');
            expect(response.body.data.description).toBe(eventData.description);
            expect(response.body.data.customerId).toBe(testCustomerId);
        });

        it('should delete an event', async () => {
            const response = await request(app)
                .delete(
                    `/api/customers/${testCustomerId}/events/${testEventId}`
                )
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);

            // Verify it's gone
            const verify = await prisma.customerEvent.findUnique({
                where: { id: testEventId }
            });
            expect(verify).toBeNull();
        });
    });
});
