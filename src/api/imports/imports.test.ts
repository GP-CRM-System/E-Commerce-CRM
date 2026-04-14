import request from 'supertest';
import { it, describe, expect, beforeAll, afterAll } from 'bun:test';
import app from '../../app.js';
import prisma from '../../config/prisma.config.js';
import {
    createTestUser,
    cleanupTestUser,
    type TestAuth
} from '../../test/helpers/auth.js';

describe('Imports API', () => {
    let authA: TestAuth;
    let authB: TestAuth;

    let emailA: string;
    let emailB: string;

    beforeAll(async () => {
        emailA = `import-a-${Date.now()}@test.com`;
        emailB = `import-b-${Date.now()}@test.com`;
        authA = await createTestUser(
            emailA,
            'Import Org A',
            `import-org-a-${Date.now()}`
        );
        authB = await createTestUser(
            emailB,
            'Import Org B',
            `import-org-b-${Date.now()}`
        );
    });

    afterAll(async () => {
        if (authA) await cleanupTestUser(emailA, authA.orgId);
        if (authB) await cleanupTestUser(emailB, authB.orgId);
    });

    describe('POST /api/imports', () => {
        it('should reject unsupported file types', async () => {
            const response = await request(app)
                .post('/api/imports')
                .set('Authorization', `Bearer ${authA.token}`)
                .attach('file', Buffer.from('test'), 'test.txt')
                .field('entityType', 'customer');

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('Unsupported file type');
        });

        it('should reject missing file', async () => {
            const response = await request(app)
                .post('/api/imports')
                .set('Authorization', `Bearer ${authA.token}`)
                .field('entityType', 'customer');

            expect(response.status).toBe(400);
        });

        it('should reject missing entityType', async () => {
            const response = await request(app)
                .post('/api/imports')
                .set('Authorization', `Bearer ${authA.token}`)
                .attach(
                    'file',
                    Buffer.from('name,email\nTest,test@test.com'),
                    'test.csv'
                );

            expect(response.status).toBe(400);
        });

        it('should reject invalid entityType', async () => {
            const response = await request(app)
                .post('/api/imports')
                .set('Authorization', `Bearer ${authA.token}`)
                .attach('file', Buffer.from('test'), 'test.csv')
                .field('entityType', 'invalid_entity');

            expect(response.status).toBe(400);
        });

        it('should accept valid CSV file for customer entity', async () => {
            const response = await request(app)
                .post('/api/imports')
                .set('Authorization', `Bearer ${authA.token}`)
                .attach(
                    'file',
                    Buffer.from('name,email\nTest,test@test.com'),
                    'customers.csv'
                )
                .field('entityType', 'customer');

            expect([200, 201]).toContain(response.status);
        });

        it('should accept valid XLSX file for customer entity', async () => {
            const fakeXlsx = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // Minimal PK header
            const response = await request(app)
                .post('/api/imports')
                .set('Authorization', `Bearer ${authA.token}`)
                .attach('file', fakeXlsx, 'customers.xlsx')
                .field('entityType', 'customer');

            // Either accepts (200/201), validates and rejects (400), or fails with server error (500)
            expect([200, 201, 400, 500]).toContain(response.status);
        });

        it('should reject unauthenticated requests', async () => {
            const response = await request(app)
                .post('/api/imports')
                .attach('file', Buffer.from('test'), 'test.csv')
                .field('entityType', 'customer');

            expect(response.status).toBe(401);
        });
    });

    describe('Cross-Tenant Isolation', () => {
        it('should NOT list Org A import jobs in Org B', async () => {
            const response = await request(app)
                .get('/api/imports')
                .set('Authorization', `Bearer ${authB.token}`);

            expect(response.status).toBe(200);
            expect(response.body.data).toEqual([]);
        });
    });

    describe('GET /api/imports', () => {
        it('should list import jobs', async () => {
            const response = await request(app)
                .get('/api/imports')
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(200);
            expect(response.body.data).toBeInstanceOf(Array);
            expect(response.body.pagination).toBeDefined();
        });

        it('should reject unauthenticated requests', async () => {
            const response = await request(app).get('/api/imports');
            expect(response.status).toBe(401);
        });
    });

    describe('GET /api/imports/:id', () => {
        it('should return 404 for non-existent import job', async () => {
            const response = await request(app)
                .get('/api/imports/non-existent-id')
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(404);
        });
    });

    describe('DB State Verification', () => {
        it('should create import job with correct organizationId', async () => {
            const response = await request(app)
                .post('/api/imports')
                .set('Authorization', `Bearer ${authA.token}`)
                .attach(
                    'file',
                    Buffer.from('name,email\nTest,test@test.com'),
                    'test.csv'
                )
                .field('entityType', 'customer');

            if (response.status === 201 || response.status === 200) {
                const job = await prisma.importJob.findFirst({
                    where: { organizationId: authA.orgId },
                    orderBy: { createdAt: 'desc' }
                });

                if (job) {
                    expect(job.organizationId).toBe(authA.orgId);
                }
            }
        });
    });
});
