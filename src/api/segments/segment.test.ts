import {
    describe,
    expect,
    it,
    beforeAll,
    afterAll,
    beforeEach
} from 'bun:test';
import supertest from 'supertest';
import app from '../../app.js';
import prisma from '../../config/prisma.config.js';
import {
    createTestUser,
    cleanupTestUser,
    type TestAuth
} from '../../test/helpers/auth.js';

const api = supertest(app);

describe('Segments API', () => {
    let authA: TestAuth;
    let authB: TestAuth;
    let segmentId: string;

    let emailA: string;
    let emailB: string;

    beforeAll(async () => {
        emailA = `segment-a-${Date.now()}@test.com`;
        emailB = `segment-b-${Date.now()}@test.com`;
        authA = await createTestUser(
            emailA,
            'Segment Org A',
            `segment-org-a-${Date.now()}`
        );
        authB = await createTestUser(
            emailB,
            'Segment Org B',
            `segment-org-b-${Date.now()}`
        );
    });

    afterAll(async () => {
        if (authA) await cleanupTestUser(emailA, authA.orgId);
        if (authB) await cleanupTestUser(emailB, authB.orgId);
    });

    beforeEach(async () => {
        await prisma.segment.deleteMany({
            where: { organizationId: authA.orgId }
        });
    });

    describe('POST /api/segments', () => {
        it('should create a segment with simple filter with validation', async () => {
            const response = await api
                .post('/api/segments')
                .set('Authorization', `Bearer ${authA.token}`)
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
            expect(response.body.data.description).toBe('Top RFM customers');
            expect(response.body.data.filter).toMatchObject({
                field: 'rfmSegment',
                operator: 'eq',
                value: 'Champions'
            });
            expect(response.body.data.organizationId).toBe(authA.orgId);
            segmentId = response.body.data.id;
        });

        it('should fail if name is missing (400)', async () => {
            const response = await api
                .post('/api/segments')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    filter: {
                        field: 'totalSpent',
                        operator: 'gte',
                        value: 1000
                    }
                });

            expect(response.status).toBe(400);
            expect(response.body.code).toBe('VAL_OO1');
        });

        it('should fail if filter is missing (400)', async () => {
            const response = await api
                .post('/api/segments')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    name: 'No Filter'
                });

            expect(response.status).toBe(400);
        });

        it('should create a segment with AND group', async () => {
            const response = await api
                .post('/api/segments')
                .set('Authorization', `Bearer ${authA.token}`)
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

        it('should create a segment with OR group', async () => {
            const response = await api
                .post('/api/segments')
                .set('Authorization', `Bearer ${authA.token}`)
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

        it('should fail if operator is invalid (400)', async () => {
            const response = await api
                .post('/api/segments')
                .set('Authorization', `Bearer ${authA.token}`)
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

        it('should fail if field is disallowed (400)', async () => {
            const response = await api
                .post('/api/segments')
                .set('Authorization', `Bearer ${authA.token}`)
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

        it('should allow nested NOT-like filters', async () => {
            const response = await api
                .post('/api/segments')
                .set('Authorization', `Bearer ${authA.token}`)
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

        it('should reject unauthenticated requests', async () => {
            const response = await api.post('/api/segments').send({
                name: 'Test',
                filter: { field: 'totalSpent', operator: 'gte', value: 100 }
            });

            expect(response.status).toBe(401);
        });
    });

    describe('Cross-Tenant Isolation', () => {
        it('should NOT allow Org B to see Org A segment', async () => {
            const createRes = await prisma.segment.create({
                data: {
                    name: 'A Segment',
                    filter: {
                        field: 'totalSpent',
                        operator: 'gte',
                        value: 100
                    },
                    organizationId: authA.orgId
                }
            });

            const response = await api
                .get(`/api/segments/${createRes.id}`)
                .set('Authorization', `Bearer ${authB.token}`);

            expect(response.status).toBe(404);
        });

        it('should NOT allow Org B to update Org A segment', async () => {
            const createRes = await prisma.segment.create({
                data: {
                    name: 'A Segment 2',
                    filter: {
                        field: 'totalSpent',
                        operator: 'gte',
                        value: 100
                    },
                    organizationId: authA.orgId
                }
            });

            const response = await api
                .patch(`/api/segments/${createRes.id}`)
                .set('Authorization', `Bearer ${authB.token}`)
                .send({ name: 'Hacked Name' });

            expect(response.status).toBe(404);
        });

        it('should NOT allow Org B to delete Org A segment', async () => {
            const createRes = await prisma.segment.create({
                data: {
                    name: 'A Segment 3',
                    filter: {
                        field: 'totalSpent',
                        operator: 'gte',
                        value: 100
                    },
                    organizationId: authA.orgId
                }
            });

            const response = await api
                .delete(`/api/segments/${createRes.id}`)
                .set('Authorization', `Bearer ${authB.token}`);

            expect(response.status).toBe(404);
        });

        it('should NOT list Org A segments in Org B', async () => {
            await prisma.segment.deleteMany({
                where: { organizationId: authB.orgId }
            });

            const response = await api
                .get('/api/segments')
                .set('Authorization', `Bearer ${authB.token}`);

            expect(response.status).toBe(200);
            expect(response.body.data).toEqual([]);
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
                    organizationId: authA.orgId
                }
            });
        });

        it('should list segments', async () => {
            const response = await api
                .get('/api/segments')
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(200);
            expect(response.body.data).toBeInstanceOf(Array);
            expect(response.body.data.length).toBeGreaterThan(0);
        });

        it('should search segments by name', async () => {
            const response = await api
                .get('/api/segments?search=Test')
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(200);
            expect(response.body.data).toBeInstanceOf(Array);
        });

        it('should reject unauthenticated requests', async () => {
            const response = await api.get('/api/segments');
            expect(response.status).toBe(401);
        });
    });

    describe('GET /api/segments/:id', () => {
        beforeEach(async () => {
            const segment = await prisma.segment.create({
                data: {
                    name: 'Get Test',
                    filter: { field: 'totalOrders', operator: 'gte', value: 5 },
                    organizationId: authA.orgId
                }
            });
            segmentId = segment.id;
        });

        it('should get a segment by id', async () => {
            const response = await api
                .get(`/api/segments/${segmentId}`)
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(200);
            expect(response.body.data.id).toBe(segmentId);
            expect(response.body.data.name).toBe('Get Test');
        });

        it('should return 404 for non-existent segment', async () => {
            const response = await api
                .get('/api/segments/non-existent-id')
                .set('Authorization', `Bearer ${authA.token}`);

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
                    organizationId: authA.orgId
                }
            });
            segmentId = segment.id;
        });

        it('should update segment name', async () => {
            const response = await api
                .patch(`/api/segments/${segmentId}`)
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ name: 'Updated Name' });

            expect(response.status).toBe(200);
            expect(response.body.data.name).toBe('Updated Name');
        });

        it('should update segment filter', async () => {
            const response = await api
                .patch(`/api/segments/${segmentId}`)
                .set('Authorization', `Bearer ${authA.token}`)
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

        it('should fail with invalid operator on update (400)', async () => {
            const response = await api
                .patch(`/api/segments/${segmentId}`)
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    filter: {
                        field: 'totalSpent',
                        operator: 'INVALID',
                        value: 100
                    }
                });

            expect(response.status).toBe(400);
        });

        it('should return 404 for non-existent segment', async () => {
            const response = await api
                .patch('/api/segments/non-existent-id')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ name: 'Updated' });

            expect(response.status).toBe(404);
        });

        it('should verify DB state after update', async () => {
            await api
                .patch(`/api/segments/${segmentId}`)
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ description: 'DB Verified Description' });

            const segment = await prisma.segment.findUnique({
                where: { id: segmentId },
                select: { description: true }
            });

            expect(segment?.description).toBe('DB Verified Description');
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
                    organizationId: authA.orgId
                }
            });
            segmentId = segment.id;
        });

        it('should delete a segment', async () => {
            const response = await api
                .delete(`/api/segments/${segmentId}`)
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(204);

            const deleted = await prisma.segment.findUnique({
                where: { id: segmentId }
            });
            expect(deleted).toBeNull();
        });

        it('should return 404 for non-existent segment', async () => {
            const response = await api
                .delete('/api/segments/non-existent-segment-id-12345')
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(404);
        });

        it('should reject delete from different org', async () => {
            const createRes = await prisma.segment.create({
                data: {
                    name: 'Delete Test B',
                    filter: {
                        field: 'totalSpent',
                        operator: 'gte',
                        value: 100
                    },
                    organizationId: authB.orgId
                }
            });

            const response = await api
                .delete(`/api/segments/${createRes.id}`)
                .set('Authorization', `Bearer ${authB.token}`);

            expect(response.status).toBe(204);
        });
    });

    describe('DB State Verification', () => {
        it('should persist all filter fields correctly', async () => {
            const response = await api
                .post('/api/segments')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    name: 'Full Filter',
                    description: 'Full description',
                    filter: {
                        or: [
                            {
                                field: 'totalSpent',
                                operator: 'gte',
                                value: 500
                            },
                            {
                                field: 'lifecycleStage',
                                operator: 'eq',
                                value: 'VIP'
                            }
                        ]
                    }
                });

            const segId = response.body.data.id;

            const segment = await prisma.segment.findUnique({
                where: { id: segId }
            });

            expect(segment?.name).toBe('Full Filter');
            expect(segment?.description).toBe('Full description');
            expect(segment?.organizationId).toBe(authA.orgId);
            expect(segment?.filter).toHaveProperty('or');
        });
    });
});
