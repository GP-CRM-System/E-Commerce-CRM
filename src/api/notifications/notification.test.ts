import request from 'supertest';
import { it, describe, expect, beforeAll, afterAll } from 'bun:test';
import app from '../../app.js';
import prisma from '../../config/prisma.config.js';
import { auth } from '../auth/auth.js';
import { fromNodeHeaders } from 'better-auth/node';

let authToken: string;
let testOrgId: string;

describe('Notifications API', () => {
    beforeAll(async () => {
        await prisma.notification.deleteMany({
            where: { organization: { slug: { startsWith: 'notif-test-org' } } }
        });
        await prisma.member.deleteMany({
            where: { user: { email: 'notif-test@test.com' } }
        });
        await prisma.session.deleteMany({
            where: { user: { email: 'notif-test@test.com' } }
        });
        await prisma.account.deleteMany({
            where: { user: { email: 'notif-test@test.com' } }
        });
        await prisma.organization.deleteMany({
            where: { slug: { startsWith: 'notif-test-org' } }
        });
        await prisma.user.deleteMany({
            where: { email: 'notif-test@test.com' }
        });

        const signup = await auth.api.signUpEmail({
            body: {
                email: 'notif-test@test.com',
                password: 'Password123!',
                name: 'Notification Test User'
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
                name: 'Notification Test Org',
                slug: 'notif-test-org-' + Date.now()
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
            body: { email: 'notif-test@test.com', password: 'Password123!' }
        });
        authToken = signin.token!;
    });

    afterAll(async () => {
        await prisma.notification.deleteMany({
            where: { organizationId: testOrgId }
        });
        await prisma.member.deleteMany({
            where: { organizationId: testOrgId }
        });
        await prisma.organization.deleteMany({
            where: { id: testOrgId }
        });
        await prisma.session.deleteMany({
            where: { user: { email: 'notif-test@test.com' } }
        });
        await prisma.account.deleteMany({
            where: { user: { email: 'notif-test@test.com' } }
        });
        await prisma.user.deleteMany({
            where: { email: 'notif-test@test.com' }
        });
    });

    const createTestNotification = async () => {
        const { createNotification } =
            await import('./notification.service.js');
        return createNotification({
            type: 'import_completed',
            title: 'Test Notification',
            message: 'This is a test notification',
            organizationId: testOrgId
        });
    };

    it('should list notifications (empty)', async () => {
        const response = await request(app)
            .get('/api/notifications')
            .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data).toBeDefined();
    });

    it('should create notification via service', async () => {
        const notification = await createTestNotification();

        expect(notification.id).toBeDefined();
        expect(notification.type).toBe('import_completed');
        expect(notification.read).toBe(false);
    });

    it('should get notification by id', async () => {
        const created = await createTestNotification();

        const response = await request(app)
            .get(`/api/notifications/${created.id}`)
            .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data.id).toBe(created.id);
    });

    it('should mark notification as read', async () => {
        const created = await createTestNotification();

        const response = await request(app)
            .patch(`/api/notifications/${created.id}/read`)
            .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data.read).toBe(true);
    });

    it('should mark all notifications as read', async () => {
        const notification = await createTestNotification();
        expect(notification.id).toBeDefined();

        const response = await request(app)
            .post('/api/notifications/mark-all-read')
            .set('Authorization', `Bearer ${authToken}`)
            .send({});

        expect(response.status).toBe(200);
    });

    it('should delete notification', async () => {
        const created = await createTestNotification();

        const response = await request(app)
            .delete(`/api/notifications/${created.id}`)
            .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(204);
    });

    it('should filter notifications by type', async () => {
        const response = await request(app)
            .get('/api/notifications?type=import_completed')
            .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
    });

    it('should get unread count', async () => {
        const response = await request(app)
            .get('/api/notifications/unread-count')
            .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
    });

    it('should return 401 without auth', async () => {
        const response = await request(app).get('/api/notifications');
        expect(response.status).toBe(401);
    });
});
