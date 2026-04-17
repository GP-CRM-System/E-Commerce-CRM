import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import request from 'supertest';
import app from '../../app.js';
import prisma from '../../config/prisma.config.js';
import {
    createTestUser,
    cleanupTestUser,
    type TestAuth
} from '../../test/helpers/auth.js';

describe('Campaigns API', () => {
    let authA: TestAuth;
    let authB: TestAuth;
    let emailA: string;
    let emailB: string;
    let customerId: string;

    beforeAll(async () => {
        emailA = `campaign-a-${Date.now()}@test.com`;
        emailB = `campaign-b-${Date.now()}@test.com`;
        authA = await createTestUser(
            emailA,
            'Campaign Org A',
            `campaign-org-a-${Date.now()}`
        );
        authB = await createTestUser(
            emailB,
            'Campaign Org B',
            `campaign-org-b-${Date.now()}`
        );
        const customer = await prisma.customer.create({
            data: {
                organizationId: authA.orgId,
                email: emailA,
                name: 'Test Customer',
                acceptsMarketing: true
            }
        });
        customerId = customer.id;
    });

    afterAll(async () => {
        if (authA) await cleanupTestUser(emailA, authA.orgId);
        if (authB) await cleanupTestUser(emailB, authB.orgId);
    });

    describe('POST /api/campaigns', () => {
        it('should create a campaign', async () => {
            const response = await request(app)
                .post('/api/campaigns')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    name: 'Test Campaign',
                    description: 'Test description',
                    type: 'EMAIL',
                    subject: 'Test Subject'
                });

            expect(response.status).toBe(201);
            expect(response.body.data).toMatchObject({
                name: 'Test Campaign',
                status: 'DRAFT'
            });
        });

        it('should create campaign with template', async () => {
            const templateRes = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    name: 'Campaign Template',
                    subject: 'Template Subject',
                    htmlBody: '<p>Template body</p>'
                });

            const response = await request(app)
                .post('/api/campaigns')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    name: 'Campaign with Template',
                    type: 'EMAIL',
                    templateId: templateRes.body.data.id
                });

            expect(response.status).toBe(201);
            expect(response.body.data.templateId).toBe(
                templateRes.body.data.id
            );
        });

        it('should reject campaign without name', async () => {
            const response = await request(app)
                .post('/api/campaigns')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    type: 'EMAIL'
                });

            expect(response.status).toBe(400);
        });
    });

    describe('GET /api/campaigns', () => {
        it('should list campaigns', async () => {
            const response = await request(app)
                .get('/api/campaigns')
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(200);
            expect(response.body.data).toBeArray();
            expect(response.body.pagination).toBeDefined();
        });

        it('should filter by status', async () => {
            const response = await request(app)
                .get('/api/campaigns?status=DRAFT')
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(200);
        });

        it('should NOT list Org A campaigns in Org B', async () => {
            await request(app)
                .post('/api/campaigns')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ name: 'Org A Campaign' });

            const response = await request(app)
                .get('/api/campaigns')
                .set('Authorization', `Bearer ${authB.token}`);

            expect(response.status).toBe(200);
            const orgACampaign = response.body.data.find(
                (c: { name: string }) => c.name === 'Org A Campaign'
            );
            expect(orgACampaign).toBeUndefined();
        });
    });

    describe('GET /api/campaigns/:id', () => {
        it('should get a campaign by id', async () => {
            const createRes = await request(app)
                .post('/api/campaigns')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ name: 'Get Test Campaign' });

            const campaignId = createRes.body.data.id;

            const response = await request(app)
                .get(`/api/campaigns/${campaignId}`)
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(200);
            expect(response.body.data.name).toBe('Get Test Campaign');
        });

        it('should return 404 for non-existent campaign', async () => {
            const response = await request(app)
                .get('/api/campaigns/non-existent-id')
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(404);
        });
    });

    describe('PATCH /api/campaigns/:id', () => {
        it('should update a campaign', async () => {
            const createRes = await request(app)
                .post('/api/campaigns')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ name: 'Original Campaign Name' });

            const campaignId = createRes.body.data.id;

            const response = await request(app)
                .patch(`/api/campaigns/${campaignId}`)
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ name: 'Updated Campaign Name' });

            expect(response.status).toBe(200);
            expect(response.body.data.name).toBe('Updated Campaign Name');
        });

        it('should NOT update sent campaign', async () => {
            const createRes = await request(app)
                .post('/api/campaigns')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ name: 'Sent Campaign' });

            const campaignId = createRes.body.data.id;

            await request(app)
                .post(`/api/campaigns/${campaignId}/send`)
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ sendNow: true });

            const response = await request(app)
                .patch(`/api/campaigns/${campaignId}`)
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ name: 'Try Update' });

            expect(response.status).toBe(400);
        });
    });

    describe('POST /api/campaigns/:id/send', () => {
        it('should send a campaign', async () => {
            const createRes = await request(app)
                .post('/api/campaigns')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    name: 'Send Test Campaign',
                    subject: 'Test'
                });

            const campaignId = createRes.body.data.id;

            await prisma.customer.update({
                where: { id: customerId },
                data: { acceptsMarketing: true }
            });

            const response = await request(app)
                .post(`/api/campaigns/${campaignId}/send`)
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ sendNow: true });

            expect(response.status).toBe(200);
            expect(response.body.data.recipientCount).toBe(1);
        });

        it('should NOT send already sent campaign', async () => {
            const createRes = await request(app)
                .post('/api/campaigns')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ name: 'Already Sent' });

            const campaignId = createRes.body.data.id;

            await request(app)
                .post(`/api/campaigns/${campaignId}/send`)
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ sendNow: true });

            const response = await request(app)
                .post(`/api/campaigns/${campaignId}/send`)
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ sendNow: true });

            expect(response.status).toBe(400);
        });
    });

    describe('GET /api/campaigns/:id/stats', () => {
        it('should get campaign stats', async () => {
            const createRes = await request(app)
                .post('/api/campaigns')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ name: 'Stats Test Campaign' });

            const campaignId = createRes.body.data.id;

            const response = await request(app)
                .get(`/api/campaigns/${campaignId}/stats`)
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(200);
            expect(response.body.data).toHaveProperty('totalRecipients');
            expect(response.body.data).toHaveProperty('sent');
            expect(response.body.data).toHaveProperty('deliveredRate');
        });
    });

    describe('DELETE /api/campaigns/:id', () => {
        it('should delete a campaign', async () => {
            const createRes = await request(app)
                .post('/api/campaigns')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ name: 'To Delete' });

            const campaignId = createRes.body.data.id;

            const response = await request(app)
                .delete(`/api/campaigns/${campaignId}`)
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(200);
        });
    });
});
