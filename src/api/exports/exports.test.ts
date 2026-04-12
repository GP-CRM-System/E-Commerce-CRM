import request from 'supertest';
import { it, describe, expect, beforeAll, afterAll } from 'bun:test';
import app from '../../app.js';
import prisma from '../../config/prisma.config.js';
import { auth } from '../auth/auth.js';
import { fromNodeHeaders } from 'better-auth/node';

let authToken: string;
let testOrgId: string;

describe('Exports API', () => {
    beforeAll(async () => {
        await prisma.exportJob.deleteMany({
            where: { organization: { slug: { startsWith: 'test-export-org' } } }
        });
        await prisma.customer.deleteMany({
            where: { organization: { slug: { startsWith: 'test-export-org' } } }
        });
        await prisma.member.deleteMany({
            where: { user: { email: 'export-test@test.com' } }
        });
        await prisma.session.deleteMany({
            where: { user: { email: 'export-test@test.com' } }
        });
        await prisma.account.deleteMany({
            where: { user: { email: 'export-test@test.com' } }
        });
        await prisma.organization.deleteMany({
            where: { slug: { startsWith: 'test-export-org' } }
        });
        await prisma.user.deleteMany({
            where: { email: 'export-test@test.com' }
        });

        const signup = await auth.api.signUpEmail({
            body: {
                email: 'export-test@test.com',
                password: 'Password123!',
                name: 'Export Test User'
            }
        });

        if (!signup) throw new Error('Signup failed');
        authToken = signup.token!;

        const testUserId = signup.user.id;
        await prisma.user.update({
            where: { id: testUserId },
            data: { emailVerified: true }
        });

        const org = await auth.api.createOrganization({
            headers: fromNodeHeaders({ authorization: `Bearer ${authToken}` }),
            body: {
                name: 'Export Test Org',
                slug: 'test-export-org-' + Date.now()
            }
        });

        const orgResponse = org as {
            organization?: { id: string };
            id?: string;
        };
        testOrgId = orgResponse.organization?.id ?? orgResponse.id ?? '';

        await auth.api.setActiveOrganization({
            headers: fromNodeHeaders({ authorization: `Bearer ${authToken}` }),
            body: { organizationId: testOrgId }
        });

        const signin = await auth.api.signInEmail({
            body: { email: 'export-test@test.com', password: 'Password123!' }
        });
        authToken = signin.token!;

        await prisma.customer.createMany({
            data: [
                {
                    name: 'Customer 1',
                    email: 'c1@test.com',
                    organizationId: testOrgId,
                    createdAt: new Date(),
                    updatedAt: new Date()
                },
                {
                    name: 'Customer 2',
                    email: 'c2@test.com',
                    organizationId: testOrgId,
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            ]
        });
    });

    afterAll(async () => {
        await prisma.exportJob.deleteMany({
            where: { organizationId: testOrgId }
        });
        await prisma.customer.deleteMany({
            where: { organizationId: testOrgId }
        });
    });

    it('should create an export job', async () => {
        const response = await request(app)
            .post('/api/exports')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
                entityType: 'customer',
                format: 'csv',
                selectedColumns: ['name', 'email']
            });

        expect(response.status).toBe(201);
        expect(response.body.data).toBeDefined();
        expect(response.body.data.status).toBe('PENDING');
    });

    it('should list export jobs', async () => {
        const response = await request(app)
            .get('/api/exports')
            .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data).toBeArray();
        expect(response.body.pagination).toBeDefined();
    });

    it('should get an export job', async () => {
        const createResponse = await request(app)
            .post('/api/exports')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
                entityType: 'customer',
                format: 'csv'
            });

        const jobId = createResponse.body.data.id;

        const response = await request(app)
            .get(`/api/exports/${jobId}`)
            .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data.id).toBe(jobId);
    });

    it('should reject invalid entity type', async () => {
        const response = await request(app)
            .post('/api/exports')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
                entityType: 'invalid',
                format: 'csv'
            });

        expect(response.status).toBe(400);
    });

    it('should reject invalid format', async () => {
        const response = await request(app)
            .post('/api/exports')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
                entityType: 'customer',
                format: 'invalid'
            });

        expect(response.status).toBe(400);
    });

    it('should reject unauthenticated requests', async () => {
        const response = await request(app).get('/api/exports');
        expect(response.status).toBe(401);
    });
});
