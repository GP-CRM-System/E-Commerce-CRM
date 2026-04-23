import request from 'supertest';
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import app from '../../app.js';
import prisma from '../../config/prisma.config.js';
import { auth } from '../auth/auth.js';
import { fromNodeHeaders } from 'better-auth/node';
import { DEFAULT_ROLES } from '../../config/roles.config.js';

interface CreateOrgResponse {
    organization?: { id: string };
    id?: string;
}

interface CreateInvitationResponse {
    id?: string;
    invitation?: { id: string };
}

let adminToken: string;
let adminUserId: string;
let adminOrgId: string;
let memberToken: string;
let memberUserId: string;

describe('Audit API', () => {
    beforeAll(async () => {
        // Cleanup first
        await prisma.auditLog.deleteMany({
            where: { organization: { slug: { startsWith: 'audit-test' } } }
        });
        await prisma.organizationRole.deleteMany({
            where: { organization: { slug: { startsWith: 'audit-test' } } }
        });
        await prisma.member.deleteMany({
            where: { user: { email: { startsWith: 'audit-test' } } }
        });
        await prisma.session.deleteMany({
            where: { user: { email: { startsWith: 'audit-test' } } }
        });
        await prisma.account.deleteMany({
            where: { user: { email: { startsWith: 'audit-test' } } }
        });
        await prisma.user.deleteMany({
            where: { email: { startsWith: 'audit-test' } }
        });
        await prisma.organization.deleteMany({
            where: { slug: { startsWith: 'audit-test' } }
        });

        // Create admin user and org (this will be the organization owner)
        const adminSignup = await auth.api.signUpEmail({
            body: {
                email: 'audit-test-admin@test.com',
                password: 'Password123!',
                name: 'Audit Test Admin'
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
                name: 'Audit Test Org',
                slug: 'audit-test-org-' + Date.now()
            }
        });
        adminOrgId =
            (adminOrg as CreateOrgResponse).organization?.id ??
            (adminOrg as CreateOrgResponse).id ??
            '';

        // Seed default roles - ensure 'member' role doesn't have reports:read
        for (const [roleName, permissions] of Object.entries(DEFAULT_ROLES)) {
            await prisma.organizationRole.create({
                data: {
                    organizationId: adminOrgId,
                    role: roleName,
                    permission: JSON.stringify(permissions)
                }
            });
        }

        // Create member user
        const memberSignup = await auth.api.signUpEmail({
            body: {
                email: 'audit-test-member@test.com',
                password: 'Password123!',
                name: 'Audit Test Member'
            }
        });
        memberUserId = memberSignup.user.id;
        memberToken = memberSignup.token!;

        await prisma.user.update({
            where: { id: memberUserId },
            data: { emailVerified: true }
        });

        // Invite member to admin's org with 'member' role
        const invite = await auth.api.createInvitation({
            headers: fromNodeHeaders({ authorization: `Bearer ${adminToken}` }),
            body: {
                email: 'audit-test-member@test.com',
                role: 'member',
                organizationId: adminOrgId
            }
        });

        // Accept the invitation
        const inviteId =
            (invite as CreateInvitationResponse).id ??
            (invite as CreateInvitationResponse).invitation?.id;
        if (!inviteId) throw new Error('Failed to get invitation ID');

        await auth.api.acceptInvitation({
            headers: fromNodeHeaders({
                authorization: `Bearer ${memberToken}`
            }),
            body: { invitationId: inviteId }
        });

        // Sign in member again to get updated token with org context
        const memberSignin = await auth.api.signInEmail({
            body: {
                email: 'audit-test-member@test.com',
                password: 'Password123!'
            }
        });
        memberToken = memberSignin.token!;
    });

    afterAll(async () => {
        await prisma.auditLog.deleteMany({
            where: { organizationId: adminOrgId }
        });
        await prisma.organizationRole.deleteMany({
            where: { organizationId: adminOrgId }
        });
        await prisma.member.deleteMany({
            where: { userId: { in: [adminUserId, memberUserId] } }
        });
        await prisma.session.deleteMany({
            where: { user: { email: { startsWith: 'audit-test' } } }
        });
        await prisma.account.deleteMany({
            where: { user: { email: { startsWith: 'audit-test' } } }
        });
        await prisma.user.deleteMany({
            where: { email: { startsWith: 'audit-test' } }
        });
        await prisma.organization.deleteMany({
            where: { id: adminOrgId }
        });
    });

    test('GET /api/audit-logs - should require authentication', async () => {
        const response = await request(app).get('/api/audit-logs');
        expect(response.status).toBe(401);
    });

    test('GET /api/audit-logs - should reject member without reports:read permission', async () => {
        const response = await request(app)
            .get('/api/audit-logs')
            .set('Authorization', `Bearer ${memberToken}`);
        expect(response.status).toBe(403);
    });

    test('GET /api/audit-logs - should allow access with reports:read permission', async () => {
        const response = await request(app)
            .get('/api/audit-logs')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
    });
});
