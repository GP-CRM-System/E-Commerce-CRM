import request from 'supertest';
import { it, describe, expect, beforeAll, afterAll } from 'bun:test';
import app from '../../app.js';
import prisma from '../../config/prisma.config.js';
import { auth } from '../auth/auth.js';
import { fromNodeHeaders } from 'better-auth/node';

let authToken: string;
let testOrgId: string;

describe('Imports API', () => {
    beforeAll(async () => {
        console.log('Setting up import tests...');

        await prisma.importJob.deleteMany({
            where: { organization: { slug: { startsWith: 'import-test-org' } } }
        });
        await prisma.customer.deleteMany({
            where: { organization: { slug: { startsWith: 'import-test-org' } } }
        });
        await prisma.member.deleteMany({
            where: { user: { email: 'import-test@test.com' } }
        });
        await prisma.session.deleteMany({
            where: { user: { email: 'import-test@test.com' } }
        });
        await prisma.account.deleteMany({
            where: { user: { email: 'import-test@test.com' } }
        });
        await prisma.organization.deleteMany({
            where: { slug: { startsWith: 'import-test-org' } }
        });
        await prisma.user.deleteMany({
            where: { email: 'import-test@test.com' }
        });

        const signup = await auth.api.signUpEmail({
            body: {
                email: 'import-test@test.com',
                password: 'Password123!',
                name: 'Import Test User'
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
                name: 'Import Test Org',
                slug: 'import-test-org-' + Date.now()
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
            body: { email: 'import-test@test.com', password: 'Password123!' }
        });
        authToken = signin.token!;
        console.log('Import test setup complete');
    });

    afterAll(async () => {
        await prisma.importJobError.deleteMany({
            where: { importJob: { organizationId: testOrgId } }
        });
        await prisma.importJob.deleteMany({
            where: { organizationId: testOrgId }
        });
        await prisma.customer.deleteMany({
            where: { organizationId: testOrgId }
        });
    });

    it('should reject unsupported file types', async () => {
        const response = await request(app)
            .post('/api/imports')
            .set('Authorization', `Bearer ${authToken}`)
            .attach('file', Buffer.from('test'), 'test.txt')
            .field('entityType', 'customer');

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('Unsupported file type');
    });

    it('should list import jobs', async () => {
        const response = await request(app)
            .get('/api/imports')
            .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data).toBeArray();
        expect(response.body.pagination).toBeDefined();
    });

    it('should reject unauthenticated requests', async () => {
        const response = await request(app).get('/api/imports');
        expect(response.status).toBe(401);
    });
});
