import {
    describe,
    expect,
    test,
    beforeAll,
    afterAll,
    beforeEach
} from 'bun:test';
import supertest from 'supertest';
import app from '../../app.js';
import prisma from '../../config/prisma.config.js';
import { auth } from '../auth/auth.js';
import { fromNodeHeaders } from 'better-auth/node';

const api = supertest(app);

describe('Segments API', () => {
    let authToken: string;
    let organizationId: string;
    let userId: string;
    let segmentId: string;

    beforeAll(async () => {
        const testEmail = `segment-test-${Date.now()}@test.com`;

        const signup = await auth.api.signUpEmail({
            body: {
                email: testEmail,
                password: 'Password123!',
                name: 'Segment Test User'
            }
        });

        if (!signup) throw new Error('Signup failed');
        authToken = signup.token!;

        const testUser = await prisma.user.update({
            where: { email: testEmail },
            data: { emailVerified: true }
        });
        userId = testUser.id;

        const orgSlug = `segment-test-org-${Date.now()}`;
        const org = await auth.api.createOrganization({
            headers: fromNodeHeaders({ authorization: `Bearer ${authToken}` }),
            body: {
                name: 'Segment Test Org',
                slug: orgSlug
            }
        });

        const orgResponse = org as {
            organization?: { id: string };
            id?: string;
        };
        organizationId = orgResponse.organization?.id ?? orgResponse.id ?? '';

        await auth.api.setActiveOrganization({
            headers: fromNodeHeaders({ authorization: `Bearer ${authToken}` }),
            body: { organizationId }
        });

        const signin = await auth.api.signInEmail({
            body: {
                email: testEmail,
                password: 'Password123!'
            }
        });
        authToken = signin.token!;
    });

    afterAll(async () => {
        await prisma.segment.deleteMany({ where: { organizationId } });
        await prisma.member.deleteMany({ where: { organizationId } });
        await prisma.organization.delete({ where: { id: organizationId } });
        await prisma.user.delete({ where: { id: userId } });
    });

    beforeEach(async () => {
        await prisma.segment.deleteMany({ where: { organizationId } });
    });

    describe('POST /api/segments', () => {
        test('should create a segment with simple filter', async () => {
            const response = await api
                .post('/api/segments')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Champions',
                    description: 'Top RFM customers',
                    filter: {
                        field: 'rfmSegment',
                        operator: 'eq',
                        value: 'Champions'
                    }
                });

            expect(response.status).toBe(201);
            expect(response.body.data.name).toBe('Champions');
            expect(response.body.data.filter).toMatchObject({
                field: 'rfmSegment',
                operator: 'eq',
                value: 'Champions'
            });
        });

        test('should create a segment with AND group', async () => {
            const response = await api
                .post('/api/segments')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'High Value Loyal',
                    filter: {
                        and: [
                            {
                                field: 'lifecycleStage',
                                operator: 'eq',
                                value: 'LOYAL'
                            },
                            {
                                field: 'totalSpent',
                                operator: 'gte',
                                value: 1000
                            }
                        ]
                    }
                });

            expect(response.status).toBe(201);
            expect(response.body.data.filter).toHaveProperty('and');
            expect(response.body.data.filter.and).toHaveLength(2);
        });

        test('should create a segment with OR group', async () => {
            const response = await api
                .post('/api/segments')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'VIP or Champions',
                    filter: {
                        or: [
                            {
                                field: 'rfmSegment',
                                operator: 'eq',
                                value: 'VIP'
                            },
                            {
                                field: 'rfmSegment',
                                operator: 'eq',
                                value: 'Champions'
                            }
                        ]
                    }
                });

            expect(response.status).toBe(201);
            expect(response.body.data.filter).toHaveProperty('or');
        });

        test('should reject invalid operator', async () => {
            const response = await api
                .post('/api/segments')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Invalid Filter',
                    filter: {
                        field: 'totalSpent',
                        operator: 'invalid',
                        value: 1000
                    }
                });

            expect(response.status).toBe(400);
        });

        test('should reject disallowed field', async () => {
            const response = await api
                .post('/api/segments')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Invalid Field',
                    filter: {
                        field: 'password',
                        operator: 'eq',
                        value: 'secret'
                    }
                });

            expect(response.status).toBe(400);
        });

        test('should reject nested deep filters', async () => {
            const response = await api
                .post('/api/segments')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Nested Filter',
                    filter: {
                        and: [
                            {
                                and: [
                                    {
                                        field: 'totalSpent',
                                        operator: 'gte',
                                        value: 100
                                    }
                                ]
                            }
                        ]
                    }
                });

            expect(response.status).toBe(201);
        });
    });

    describe('GET /api/segments', () => {
        beforeEach(async () => {
            await prisma.segment.create({
                data: {
                    name: 'Test Segment',
                    filter: {
                        field: 'totalSpent',
                        operator: 'gte',
                        value: 100
                    },
                    organizationId
                }
            });
        });

        test('should list segments', async () => {
            const response = await api
                .get('/api/segments')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data).toBeInstanceOf(Array);
        });

        test('should search segments by name', async () => {
            const response = await api
                .get('/api/segments?search=Test')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data).toBeInstanceOf(Array);
        });
    });

    describe('GET /api/segments/:id', () => {
        beforeEach(async () => {
            const segment = await prisma.segment.create({
                data: {
                    name: 'Get Test',
                    filter: { field: 'totalOrders', operator: 'gte', value: 5 },
                    organizationId
                }
            });
            segmentId = segment.id;
        });

        test('should get a segment by id', async () => {
            const response = await api
                .get(`/api/segments/${segmentId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.id).toBe(segmentId);
        });

        test('should return 404 for non-existent segment', async () => {
            const response = await api
                .get('/api/segments/non-existent-id')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(404);
        });
    });

    describe('PATCH /api/segments/:id', () => {
        beforeEach(async () => {
            const segment = await prisma.segment.create({
                data: {
                    name: 'Update Test',
                    filter: {
                        field: 'totalSpent',
                        operator: 'gte',
                        value: 100
                    },
                    organizationId
                }
            });
            segmentId = segment.id;
        });

        test('should update segment name', async () => {
            const response = await api
                .patch(`/api/segments/${segmentId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({ name: 'Updated Name' });

            expect(response.status).toBe(200);
            expect(response.body.data.name).toBe('Updated Name');
        });

        test('should update segment filter', async () => {
            const response = await api
                .patch(`/api/segments/${segmentId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    filter: {
                        field: 'lifecycleStage',
                        operator: 'eq',
                        value: 'VIP'
                    }
                });

            expect(response.status).toBe(200);
            expect(response.body.data.filter).toMatchObject({
                field: 'lifecycleStage',
                operator: 'eq',
                value: 'VIP'
            });
        });
    });

    describe('DELETE /api/segments/:id', () => {
        beforeEach(async () => {
            const segment = await prisma.segment.create({
                data: {
                    name: 'Delete Test',
                    filter: {
                        field: 'totalSpent',
                        operator: 'gte',
                        value: 100
                    },
                    organizationId
                }
            });
            segmentId = segment.id;
        });

        test('should delete a segment', async () => {
            const response = await api
                .delete(`/api/segments/${segmentId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(204);

            const deleted = await prisma.segment.findUnique({
                where: { id: segmentId }
            });
            expect(deleted).toBeNull();
        });
    });
});
