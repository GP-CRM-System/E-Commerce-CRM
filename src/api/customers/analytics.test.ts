import request from 'supertest';
import { it, describe, expect, beforeAll, afterAll } from 'bun:test';
import app from '../../app.js';
import prisma from '../../config/prisma.config.js';
import { auth } from '../auth/auth.js';
import { fromNodeHeaders } from 'better-auth/node';

let authToken: string;
let testOrgId: string;
let testCustomerId: string;
let testUserId: string;

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

        testUserId = signup.user.id;
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
        if (!testOrgId) throw new Error('Failed to create organization');

        await auth.api.setActiveOrganization({
            headers: fromNodeHeaders({ authorization: `Bearer ${authToken}` }),
            body: { organizationId: testOrgId }
        });

        const signin = await auth.api.signInEmail({
            body: { email: 'analytics-test@test.com', password: 'Password123!' }
        });
        if (!signin?.token) throw new Error('Signin failed');
        authToken = signin.token;

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
        await prisma.member.deleteMany({
            where: { organizationId: testOrgId }
        });
        await prisma.session.deleteMany({
            where: { userId: testUserId }
        });
        await prisma.organizationRole.deleteMany({
            where: { organizationId: testOrgId }
        });
        await prisma.organization.deleteMany({
            where: { slug: { startsWith: 'analytics-test-org' } }
        });
        await prisma.user.deleteMany({
            where: { id: testUserId }
        });
    });

    it('should trigger RFM computation job', async () => {
        const response = await request(app)
            .post('/api/customers/analytics/compute')
            .set('Authorization', `Bearer ${authToken}`);

        expect([200, 202]).toContain(response.status);
        expect(response.body).toHaveProperty('data');
    });

    it('should get RFM distribution with correct value ranges', async () => {
        const response = await request(app)
            .get('/api/customers/analytics/rfm')
            .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data).toHaveProperty('distribution');
        expect(response.body.data).toHaveProperty('total');
        expect(response.body.data).toHaveProperty('lastUpdated');

        // Verify distribution is an array with proper structure
        const distribution = response.body.data.distribution;
        expect(Array.isArray(distribution)).toBe(true);

        // Verify each segment entry has required fields and valid values
        const validSegments = [
            'CHAMPIONS',
            'LOYAL_CUSTOMERS',
            'POTENTIAL_LOYALISTS',
            'AT_RISK',
            'CANT_LOSE_THEM',
            'NEW_CUSTOMERS',
            'LOST',
            'NEEDS_ATTENTION'
        ];

        distribution.forEach(
            (segment: {
                segment: string;
                count: number;
                percentage: number;
            }) => {
                expect(segment).toHaveProperty('segment');
                expect(segment).toHaveProperty('count');
                expect(segment).toHaveProperty('percentage');
                expect(typeof segment.segment).toBe('string');
                expect(typeof segment.count).toBe('number');
                expect(typeof segment.percentage).toBe('number');
                expect(segment.count).toBeGreaterThanOrEqual(0);
                expect(segment.percentage).toBeGreaterThanOrEqual(0);
                expect(segment.percentage).toBeLessThanOrEqual(100);
                // Verify segment name is valid
                expect(validSegments).toContain(segment.segment);
            }
        );

        // Verify total matches count of customers with segments
        const totalFromDistribution = distribution.reduce(
            (sum: number, s: { count: number }) => sum + s.count,
            0
        );
        expect(response.body.data.total).toBe(totalFromDistribution);
    });

    it('should get customer analytics with correct value ranges', async () => {
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
        expect(response.body.data.rfm).toHaveProperty('recency');
        expect(response.body.data.rfm).toHaveProperty('frequency');
        expect(response.body.data.rfm).toHaveProperty('monetary');

        // Verify RFM score is valid format (3-char string like '111', '555', etc.)
        const rfmScore = response.body.data.rfm.score;
        expect(typeof rfmScore).toBe('string');
        expect(rfmScore).toMatch(/^[1-5]{3}$/); // Exactly 3 digits, each 1-5

        // Verify individual RFM components are in valid range (1-5)
        const recency = response.body.data.rfm.recency;
        const frequency = response.body.data.rfm.frequency;
        const monetary = response.body.data.rfm.monetary;

        expect(recency).toBeGreaterThanOrEqual(1);
        expect(recency).toBeLessThanOrEqual(5);
        expect(frequency).toBeGreaterThanOrEqual(1);
        expect(frequency).toBeLessThanOrEqual(5);
        expect(monetary).toBeGreaterThanOrEqual(1);
        expect(monetary).toBeLessThanOrEqual(5);

        // Verify churn risk score is valid (0-1) or null
        const churnRiskScore = response.body.data.churnRisk.score;
        if (churnRiskScore !== null) {
            expect(churnRiskScore).toBeGreaterThanOrEqual(0);
            expect(churnRiskScore).toBeLessThanOrEqual(1);
        }

        // Verify churn risk level is valid
        const churnRiskLevel = response.body.data.churnRisk.level;
        expect(['LOW', 'MEDIUM', 'HIGH']).toContain(churnRiskLevel);
    });

    it('should verify idempotency of analytics compute job', async () => {
        // Get RFM before running compute
        const beforeResponse = await request(app)
            .get('/api/customers/analytics/rfm')
            .set('Authorization', `Bearer ${authToken}`);

        expect(beforeResponse.status).toBe(200);

        // Trigger compute job
        const response1 = await request(app)
            .post('/api/customers/analytics/compute')
            .set('Authorization', `Bearer ${authToken}`);

        expect([200, 202]).toContain(response1.status);
        expect(response1.body.data).toHaveProperty('processed');

        const processed1 = response1.body.data.processed;

        // Trigger compute job again immediately
        const response2 = await request(app)
            .post('/api/customers/analytics/compute')
            .set('Authorization', `Bearer ${authToken}`);

        expect([200, 202]).toContain(response2.status);
        expect(response2.body.data).toHaveProperty('processed');

        const processed2 = response2.body.data.processed;

        // Both should process same number of customers
        expect(processed1).toBe(processed2);

        // Get RFM after running compute twice - should be consistent
        const afterResponse = await request(app)
            .get('/api/customers/analytics/rfm')
            .set('Authorization', `Bearer ${authToken}`);

        expect(afterResponse.status).toBe(200);

        // The total should match the processed count
        expect(afterResponse.body.data.total).toBe(processed1);
    });

    it('should ensure analytics for a customer in Org A are inaccessible to users in Org B', async () => {
        // Create a second organization and user with unique email
        const uniqueEmail = `orgb-analytics-${Date.now()}@test.com`;
        const signupOrgB = await auth.api.signUpEmail({
            body: {
                email: uniqueEmail,
                password: 'Password123!',
                name: 'Org B Test User'
            }
        });

        if (!signupOrgB) throw new Error('Org B signup failed');

        await prisma.user.update({
            where: { id: signupOrgB.user.id },
            data: { emailVerified: true }
        });

        const orgB = await auth.api.createOrganization({
            headers: fromNodeHeaders({
                authorization: `Bearer ${signupOrgB.token!}`
            }),
            body: {
                name: 'Org B Test',
                slug: 'org-b-test-' + Date.now()
            }
        });

        const orgBResponse = orgB as {
            organization?: { id: string };
            id?: string;
        };
        const orgBId = orgBResponse.organization?.id ?? orgBResponse.id ?? '';

        await auth.api.setActiveOrganization({
            headers: fromNodeHeaders({
                authorization: `Bearer ${signupOrgB.token!}`
            }),
            body: { organizationId: orgBId }
        });

        const signinOrgB = await auth.api.signInEmail({
            body: {
                email: uniqueEmail,
                password: 'Password123!'
            }
        });

        const orgBToken = signinOrgB.token!;

        // Try to access Org A's customer analytics from Org B's context
        const response = await request(app)
            .get(`/api/customers/${testCustomerId}/analytics`)
            .set('Authorization', `Bearer ${orgBToken}`);

        // Should return 404 (not found) or 403 (forbidden) due to org isolation
        expect([403, 404]).toContain(response.status);
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
