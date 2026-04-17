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
        expect(response.body.data.phone).toBe(customerData.phone);
        expect(response.body.data.address).toBe(customerData.address);
        expect(response.body.data.city).toBe(customerData.city);
        expect(response.body.data.source).toBe(customerData.source);
        expect(response.body.data.lifecycleStage).toBe(
            customerData.lifecycleStage
        );
        expect(response.body.data.externalId).toBe(customerData.externalId);
        expect(response.body.data.acceptsMarketing).toBe(
            customerData.acceptsMarketing
        );
        expect(response.body.data.organizationId).toBe(testOrgId);

        testCustomerId = response.body.data.id;
    });

    it('should return 400 for missing required fields', async () => {
        const customerData = {
            // Missing required 'name' field
            email: 'test@example.com',
            phone: '12345678901'
        };

        const response = await request(app)
            .post('/api/customers')
            .set('Authorization', `Bearer ${authToken}`)
            .send(customerData);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('message');
        expect(response.body).toHaveProperty('details');
    });

    it('should return 400 for invalid email format', async () => {
        const customerData = {
            name: 'John Doe',
            email: 'invalid-email', // Invalid email format
            phone: '12345678901'
        };

        const response = await request(app)
            .post('/api/customers')
            .set('Authorization', `Bearer ${authToken}`)
            .send(customerData);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('message');
        expect(response.body).toHaveProperty('details');
    });

    it('should return 400 for phone number too short', async () => {
        const customerData = {
            name: 'John Doe',
            email: 'test@example.com',
            phone: '123' // Too short (min 11 chars)
        };

        const response = await request(app)
            .post('/api/customers')
            .set('Authorization', `Bearer ${authToken}`)
            .send(customerData);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('message');
        expect(response.body).toHaveProperty('details');
    });

    it('should return 400 for phone number too long', async () => {
        const customerData = {
            name: 'John Doe',
            email: 'test@example.com',
            phone: '12345678901234' // Too long (max 13 chars)
        };

        const response = await request(app)
            .post('/api/customers')
            .set('Authorization', `Bearer ${authToken}`)
            .send(customerData);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('message');
        expect(response.body).toHaveProperty('details');
    });

    it('should return 400 for invalid source enum value', async () => {
        const customerData = {
            name: 'John Doe',
            email: 'test@example.com',
            phone: '12345678901',
            source: 'INVALID_SOURCE' // Invalid enum value
        };

        const response = await request(app)
            .post('/api/customers')
            .set('Authorization', `Bearer ${authToken}`)
            .send(customerData);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('message');
        expect(response.body).toHaveProperty('details');
    });

    it('should return 400 for invalid lifecycleStage enum value', async () => {
        const customerData = {
            name: 'John Doe',
            email: 'test@example.com',
            phone: '12345678901',
            lifecycleStage: 'INVALID_STAGE' // Invalid enum value
        };

        const response = await request(app)
            .post('/api/customers')
            .set('Authorization', `Bearer ${authToken}`)
            .send(customerData);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('message');
        expect(response.body).toHaveProperty('details');
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

    it('should verify pagination structure in response', async () => {
        // First create enough customers to test pagination
        for (let i = 0; i < 5; i++) {
            await request(app)
                .post('/api/customers')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: `Pagination Test Customer ${i}`,
                    email: `pagination${i}-${Date.now()}@test.com`,
                    phone: `1234567890${i}`
                });
        }

        // Test with limit of 2 to ensure pagination
        const response = await request(app)
            .get('/api/customers')
            .set('Authorization', `Bearer ${authToken}`)
            .query({ page: '1', limit: '2' });

        expect(response.status).toBe(200);

        // Verify pagination object exists
        expect(response.body.pagination).toBeDefined();
        expect(response.body.pagination).toHaveProperty('page');
        expect(response.body.pagination).toHaveProperty('limit');
        expect(response.body.pagination).toHaveProperty('total');

        // Verify values
        expect(response.body.pagination.page).toBe(1);
        expect(response.body.pagination.limit).toBe(2);
        expect(response.body.pagination.total).toBeGreaterThan(0);

        // Verify returned item count matches limit
        expect(response.body.data.length).toBeLessThanOrEqual(2);
    });

    it('should correctly calculate pagination', async () => {
        const response = await request(app)
            .get('/api/customers')
            .set('Authorization', `Bearer ${authToken}`)
            .query({ page: '1', limit: '1' });

        expect(response.status).toBe(200);

        const pagination = response.body.pagination;
        expect(pagination).toBeDefined();
        expect(pagination).toHaveProperty('page');
        expect(pagination).toHaveProperty('limit');
        expect(pagination).toHaveProperty('total');
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

    it('should verify error response for unauthorized', async () => {
        const response = await request(app).get('/api/customers');

        expect(response.status).toBe(401);
    });

    describe('Cross-Org Isolation', () => {
        let crossOrgToken: string;

        it('should not allow user from org B to access org A customer', async () => {
            // Create second user and org with unique email
            const uniqueEmail = `cross-org-${Date.now()}@test.com`;
            const signup = await auth.api.signUpEmail({
                body: {
                    email: uniqueEmail,
                    password: 'Password123!',
                    name: 'Cross Org Test User'
                }
            });

            await prisma.user.update({
                where: { id: signup.user.id },
                data: { emailVerified: true }
            });

            const org = await auth.api.createOrganization({
                headers: fromNodeHeaders({
                    authorization: `Bearer ${signup.token!}`
                }),
                body: {
                    name: 'Cross Org Test',
                    slug: 'cross-org-test-' + Date.now()
                }
            });

            const orgResponse = org as {
                organization?: { id: string };
                id?: string;
            };
            const crossOrgId =
                orgResponse.organization?.id ?? orgResponse.id ?? '';

            await auth.api.setActiveOrganization({
                headers: fromNodeHeaders({
                    authorization: `Bearer ${signup.token!}`
                }),
                body: { organizationId: crossOrgId }
            });

            const signin = await auth.api.signInEmail({
                body: {
                    email: uniqueEmail,
                    password: 'Password123!'
                }
            });
            crossOrgToken = signin.token!;

            // Try to access org A's customer from org B - should fail
            const response = await request(app)
                .get(`/api/customers/${testCustomerId}`)
                .set('Authorization', `Bearer ${crossOrgToken}`);

            // Should return 404 (not found) or 403 (forbidden) due to org isolation
            expect([401, 403, 404]).toContain(response.status);
        });

        it('should not allow user from org B to update org A customer', async () => {
            const response = await request(app)
                .put(`/api/customers/${testCustomerId}`)
                .set('Authorization', `Bearer ${crossOrgToken}`)
                .send({ name: 'Hacked Name' });

            expect([401, 403, 404]).toContain(response.status);
        });

        it('should not allow user from org B to delete org A customer', async () => {
            const response = await request(app)
                .delete(`/api/customers/${testCustomerId}`)
                .set('Authorization', `Bearer ${crossOrgToken}`);

            expect([401, 403, 404]).toContain(response.status);
        });
    });

    describe('Delete Customer', () => {
        let deleteCustomerId: string;

        it('should delete customer and associated notes/events (cascading delete)', async () => {
            // Create customer with note and event
            const customer = await prisma.customer.create({
                data: {
                    name: 'Delete Test Customer',
                    email: 'delete-test@test.com',
                    organizationId: testOrgId,
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            });
            deleteCustomerId = customer.id;

            await prisma.note.create({
                data: {
                    body: 'Test note',
                    customerId: deleteCustomerId,
                    authorId: testUserId,
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            });

            await prisma.customerEvent.create({
                data: {
                    customerId: deleteCustomerId,
                    eventType: 'ORDER_PLACED',
                    description: 'Test event',
                    source: 'test',
                    occurredAt: new Date()
                }
            });

            // Delete the customer
            const response = await request(app)
                .delete(`/api/customers/${deleteCustomerId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);

            // Verify customer is deleted
            const deletedCustomer = await prisma.customer.findUnique({
                where: { id: deleteCustomerId }
            });
            expect(deletedCustomer).toBeNull();

            // Verify associated notes are deleted
            const notes = await prisma.note.findMany({
                where: { customerId: deleteCustomerId }
            });
            expect(notes.length).toBe(0);

            // Verify associated events are deleted
            const events = await prisma.customerEvent.findMany({
                where: { customerId: deleteCustomerId }
            });
            expect(events.length).toBe(0);
        });

        it('should return 404 when trying to delete non-existent customer', async () => {
            const response = await request(app)
                .delete('/api/customers/non-existent-id')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(404);
        });
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
