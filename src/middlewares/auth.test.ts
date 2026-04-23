import request from 'supertest';
import { it, describe, expect, beforeAll, afterAll } from 'bun:test';
import app from '../app.js';
import prisma from '../config/prisma.config.js';
import { auth } from '../api/auth/auth.js';
import { fromNodeHeaders } from 'better-auth/node';

let authToken: string;
let testOrgId: string;

describe('Auth Middleware', () => {
    beforeAll(async () => {
        const testEmail = 'auth-mw-test@test.com';

        await prisma.session.deleteMany({
            where: { user: { email: testEmail } }
        });
        await prisma.member.deleteMany({
            where: { user: { email: testEmail } }
        });
        await prisma.user.deleteMany({ where: { email: testEmail } });
        await prisma.organization.deleteMany({
            where: { name: 'Auth MW Test Org' }
        });

        const signup = await auth.api.signUpEmail({
            body: {
                email: testEmail,
                password: 'Password123!',
                name: 'Auth MW User'
            }
        });

        authToken = signup!.token!;

        await prisma.user.update({
            where: { id: signup!.user.id },
            data: { emailVerified: true }
        });

        const org = await auth.api.createOrganization({
            headers: fromNodeHeaders({ authorization: `Bearer ${authToken}` }),
            body: {
                name: 'Auth MW Test Org',
                slug: 'auth-mw-test-org-' + Date.now()
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
            body: { email: testEmail, password: 'Password123!' }
        });
        authToken = signin.token!;
    });

    afterAll(async () => {
        const testEmail = 'auth-mw-test@test.com';
        await prisma.session.deleteMany({ where: { user: { email: testEmail } } });
        await prisma.member.deleteMany({ where: { user: { email: testEmail } } });
        await prisma.user.deleteMany({ where: { email: testEmail } });
        await prisma.organization.deleteMany({
            where: { slug: { startsWith: 'auth-mw-test-org' } }
        });
        await prisma.account.deleteMany({ where: { user: { email: testEmail } } });
    });

    describe('protect', () => {
        it('should allow authenticated request', async () => {
            const response = await request(app)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
        });

        it('should reject unauthenticated request', async () => {
            const response = await request(app).get('/api/auth/me');
            expect(response.status).toBe(401);
        });
    });

    describe('requirePermission', () => {
        it('should allow request with correct permission', async () => {
            // customers:read is granted to 'admin' (which creator of org has)
            const response = await request(app)
                .get('/api/customers')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
        });

        it('should reject request without active organization', async () => {
            const noOrgEmail = 'no-org-' + Date.now() + '@test.com';
            
            // Create a new user without an active org
            const signup = await auth.api.signUpEmail({
                body: {
                    email: noOrgEmail,
                    password: 'Password123!',
                    name: 'No Org User'
                }
            });

            const response = await request(app)
                .get('/api/customers')
                .set('Authorization', `Bearer ${signup!.token}`);

            expect(response.status).toBe(403);

            // Cleanup
            await prisma.session.deleteMany({ where: { user: { email: noOrgEmail } } });
            await prisma.account.deleteMany({ where: { user: { email: noOrgEmail } } });
            await prisma.user.delete({ where: { email: noOrgEmail } });
        });
    });
});
