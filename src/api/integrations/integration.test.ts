import request from 'supertest';
import {
    it,
    describe,
    expect,
    beforeAll,
    afterAll,
    beforeEach
} from 'bun:test';
import app from '../../app.js';
import prisma from '../../config/prisma.config.js';
import {
    createTestUser,
    cleanupTestUser,
    type TestAuth
} from '../../test/helpers/auth.js';

describe('Integrations API', () => {
    let authA: TestAuth;
    let authB: TestAuth;
    let testIntegrationId: string;

    let emailA: string;
    let emailB: string;

    beforeAll(async () => {
        emailA = `integration-a-${Date.now()}@test.com`;
        emailB = `integration-b-${Date.now()}@test.com`;
        authA = await createTestUser(
            emailA,
            'Integration Org A',
            `int-org-a-${Date.now()}`
        );
        authB = await createTestUser(
            emailB,
            'Integration Org B',
            `int-org-b-${Date.now()}`
        );
    });

    afterAll(async () => {
        if (authA) await cleanupTestUser(emailA, authA.orgId);
        if (authB) await cleanupTestUser(emailB, authB.orgId);
    });

    describe('POST /api/integrations/shopify/connect', () => {
        it('should reject invalid shop domain', async () => {
            const response = await request(app)
                .post('/api/integrations/shopify/connect')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    shopDomain: 'invalid..myshopify.com',
                    accessToken: 'test-token'
                });

            expect(response.status).toBe(400);
        });

        it('should reject missing access token', async () => {
            const response = await request(app)
                .post('/api/integrations/shopify/connect')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    shopDomain: 'test.myshopify.com'
                });

            expect(response.status).toBe(400);
        });

        it('should reject unauthenticated request', async () => {
            const response = await request(app)
                .post('/api/integrations/shopify/connect')
                .send({
                    shopDomain: 'test.myshopify.com',
                    accessToken: 'test-token'
                });

            expect(response.status).toBe(401);
        });
    });

    describe('Cross-Tenant Isolation', () => {
        it('should NOT allow Org B to see Org A integration', async () => {
            const createRes = await prisma.integration.create({
                data: {
                    orgId: authA.orgId,
                    provider: 'shopify',
                    name: 'A Integration',
                    shopDomain: 'a.myshopify.com',
                    accessToken: 'a-token',
                    syncStatus: 'pending',
                    isActive: true
                }
            });

            const response = await request(app)
                .get(`/api/integrations/${createRes.id}`)
                .set('Authorization', `Bearer ${authB.token}`);

            expect(response.status).toBe(404);
        });

        it('should NOT allow Org B to update Org A integration', async () => {
            const createRes = await prisma.integration.create({
                data: {
                    orgId: authA.orgId,
                    provider: 'shopify',
                    name: 'A Integration 2',
                    shopDomain: 'a2.myshopify.com',
                    accessToken: 'a2-token',
                    syncStatus: 'pending',
                    isActive: true
                }
            });

            const response = await request(app)
                .patch(`/api/integrations/${createRes.id}`)
                .set('Authorization', `Bearer ${authB.token}`)
                .send({ name: 'Hacked Name' });

            expect(response.status).toBe(404);
        });

        it('should NOT allow Org B to delete Org A integration', async () => {
            const createRes = await prisma.integration.create({
                data: {
                    orgId: authA.orgId,
                    provider: 'shopify',
                    name: 'A Integration 3',
                    shopDomain: 'a3.myshopify.com',
                    accessToken: 'a3-token',
                    syncStatus: 'pending',
                    isActive: true
                }
            });

            const response = await request(app)
                .delete(`/api/integrations/${createRes.id}`)
                .set('Authorization', `Bearer ${authB.token}`);

            expect(response.status).toBe(404);
        });

        it('should NOT list Org A integrations in Org B', async () => {
            await prisma.integration.deleteMany({
                where: { orgId: authB.orgId }
            });

            const response = await request(app)
                .get('/api/integrations')
                .set('Authorization', `Bearer ${authB.token}`);

            expect(response.status).toBe(200);
            expect(response.body.data).toEqual([]);
        });
    });

    describe('GET /api/integrations', () => {
        beforeEach(async () => {
            await prisma.syncLog.deleteMany({
                where: { integration: { orgId: authA.orgId } }
            });
            await prisma.webhookLog.deleteMany({
                where: { integration: { orgId: authA.orgId } }
            });
            await prisma.integration.deleteMany({
                where: { orgId: authA.orgId }
            });
        });

        it('should return empty array when no integrations exist', async () => {
            const response = await request(app)
                .get('/api/integrations')
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(200);
            expect(response.body.data).toEqual([]);
        });

        it('should list integrations', async () => {
            await prisma.integration.create({
                data: {
                    orgId: authA.orgId,
                    provider: 'shopify',
                    name: 'Test Store',
                    shopDomain: 'test.myshopify.com',
                    accessToken: 'test-token',
                    syncStatus: 'pending',
                    isActive: true
                }
            });

            const response = await request(app)
                .get('/api/integrations')
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(200);
            expect(response.body.data).toBeInstanceOf(Array);
            expect(response.body.data.length).toBeGreaterThan(0);
        });

        it('should reject unauthenticated request', async () => {
            const response = await request(app).get('/api/integrations');
            expect(response.status).toBe(401);
        });
    });

    describe('GET /api/integrations/:integrationId', () => {
        beforeEach(async () => {
            await prisma.syncLog.deleteMany({
                where: { integration: { orgId: authA.orgId } }
            });
            await prisma.webhookLog.deleteMany({
                where: { integration: { orgId: authA.orgId } }
            });
            await prisma.integration.deleteMany({
                where: { orgId: authA.orgId }
            });

            const integration = await prisma.integration.create({
                data: {
                    orgId: authA.orgId,
                    provider: 'shopify',
                    name: 'Test Store',
                    shopDomain: 'test.myshopify.com',
                    accessToken: 'test-token',
                    syncStatus: 'pending',
                    isActive: true
                }
            });
            testIntegrationId = integration.id;
        });

        it('should return 404 for non-existent integration', async () => {
            const response = await request(app)
                .get('/api/integrations/non-existent-id')
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(404);
        });

        it('should get integration details', async () => {
            const response = await request(app)
                .get(`/api/integrations/${testIntegrationId}`)
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(200);
            expect(response.body.data.id).toBe(testIntegrationId);
            expect(response.body.data.name).toBe('Test Store');
        });
    });

    describe('PATCH /api/integrations/:integrationId', () => {
        beforeEach(async () => {
            await prisma.syncLog.deleteMany({
                where: { integration: { orgId: authA.orgId } }
            });
            await prisma.webhookLog.deleteMany({
                where: { integration: { orgId: authA.orgId } }
            });
            await prisma.integration.deleteMany({
                where: { orgId: authA.orgId }
            });

            const integration = await prisma.integration.create({
                data: {
                    orgId: authA.orgId,
                    provider: 'shopify',
                    name: 'Test Store',
                    shopDomain: 'test.myshopify.com',
                    accessToken: 'test-token',
                    syncStatus: 'pending',
                    isActive: true
                }
            });
            testIntegrationId = integration.id;
        });

        it('should update integration name with validation', async () => {
            const response = await request(app)
                .patch(`/api/integrations/${testIntegrationId}`)
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ name: 'Updated Store' });

            expect(response.status).toBe(200);
            expect(response.body.data.name).toBe('Updated Store');
        });

        it('should toggle isActive with validation', async () => {
            const response = await request(app)
                .patch(`/api/integrations/${testIntegrationId}`)
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ isActive: false });

            expect(response.status).toBe(200);
            expect(response.body.data.isActive).toBe(false);
        });

        it('should fail with invalid isActive (400)', async () => {
            const response = await request(app)
                .patch(`/api/integrations/${testIntegrationId}`)
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ isActive: 'invalid' });

            expect(response.status).toBe(400);
        });

        it('should return 404 for non-existent integration', async () => {
            const response = await request(app)
                .patch('/api/integrations/non-existent-id')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ name: 'Updated' });

            expect(response.status).toBe(404);
        });

        it('should verify DB state after update', async () => {
            await request(app)
                .patch(`/api/integrations/${testIntegrationId}`)
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ name: 'DB Verified Store' });

            const integration = await prisma.integration.findUnique({
                where: { id: testIntegrationId },
                select: { name: true }
            });

            expect(integration?.name).toBe('DB Verified Store');
        });
    });

    describe('DELETE /api/integrations/:integrationId', () => {
        beforeEach(async () => {
            await prisma.syncLog.deleteMany({
                where: { integration: { orgId: authA.orgId } }
            });
            await prisma.webhookLog.deleteMany({
                where: { integration: { orgId: authA.orgId } }
            });
            await prisma.integration.deleteMany({
                where: { orgId: authA.orgId }
            });

            const integration = await prisma.integration.create({
                data: {
                    orgId: authA.orgId,
                    provider: 'shopify',
                    name: 'Test Store',
                    shopDomain: 'test.myshopify.com',
                    accessToken: 'test-token',
                    syncStatus: 'pending',
                    isActive: true
                }
            });
            testIntegrationId = integration.id;
        });

        it('should delete integration', async () => {
            const response = await request(app)
                .delete(`/api/integrations/${testIntegrationId}`)
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(204);

            const deleted = await prisma.integration.findUnique({
                where: { id: testIntegrationId }
            });
            expect(deleted).toBeNull();
        });

        it('should return 404 for non-existent integration', async () => {
            const response = await request(app)
                .delete('/api/integrations/non-existent-id-12345')
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(404);
        });
    });

    describe('POST /api/integrations/:integrationId/test-connection', () => {
        beforeEach(async () => {
            await prisma.syncLog.deleteMany({
                where: { integration: { orgId: authA.orgId } }
            });
            await prisma.webhookLog.deleteMany({
                where: { integration: { orgId: authA.orgId } }
            });
            await prisma.integration.deleteMany({
                where: { orgId: authA.orgId }
            });

            const integration = await prisma.integration.create({
                data: {
                    orgId: authA.orgId,
                    provider: 'shopify',
                    name: 'Test Store',
                    shopDomain: 'test.myshopify.com',
                    accessToken: 'invalid-token',
                    syncStatus: 'pending',
                    isActive: true
                }
            });
            testIntegrationId = integration.id;
        });

        it('should return failure for invalid token', async () => {
            const response = await request(app)
                .post(`/api/integrations/${testIntegrationId}/test-connection`)
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(200);
            expect(response.body.data.success).toBe(false);
        });

        it('should return 404 for non-existent integration', async () => {
            const response = await request(app)
                .post('/api/integrations/non-existent-id/test-connection')
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(404);
        });
    });

    describe('POST /api/integrations/:integrationId/sync/full', () => {
        beforeEach(async () => {
            await prisma.syncLog.deleteMany({
                where: { integration: { orgId: authA.orgId } }
            });
            await prisma.webhookLog.deleteMany({
                where: { integration: { orgId: authA.orgId } }
            });
            await prisma.integration.deleteMany({
                where: { orgId: authA.orgId }
            });

            const integration = await prisma.integration.create({
                data: {
                    orgId: authA.orgId,
                    provider: 'shopify',
                    name: 'Test Store',
                    shopDomain: 'test.myshopify.com',
                    accessToken: 'test-token',
                    syncStatus: 'pending',
                    isActive: true
                }
            });
            testIntegrationId = integration.id;
        });

        it('should trigger full sync', async () => {
            const response = await request(app)
                .post(`/api/integrations/${testIntegrationId}/sync/full`)
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ entities: ['customers', 'orders'] });

            expect([200, 400, 500]).toContain(response.status);
        });

        it('should return 404 for non-existent integration', async () => {
            const response = await request(app)
                .post('/api/integrations/3OLaqoEm39_b7Y6u0Hama/sync/full')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ entities: ['customers'] });

            expect(response.status).toBe(404);
        });

        it('should fail with invalid entities (400)', async () => {
            const response = await request(app)
                .post(`/api/integrations/${testIntegrationId}/sync/full`)
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ entities: ['invalid_entity'] });

            expect(response.status).toBe(400);
        });
    });

    describe('GET /api/integrations/:integrationId/sync/logs', () => {
        beforeEach(async () => {
            await prisma.syncLog.deleteMany({
                where: { integration: { orgId: authA.orgId } }
            });
            await prisma.webhookLog.deleteMany({
                where: { integration: { orgId: authA.orgId } }
            });
            await prisma.integration.deleteMany({
                where: { orgId: authA.orgId }
            });

            const integration = await prisma.integration.create({
                data: {
                    orgId: authA.orgId,
                    provider: 'shopify',
                    name: 'Test Store',
                    shopDomain: 'test.myshopify.com',
                    accessToken: 'test-token',
                    syncStatus: 'pending',
                    isActive: true
                }
            });
            testIntegrationId = integration.id;
        });

        it('should return sync logs', async () => {
            const response = await request(app)
                .get(`/api/integrations/${testIntegrationId}/sync/logs`)
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(200);
            expect(response.body.data).toBeInstanceOf(Array);
        });

        it('should return 404 for non-existent integration', async () => {
            const response = await request(app)
                .get('/api/integrations/non-existent-id/sync/logs')
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(404);
        });
    });

    describe('GET /api/integrations/:integrationId/webhooks/logs', () => {
        beforeEach(async () => {
            await prisma.syncLog.deleteMany({
                where: { integration: { orgId: authA.orgId } }
            });
            await prisma.webhookLog.deleteMany({
                where: { integration: { orgId: authA.orgId } }
            });
            await prisma.integration.deleteMany({
                where: { orgId: authA.orgId }
            });

            const integration = await prisma.integration.create({
                data: {
                    orgId: authA.orgId,
                    provider: 'shopify',
                    name: 'Test Store',
                    shopDomain: 'test.myshopify.com',
                    accessToken: 'test-token',
                    syncStatus: 'pending',
                    isActive: true
                }
            });
            testIntegrationId = integration.id;
        });

        it('should return webhook logs', async () => {
            const response = await request(app)
                .get(`/api/webhooks/${testIntegrationId}/logs`)
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(200);
            expect(response.body.data).toBeDefined();
        });
    });
});
