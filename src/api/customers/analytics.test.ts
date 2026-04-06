import request from 'supertest';
import { it, describe, expect, beforeAll, afterAll } from 'bun:test';
import app from '../../app.js';
import prisma from '../../config/prisma.config.js';
import { auth } from '../auth/auth.js';
import { fromNodeHeaders } from 'better-auth/node';

let authToken: string;
let testOrgId: string;
let testCustomerId: string;

describe('Customer Analytics API', () => {
    beforeAll(async () => {
        await prisma.customer.deleteMany({
            where: {
                organization: { slug: { startsWith: 'analytics-test-org' } }
            }
        });
        await prisma.order.deleteMany({
            where: {
                organization: { slug: { startsWith: 'analytics-test-org' } }
            }
        });
        await prisma.member.deleteMany({
            where: { user: { email: 'analytics-test@test.com' } }
        });
        await prisma.session.deleteMany({
            where: { user: { email: 'analytics-test@test.com' } }
        });
        await prisma.account.deleteMany({
            where: { user: { email: 'analytics-test@test.com' } }
        });
        await prisma.organization.deleteMany({
            where: { slug: { startsWith: 'analytics-test-org' } }
        });
        await prisma.user.deleteMany({
            where: { email: 'analytics-test@test.com' }
        });

        const signup = await auth.api.signUpEmail({
            body: {
                email: 'analytics-test@test.com',
                password: 'Password123!',
                name: 'Analytics Test User'
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
                name: 'Analytics Test Org',
                slug: 'analytics-test-org-' + Date.now()
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
            body: { email: 'analytics-test@test.com', password: 'Password123!' }
        });
        authToken = signin.token!;

        const customer = await prisma.customer.create({
            data: {
                name: 'RFM Test Customer',
                email: 'rfm-test@example.com',
                organizationId: testOrgId,
                totalOrders: 15,
                totalSpent: 2500,
                lastOrderAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                avgDaysBetweenOrders: 20,
                createdAt: new Date(),
                updatedAt: new Date()
            }
        });
        testCustomerId = customer.id;
    });

    afterAll(async () => {
        await prisma.customerEvent.deleteMany({
            where: { customer: { organizationId: testOrgId } }
        });
        await prisma.orderItem.deleteMany({
            where: { order: { organizationId: testOrgId } }
        });
        await prisma.order.deleteMany({
            where: { organizationId: testOrgId }
        });
        await prisma.customer.deleteMany({
            where: { organizationId: testOrgId }
        });
    });

    it('should trigger RFM computation job', async () => {
        const response = await request(app)
            .post('/api/customers/analytics/compute')
            .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(300);
    });

    it('should get RFM distribution', async () => {
        const response = await request(app)
            .get('/api/customers/analytics/rfm')
            .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data).toHaveProperty('distribution');
        expect(response.body.data).toHaveProperty('total');
        expect(response.body.data).toHaveProperty('lastUpdated');
    });

    it('should get customer analytics', async () => {
        const response = await request(app)
            .get(`/api/customers/${testCustomerId}/analytics`)
            .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data).toHaveProperty('customer');
        expect(response.body.data).toHaveProperty('rfm');
        expect(response.body.data).toHaveProperty('churnRisk');
        expect(response.body.data).toHaveProperty('metrics');
        expect(response.body.data.rfm).toHaveProperty('score');
        expect(response.body.data.rfm).toHaveProperty('segment');
    });

    it('should return 404 for non-existent customer analytics', async () => {
        const response = await request(app)
            .get('/api/customers/non-existent-id/analytics')
            .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(404);
    });

    it('should reject unauthenticated requests to RFM stats', async () => {
        const response = await request(app).get('/api/customers/analytics/rfm');
        expect(response.status).toBe(401);
    });

    it('should reject unauthenticated requests to customer analytics', async () => {
        const response = await request(app).get(
            `/api/customers/${testCustomerId}/analytics`
        );
        expect(response.status).toBe(401);
    });

    it('should reject unauthenticated requests to compute RFM', async () => {
        const response = await request(app).post(
            '/api/customers/analytics/compute'
        );
        expect(response.status).toBe(401);
    });
});
