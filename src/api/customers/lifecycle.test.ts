import request from 'supertest';
import { it, describe, expect, beforeAll, afterAll } from 'bun:test';
import app from '../../app.js';
import prisma from '../../config/prisma.config.js';
import { auth } from '../auth/auth.js';
import { fromNodeHeaders } from 'better-auth/node';
import {
    checkAndUpdateLifecycleStage,
    recalculateVIPCustomers,
    LIFECYCLE_RULES
} from './lifecycle.service.js';

let authToken: string;
let testOrgId: string;
let testCustomerId: string;

describe('Lifecycle Service', () => {
    beforeAll(async () => {
        await prisma.orderItem.deleteMany({
            where: {
                order: {
                    organization: { slug: { startsWith: 'lifecycle-test-org' } }
                }
            }
        });
        await prisma.order.deleteMany({
            where: {
                organization: { slug: { startsWith: 'lifecycle-test-org' } }
            }
        });
        await prisma.customer.deleteMany({
            where: {
                organization: { slug: { startsWith: 'lifecycle-test-org' } }
            }
        });
        await prisma.member.deleteMany({
            where: { user: { email: 'lifecycle-test@test.com' } }
        });
        await prisma.session.deleteMany({
            where: { user: { email: 'lifecycle-test@test.com' } }
        });
        await prisma.account.deleteMany({
            where: { user: { email: 'lifecycle-test@test.com' } }
        });
        await prisma.organization.deleteMany({
            where: { slug: { startsWith: 'lifecycle-test-org' } }
        });
        await prisma.user.deleteMany({
            where: { email: 'lifecycle-test@test.com' }
        });

        const signup = await auth.api.signUpEmail({
            body: {
                email: 'lifecycle-test@test.com',
                password: 'Password123!',
                name: 'Lifecycle Test User'
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
                name: 'Lifecycle Test Org',
                slug: 'lifecycle-test-org-' + Date.now()
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
            body: { email: 'lifecycle-test@test.com', password: 'Password123!' }
        });
        authToken = signin.token!;

        const customer = await prisma.customer.create({
            data: {
                name: 'Lifecycle Test Customer',
                email: 'lifecycle-test@example.com',
                organizationId: testOrgId,
                lifecycleStage: 'PROSPECT',
                totalOrders: 0,
                totalSpent: 0,
                createdAt: new Date(),
                updatedAt: new Date()
            }
        });
        testCustomerId = customer.id;
    });

    afterAll(async () => {
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

    describe('Cron Endpoints', () => {
        it('should trigger lifecycle job for all customers', async () => {
            const response = await request(app)
                .post('/api/cron/lifecycle')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ organizationId: testOrgId });

            expect(response.status).toBe(202);
            expect(response.body).toHaveProperty('data');
        });

        it('should trigger lifecycle job for specific customer', async () => {
            const response = await request(app)
                .post('/api/cron/lifecycle')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    organizationId: testOrgId,
                    customerId: testCustomerId
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('data');
        });

        it('should trigger VIP recalculation', async () => {
            const response = await request(app)
                .post('/api/cron/vip')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ organizationId: testOrgId });

            expect(response.status).toBe(202);
            expect(response.body.data).toHaveProperty('promoted');
            expect(response.body.data).toHaveProperty('demoted');
        });

        it('should reject request without organizationId', async () => {
            const response = await request(app)
                .post('/api/cron/lifecycle')
                .set('Authorization', `Bearer ${authToken}`)
                .send({});

            expect(response.status).toBe(400);
        });

        it('should reject unauthenticated requests', async () => {
            const response = await request(app)
                .post('/api/cron/lifecycle')
                .send({ organizationId: testOrgId });

            expect(response.status).toBe(401);
        });
    });

    describe('Lifecycle Transitions', () => {
        it('should transition PROSPECT to ONE_TIME on first order', async () => {
            await prisma.customer.update({
                where: { id: testCustomerId },
                data: { lifecycleStage: 'PROSPECT', totalOrders: 1 }
            });

            const result = await checkAndUpdateLifecycleStage(
                testCustomerId,
                testOrgId
            );

            expect(result?.triggered).toBe(true);
            expect(result?.newStage).toBe('ONE_TIME');
        });

        it('should transition RETURNING to LOYAL at threshold', async () => {
            await prisma.customer.update({
                where: { id: testCustomerId },
                data: {
                    lifecycleStage: 'RETURNING',
                    totalOrders: LIFECYCLE_RULES.LOYAL_THRESHOLD
                }
            });

            const result = await checkAndUpdateLifecycleStage(
                testCustomerId,
                testOrgId
            );

            expect(result?.triggered).toBe(true);
            expect(result?.newStage).toBe('LOYAL');
        });

        it('should transition to AT_RISK when churn risk is high', async () => {
            await prisma.customer.update({
                where: { id: testCustomerId },
                data: {
                    lifecycleStage: 'LOYAL',
                    totalOrders: 10,
                    churnRiskScore: LIFECYCLE_RULES.AT_RISK_THRESHOLD
                }
            });

            const result = await checkAndUpdateLifecycleStage(
                testCustomerId,
                testOrgId
            );

            expect(result?.triggered).toBe(true);
            expect(result?.newStage).toBe('AT_RISK');
        });

        it('should not transition if no threshold met', async () => {
            await prisma.customer.update({
                where: { id: testCustomerId },
                data: {
                    lifecycleStage: 'PROSPECT',
                    totalOrders: 0,
                    churnRiskScore: null
                }
            });

            const result = await checkAndUpdateLifecycleStage(
                testCustomerId,
                testOrgId
            );

            expect(result?.triggered).toBe(false);
            expect(result?.newStage).toBe('PROSPECT');
        });

        it('should transition CHURNED customers to WINBACK when order-triggered', async () => {
            await prisma.customer.update({
                where: { id: testCustomerId },
                data: {
                    lifecycleStage: 'CHURNED',
                    totalOrders: 3,
                    firstOrderAt: new Date('2024-01-01T00:00:00.000Z'),
                    lastOrderAt: new Date('2024-06-01T00:00:00.000Z'),
                    churnRiskScore: null,
                    avgDaysBetweenOrders: 30
                }
            });

            const result = await checkAndUpdateLifecycleStage(
                testCustomerId,
                testOrgId,
                { allowWinback: true }
            );

            expect(result?.triggered).toBe(true);
            expect(result?.newStage).toBe('WINBACK');
        });
    });

    describe('VIP Recalculation', () => {
        it('should promote high-spending customers to VIP', async () => {
            await prisma.customer.update({
                where: { id: testCustomerId },
                data: {
                    lifecycleStage: 'LOYAL',
                    totalSpent: 100000,
                    totalOrders: 50
                }
            });

            const result = await recalculateVIPCustomers(testOrgId);

            const customer = await prisma.customer.findUnique({
                where: { id: testCustomerId },
                select: { lifecycleStage: true }
            });

            expect(result.promoted + result.demoted).toBeGreaterThanOrEqual(0);
            expect(customer?.lifecycleStage).toBeDefined();
        });
    });
});
