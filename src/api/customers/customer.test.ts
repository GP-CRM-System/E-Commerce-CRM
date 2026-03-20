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
    console.log('Starting test setup...');
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
    console.log('Cleanup finished.');

    // 2. Sign up test user
    console.log('Signing up user...');
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

        console.log('Signup successful, user ID:', signup.user.id);
        testUserId = signup.user.id;
        authToken = signup.token!;

        // Mark as verified manually in DB just in case
        await prisma.user.update({
            where: { id: testUserId },
            data: { emailVerified: true }
        });

        // 3. Create test organization
        console.log('Creating organization...');
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
        testOrgId = org.id;
        console.log('Org created, ID:', testOrgId);

        // 4. Sign in again to get fresh session with org context
        console.log('Signing in again...');
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
        console.log('Setup complete, auth token length:', authToken.length);
    } catch (err) {
        console.error('Test setup error:', err);
        throw err;
    }
});

afterAll(async () => {
    // Cleanup
    await prisma.customer.deleteMany({ where: { organizationId: testOrgId } });
    await prisma.member.deleteMany({ where: { organizationId: testOrgId } });
    await prisma.session.deleteMany({ where: { userId: testUserId } });
    await prisma.organization.delete({ where: { id: testOrgId } });
    await prisma.user.delete({ where: { id: testUserId } });
});

describe('Customer Routes', () => {
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

    // it('should delete a customer', async () => {
    //     const response = await request(app)
    //         .delete(`/api/customers/${testCustomerId}`)
    //         .set('Authorization', `Bearer ${authToken}`);

    //     expect(response.status).toBe(200);

    //     // Verify it's gone
    //     const verify = await prisma.customer.findUnique({
    //         where: { id: testCustomerId }
    //     });
    //     expect(verify).toBeNull();
    // });

    describe('Note Routes', () => {
        it('should create a new note', async () => {
            const noteData = {
                title: 'Test Note',
                content: 'Test Content'
            };

            const response = await request(app)
                .post(`/api/customers/${testCustomerId}/notes`)
                .set('Authorization', `Bearer ${authToken}`)
                .send(noteData);

            testNoteId = response.body.data.id;

            expect(response.status).toBe(201);
            expect(response.body.data).toHaveProperty('id');
            expect(response.body.data.title).toBe(noteData.title);
            expect(response.body.data.content).toBe(noteData.content);
            expect(response.body.data.customerId).toBe(testCustomerId);
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
                title: 'Test Note',
                content: 'Test Content Updated'
            };

            const response = await request(app)
                .put(`/api/customers/${testCustomerId}/notes/${testNoteId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .send(noteData);

            expect(response.status).toBe(201);
            expect(response.body.data).toHaveProperty('id');
            expect(response.body.data.title).toBe(noteData.title);
            expect(response.body.data.content).toBe(noteData.content);
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

        describe('Event Routes', () => {
            it('should create a new event', async () => {
                const eventData = {
                    eventType: 'ORDER_PLACED',
                    description: 'Order Placed',
                    metadata: {
                        orderId: '123',
                        amount: 100,
                        currency: 'USD'
                    },
                    source: 'WEBSITE',
                    occurredAt: new Date().toISOString()
                };

                const response = await request(app)
                    .post(`/api/customers/${testCustomerId}/events`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .send(eventData);

                testEventId = response.body.data.id;

                expect(response.status).toBe(201);
                expect(response.body.data).toHaveProperty('id');
                expect(response.body.data.eventType).toBe(eventData.eventType);
                expect(response.body.data.description).toBe(eventData.description);
                expect(response.body.data.metadata).toEqual(eventData.metadata);
                expect(response.body.data.source).toBe(eventData.source);
                expect(response.body.data.occurredAt).toBe(eventData.occurredAt);
                expect(response.body.data.customerId).toBe(testCustomerId);
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
                    eventType: 'ORDER_PLACED',
                    description: 'Order Placed',
                    metadata: {
                        orderId: '123',
                        amount: 100,
                        currency: 'USD'
                    },
                    source: 'WEBSITE',
                    occurredAt: new Date().toISOString()
                };

                const response = await request(app)
                    .put(`/api/customers/${testCustomerId}/events/${testEventId}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .send(eventData);

                expect(response.status).toBe(200);
                expect(response.body.data).toHaveProperty('id');
                expect(response.body.data.eventType).toBe(eventData.eventType);
                expect(response.body.data.description).toBe(eventData.description);
                expect(response.body.data.metadata).toEqual(eventData.metadata);
                expect(response.body.data.source).toBe(eventData.source);
                expect(response.body.data.occurredAt).toBe(eventData.occurredAt);
                expect(response.body.data.customerId).toBe(testCustomerId);
            });

            it('should delete an event', async () => {
                const response = await request(app)
                    .delete(`/api/customers/${testCustomerId}/events/${testEventId}`)
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


});

