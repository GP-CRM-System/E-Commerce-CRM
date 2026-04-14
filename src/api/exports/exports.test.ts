import request from 'supertest';
import { it, describe, expect, beforeAll, afterAll } from 'bun:test';
import app from '../../app.js';
import prisma from '../../config/prisma.config.js';
import {
    createTestUser,
    cleanupTestUser,
    type TestAuth
} from '../../test/helpers/auth.js';

describe('Exports API', () => {
    let authA: TestAuth;
    let authB: TestAuth;

    let emailA: string;
    let emailB: string;

    beforeAll(async () => {
        emailA = `export-a-${Date.now()}@test.com`;
        emailB = `export-b-${Date.now()}@test.com`;
        authA = await createTestUser(
            emailA,
            'Export Org A',
            `export-org-a-${Date.now()}`
        );
        authB = await createTestUser(
            emailB,
            'Export Org B',
            `export-org-b-${Date.now()}`
        );

        await prisma.customer.createMany({
            data: [
                {
                    name: 'Export Customer 1',
                    email: 'ec1@test.com',
                    organizationId: authA.orgId,
                    createdAt: new Date(),
                    updatedAt: new Date()
                },
                {
                    name: 'Export Customer 2',
                    email: 'ec2@test.com',
                    organizationId: authA.orgId,
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            ]
        });
    });

    afterAll(async () => {
        if (authA) await cleanupTestUser(emailA, authA.orgId);
        if (authB) await cleanupTestUser(emailB, authB.orgId);
    });

    describe('POST /api/exports', () => {
        it('should create an export job with full validation', async () => {
            const response = await request(app)
                .post('/api/exports')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    entityType: 'customer',
                    format: 'csv',
                    selectedColumns: ['name', 'email']
                });

            expect(response.status).toBe(201);
            expect(response.body.data).toBeDefined();
            expect(['PENDING', 'PROCESSING']).toContain(
                response.body.data.status
            );
            expect(response.body.data.entityType).toBe('customer');
            expect(response.body.data.format).toBe('csv');
            expect(response.body.data.organizationId).toBe(authA.orgId);
        });

        it('should fail if entityType is missing (400)', async () => {
            const response = await request(app)
                .post('/api/exports')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    format: 'csv'
                });

            expect(response.status).toBe(400);
        });

        it('should fail if entityType is invalid (400)', async () => {
            const response = await request(app)
                .post('/api/exports')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    entityType: 'invalid_entity',
                    format: 'csv'
                });

            expect(response.status).toBe(400);
        });

        it('should fail if format is missing (400)', async () => {
            const response = await request(app)
                .post('/api/exports')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    entityType: 'customer'
                });

            expect(response.status).toBe(400);
        });

        it('should fail if format is invalid (400)', async () => {
            const response = await request(app)
                .post('/api/exports')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    entityType: 'customer',
                    format: 'invalid_format'
                });

            expect(response.status).toBe(400);
        });

        it('should accept xlsx format', async () => {
            const response = await request(app)
                .post('/api/exports')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    entityType: 'customer',
                    format: 'xlsx'
                });

            expect(response.status).toBe(201);
        });

        it('should reject unauthenticated requests', async () => {
            const response = await request(app).post('/api/exports').send({
                entityType: 'customer',
                format: 'csv'
            });

            expect(response.status).toBe(401);
        });
    });

    describe('Cross-Tenant Isolation', () => {
        it('should NOT allow Org B to see Org A export job', async () => {
            const createResponse = await request(app)
                .post('/api/exports')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    entityType: 'customer',
                    format: 'csv'
                });

            const jobId = createResponse.body.data.id;

            const response = await request(app)
                .get(`/api/exports/${jobId}`)
                .set('Authorization', `Bearer ${authB.token}`);

            expect(response.status).toBe(404);
        });

        it('should NOT list Org A export jobs in Org B', async () => {
            const response = await request(app)
                .get('/api/exports')
                .set('Authorization', `Bearer ${authB.token}`);

            expect(response.status).toBe(200);
            expect(response.body.data).toEqual([]);
        });
    });

    describe('GET /api/exports', () => {
        it('should list export jobs', async () => {
            const response = await request(app)
                .get('/api/exports')
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(200);
            expect(response.body.data).toBeInstanceOf(Array);
            expect(response.body.pagination).toBeDefined();
        });

        it('should reject unauthenticated requests', async () => {
            const response = await request(app).get('/api/exports');
            expect(response.status).toBe(401);
        });
    });

    describe('GET /api/exports/:id', () => {
        it('should get an export job', async () => {
            const createResponse = await request(app)
                .post('/api/exports')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    entityType: 'customer',
                    format: 'csv'
                });

            const jobId = createResponse.body.data.id;

            const response = await request(app)
                .get(`/api/exports/${jobId}`)
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(200);
            expect(response.body.data.id).toBe(jobId);
        });

        it('should return 404 for non-existent export job', async () => {
            const response = await request(app)
                .get('/api/exports/non-existent-id')
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(404);
        });
    });

    describe('DB State Verification', () => {
        it('should create export job with correct organizationId', async () => {
            const response = await request(app)
                .post('/api/exports')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    entityType: 'customer',
                    format: 'csv'
                });

            const jobId = response.body.data.id;

            const job = await prisma.exportJob.findUnique({
                where: { id: jobId }
            });

            expect(job?.organizationId).toBe(authA.orgId);
            if (job) {
                expect(['PENDING', 'PROCESSING']).toContain(job.status);
            }
        });

        it('should persist selectedColumns correctly', async () => {
            const response = await request(app)
                .post('/api/exports')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    entityType: 'customer',
                    format: 'csv',
                    selectedColumns: ['name', 'email', 'phone']
                });

            const jobId = response.body.data.id;

            const job = await prisma.exportJob.findUnique({
                where: { id: jobId },
                select: { selectedColumns: true }
            });

            expect(job?.selectedColumns).toContain('name');
            expect(job?.selectedColumns).toContain('email');
            expect(job?.selectedColumns).toContain('phone');
        });
    });
});
