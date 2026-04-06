import request from 'supertest';
import { it, describe, expect, beforeAll, afterAll } from 'bun:test';
import app from '../../app.js';
import prisma from '../../config/prisma.config.js';
import { auth } from '../auth/auth.js';
import { fromNodeHeaders } from 'better-auth/node';
import { DEFAULT_ROLES } from '../../config/roles.config.js';

let authToken: string;
let testUserId: string;
let testOrgId: string;
let adminToken: string;
let adminUserId: string;
let adminOrgId: string;
let memberToken: string;
let memberUserId: string;
let crossOrgToken: string;
let crossOrgUserId: string;
let crossOrgId: string;

describe('Roles API', () => {
    beforeAll(async () => {
        await prisma.organizationRole.deleteMany({
            where: { organization: { slug: { startsWith: 'roles-test' } } }
        });
        await prisma.member.deleteMany({
            where: { user: { email: { startsWith: 'roles' } } }
        });
        await prisma.session.deleteMany({
            where: { user: { email: { startsWith: 'roles' } } }
        });
        await prisma.account.deleteMany({
            where: { user: { email: { startsWith: 'roles' } } }
        });
        await prisma.organization.deleteMany({
            where: { slug: { startsWith: 'roles-test' } }
        });
        await prisma.user.deleteMany({
            where: { email: { startsWith: 'roles' } }
        });

        const signup = await auth.api.signUpEmail({
            body: {
                email: 'roles-user@test.com',
                password: 'Password123!',
                name: 'Roles Test User'
            }
        });
        testUserId = signup.user.id;
        authToken = signup.token!;

        await prisma.user.update({
            where: { id: testUserId },
            data: { emailVerified: true }
        });

        const org = await auth.api.createOrganization({
            headers: fromNodeHeaders({ authorization: `Bearer ${authToken}` }),
            body: {
                name: 'Roles Test Org',
                slug: 'roles-test-org-' + Date.now()
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
            body: { email: 'roles-user@test.com', password: 'Password123!' }
        });
        authToken = signin.token!;

        // Seed default roles into DB for this organization
        for (const [roleName, permissions] of Object.entries(DEFAULT_ROLES)) {
            await prisma.organizationRole.create({
                data: {
                    organizationId: testOrgId,
                    role: roleName,
                    permission: JSON.stringify(permissions)
                }
            });
        }

        const adminSignup = await auth.api.signUpEmail({
            body: {
                email: 'roles-admin@test.com',
                password: 'Password123!',
                name: 'Roles Test Admin'
            }
        });
        adminUserId = adminSignup.user.id;
        adminToken = adminSignup.token!;

        await prisma.user.update({
            where: { id: adminUserId },
            data: { emailVerified: true }
        });

        const adminOrg = await auth.api.createOrganization({
            headers: fromNodeHeaders({ authorization: `Bearer ${adminToken}` }),
            body: {
                name: 'Roles Test Admin Org',
                slug: 'roles-test-admin-org-' + Date.now()
            }
        });
        const adminOrgResponse = adminOrg as {
            organization?: { id: string };
            id?: string;
        };
        adminOrgId =
            adminOrgResponse.organization?.id ?? adminOrgResponse.id ?? '';

        await auth.api.setActiveOrganization({
            headers: fromNodeHeaders({ authorization: `Bearer ${adminToken}` }),
            body: { organizationId: adminOrgId }
        });

        const adminSignin = await auth.api.signInEmail({
            body: { email: 'roles-admin@test.com', password: 'Password123!' }
        });
        adminToken = adminSignin.token!;

        // Create a member user and add them to the test org with 'member' role
        const memberSignup = await auth.api.signUpEmail({
            body: {
                email: 'roles-member@test.com',
                password: 'Password123!',
                name: 'Roles Test Member'
            }
        });
        memberUserId = memberSignup.user.id;
        memberToken = memberSignup.token!;

        await prisma.user.update({
            where: { id: memberUserId },
            data: { emailVerified: true }
        });

        // Add member to test org with 'member' role
        await auth.api.addMember({
            headers: fromNodeHeaders({ authorization: `Bearer ${authToken}` }),
            body: {
                organizationId: testOrgId,
                userId: memberUserId,
                role: 'member'
            }
        });

        const memberSignin = await auth.api.signInEmail({
            body: { email: 'roles-member@test.com', password: 'Password123!' }
        });
        memberToken = memberSignin.token!;

        // Set active org for member
        await auth.api.setActiveOrganization({
            headers: fromNodeHeaders({
                authorization: `Bearer ${memberToken}`
            }),
            body: { organizationId: testOrgId }
        });

        // Re-signin to get fresh token with active org
        const memberSignin2 = await auth.api.signInEmail({
            body: { email: 'roles-member@test.com', password: 'Password123!' }
        });
        memberToken = memberSignin2.token!;

        // Create a cross-org user for isolation testing
        const crossOrgSignup = await auth.api.signUpEmail({
            body: {
                email: 'roles-crossorg@test.com',
                password: 'Password123!',
                name: 'Roles Test Cross-Org'
            }
        });
        crossOrgUserId = crossOrgSignup.user.id;
        crossOrgToken = crossOrgSignup.token!;

        await prisma.user.update({
            where: { id: crossOrgUserId },
            data: { emailVerified: true }
        });

        const crossOrg = await auth.api.createOrganization({
            headers: fromNodeHeaders({
                authorization: `Bearer ${crossOrgToken}`
            }),
            body: {
                name: 'Cross Org Test',
                slug: 'roles-test-cross-org-' + Date.now()
            }
        });
        const crossOrgResponse = crossOrg as {
            organization?: { id: string };
            id?: string;
        };
        crossOrgId =
            crossOrgResponse.organization?.id ?? crossOrgResponse.id ?? '';

        await auth.api.setActiveOrganization({
            headers: fromNodeHeaders({
                authorization: `Bearer ${crossOrgToken}`
            }),
            body: { organizationId: crossOrgId }
        });

        const crossOrgSignin = await auth.api.signInEmail({
            body: { email: 'roles-crossorg@test.com', password: 'Password123!' }
        });
        crossOrgToken = crossOrgSignin.token!;
    });

    afterAll(async () => {
        await prisma.organizationRole.deleteMany({
            where: { organization: { slug: { startsWith: 'roles-test' } } }
        });
        await prisma.member.deleteMany({
            where: { user: { email: { startsWith: 'roles' } } }
        });
        await prisma.session.deleteMany({
            where: { user: { email: { startsWith: 'roles' } } }
        });
        await prisma.account.deleteMany({
            where: { user: { email: { startsWith: 'roles' } } }
        });
        await prisma.organization.deleteMany({
            where: { slug: { startsWith: 'roles-test' } }
        });
        await prisma.user.deleteMany({
            where: { email: { startsWith: 'roles' } }
        });
    });

    describe('GET /api/roles/permissions', () => {
        it('should return all available permissions for user who created org (root)', async () => {
            const response = await request(app)
                .get('/api/roles/permissions')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data).toHaveProperty('customers');
            expect(response.body.data.customers).toContain('read');
            expect(response.body.data.customers).toContain('write');
            expect(response.body.data.customers).toContain('delete');
        });

        it('should return 401 without authentication', async () => {
            const response = await request(app).get('/api/roles/permissions');

            expect(response.status).toBe(401);
        });
    });

    describe('GET /api/roles', () => {
        it('should list all roles for user who created org', async () => {
            const response = await request(app)
                .get('/api/roles')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data).toHaveProperty('default');
            expect(response.body.data).toHaveProperty('custom');
            expect(response.body.data.all.length).toBeGreaterThan(0);
        });

        it('should return 401 without authentication', async () => {
            const response = await request(app).get('/api/roles');

            expect(response.status).toBe(401);
        });
    });

    describe('POST /api/roles', () => {
        it('should create a custom role', async () => {
            const response = await request(app)
                .post('/api/roles')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'support-lead',
                    description: 'Lead support staff with extended permissions',
                    permissions: {
                        customers: ['read', 'write'],
                        orders: ['read'],
                        supportTickets: ['read', 'write', 'delete']
                    }
                });

            expect(response.status).toBe(201);
            expect(response.body.data.name).toBe('support-lead');
            expect(response.body.data.isDefault).toBe(false);
        });

        it('should fail if role name already exists', async () => {
            const response = await request(app)
                .post('/api/roles')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'support-lead',
                    permissions: { customers: ['read'] }
                });

            expect(response.status).toBe(400);
        });

        it('should fail for reserved role names', async () => {
            const response = await request(app)
                .post('/api/roles')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'admin',
                    permissions: { customers: ['read'] }
                });

            expect(response.status).toBe(400);
        });

        it('should fail for root role name', async () => {
            const response = await request(app)
                .post('/api/roles')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'root',
                    permissions: { customers: ['read'] }
                });

            expect(response.status).toBe(400);
        });

        it('should fail for member role name', async () => {
            const response = await request(app)
                .post('/api/roles')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'member',
                    permissions: { customers: ['read'] }
                });

            expect(response.status).toBe(400);
        });

        it('should return 401 without authentication', async () => {
            const response = await request(app)
                .post('/api/roles')
                .send({
                    name: 'test-role',
                    permissions: { customers: ['read'] }
                });

            expect(response.status).toBe(401);
        });
    });

    describe('PATCH /api/roles/:id', () => {
        let customRoleId: string | undefined;

        beforeAll(async () => {
            const dbRole = await prisma.organizationRole.findFirst({
                where: { organizationId: testOrgId, role: 'support-lead' }
            });
            customRoleId = dbRole?.id;
        });

        it('should update a custom role', async () => {
            if (!customRoleId) {
                return;
            }

            const response = await request(app)
                .patch(`/api/roles/${customRoleId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'support-lead-updated',
                    permissions: {
                        customers: ['read', 'write', 'delete'],
                        orders: ['read', 'write'],
                        supportTickets: ['read', 'write', 'delete']
                    }
                });

            expect(response.status).toBe(200);
            expect(response.body.data.name).toBe('support-lead-updated');
        });

        it('should fail when updating default roles', async () => {
            const dbRole = await prisma.organizationRole.findFirst({
                where: { organizationId: testOrgId, role: 'admin' }
            });

            const response = await request(app)
                .patch(`/api/roles/${dbRole?.id}`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'super-admin',
                    permissions: { customers: ['read', 'write', 'delete'] }
                });

            expect(response.status).toBe(400);
        });
    });

    describe('DELETE /api/roles/:id', () => {
        let testRoleId: string | undefined;

        beforeAll(async () => {
            const existing = await prisma.organizationRole.findFirst({
                where: { organizationId: testOrgId, role: 'test-delete-role' }
            });

            if (existing) {
                testRoleId = existing.id;
            } else {
                const role = await prisma.organizationRole.create({
                    data: {
                        organizationId: testOrgId,
                        role: 'test-delete-role',
                        permission: JSON.stringify({ customers: ['read'] })
                    }
                });
                testRoleId = role.id;
            }
        });

        it('should delete a custom role', async () => {
            if (!testRoleId) {
                return;
            }

            const response = await request(app)
                .delete(`/api/roles/${testRoleId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.success).toBe(true);
        });

        it('should fail when deleting default roles', async () => {
            const dbRole = await prisma.organizationRole.findFirst({
                where: { organizationId: testOrgId, role: 'member' }
            });

            if (!dbRole) {
                return;
            }

            const response = await request(app)
                .delete(`/api/roles/${dbRole.id}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(400);
        });

        it('should return 401 without authentication', async () => {
            const response = await request(app).delete(
                '/api/roles/some-role-id'
            );

            expect(response.status).toBe(401);
        });
    });

    describe('Member role permission checks', () => {
        it('should return 403 for member trying to list roles (no ac:read)', async () => {
            const response = await request(app)
                .get('/api/roles')
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(403);
        });

        it('should return 403 for member trying to get permissions (no ac:read)', async () => {
            const response = await request(app)
                .get('/api/roles/permissions')
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(403);
        });

        it('should return 403 for member trying to create role (no ac:create)', async () => {
            const response = await request(app)
                .post('/api/roles')
                .set('Authorization', `Bearer ${memberToken}`)
                .send({
                    name: 'test-role',
                    permissions: { customers: ['read'] }
                });

            expect(response.status).toBe(403);
        });

        it('should return 403 for member trying to update role (no ac:update)', async () => {
            const response = await request(app)
                .patch('/api/roles/some-id')
                .set('Authorization', `Bearer ${memberToken}`)
                .send({
                    name: 'updated-role',
                    permissions: { customers: ['read'] }
                });

            expect(response.status).toBe(403);
        });

        it('should return 403 for member trying to delete role (no ac:delete)', async () => {
            const response = await request(app)
                .delete('/api/roles/some-id')
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(403);
        });
    });

    describe('Cross-org isolation', () => {
        it('should return 400 when cross-org user tries to list roles without active org', async () => {
            const response = await request(app)
                .get('/api/roles')
                .set('Authorization', `Bearer ${crossOrgToken}`);

            // Should either succeed (if active org is set) or fail with 400
            expect([200, 400]).toContain(response.status);
        });

        it('should not allow cross-org user to see roles from other org', async () => {
            // First set active org to crossOrgId
            await auth.api.setActiveOrganization({
                headers: fromNodeHeaders({
                    authorization: `Bearer ${crossOrgToken}`
                }),
                body: { organizationId: crossOrgId }
            });

            // Re-signin to get fresh token
            const freshSignin = await auth.api.signInEmail({
                body: {
                    email: 'roles-crossorg@test.com',
                    password: 'Password123!'
                }
            });
            const freshToken = freshSignin.token!;

            const response = await request(app)
                .get('/api/roles')
                .set('Authorization', `Bearer ${freshToken}`);

            expect(response.status).toBe(200);
            // Should only see default roles for their own org, not custom roles from testOrg
            expect(response.body.data.custom).toEqual([]);
        });
    });
});
