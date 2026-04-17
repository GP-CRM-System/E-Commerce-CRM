import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import request from 'supertest';
import app from '../../app.js';
import {
    createTestUser,
    cleanupTestUser,
    type TestAuth
} from '../../test/helpers/auth.js';

describe('Templates API', () => {
    let authA: TestAuth;
    let authB: TestAuth;
    let emailA: string;
    let emailB: string;

    beforeAll(async () => {
        emailA = `template-a-${Date.now()}@test.com`;
        emailB = `template-b-${Date.now()}@test.com`;
        authA = await createTestUser(
            emailA,
            'Template Org A',
            `template-org-a-${Date.now()}`
        );
        authB = await createTestUser(
            emailB,
            'Template Org B',
            `template-org-b-${Date.now()}`
        );
    });

    afterAll(async () => {
        if (authA) await cleanupTestUser(emailA, authA.orgId);
        if (authB) await cleanupTestUser(emailB, authB.orgId);
    });

    describe('POST /api/templates', () => {
        it('should create a template', async () => {
            const response = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    name: 'Welcome Email',
                    subject: 'Welcome {{customer.name}}!',
                    htmlBody: '<h1>Hello {{customer.name}}</h1><p>Welcome!</p>',
                    variables: ['customer.name']
                });

            expect(response.status).toBe(201);
            expect(response.body.data).toMatchObject({
                name: 'Welcome Email',
                subject: 'Welcome {{customer.name}}!'
            });
        });

        it('should reject template without name', async () => {
            const response = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    subject: 'Test Subject',
                    htmlBody: '<p>Test</p>'
                });

            expect(response.status).toBe(400);
        });

        it('should reject template without subject', async () => {
            const response = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    name: 'Test Template',
                    htmlBody: '<p>Test</p>'
                });

            expect(response.status).toBe(400);
        });
    });

    describe('GET /api/templates', () => {
        it('should list templates', async () => {
            const response = await request(app)
                .get('/api/templates')
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(200);
            expect(response.body.data).toBeArray();
            expect(response.body.pagination).toBeDefined();
        });

        it('should NOT list Org A templates in Org B', async () => {
            const response = await request(app)
                .get('/api/templates')
                .set('Authorization', `Bearer ${authB.token}`);

            expect(response.status).toBe(200);
        });
    });

    describe('GET /api/templates/:id', () => {
        it('should get a template by id', async () => {
            const createResponse = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    name: 'Get Test Template',
                    subject: 'Get Subject',
                    htmlBody: '<p>Get body</p>'
                });

            const templateId = createResponse.body.data.id;

            const response = await request(app)
                .get(`/api/templates/${templateId}`)
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(200);
            expect(response.body.data.name).toBe('Get Test Template');
        });

        it('should return 404 for non-existent template', async () => {
            const response = await request(app)
                .get('/api/templates/non-existent-id')
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(404);
        });

        it('should NOT get Org A template in Org B', async () => {
            const createResponse = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    name: 'Private Template',
                    subject: 'Private',
                    htmlBody: '<p>Private</p>'
                });

            const templateId = createResponse.body.data.id;

            const response = await request(app)
                .get(`/api/templates/${templateId}`)
                .set('Authorization', `Bearer ${authB.token}`);

            expect(response.status).toBe(404);
        });
    });

    describe('PATCH /api/templates/:id', () => {
        it('should update a template', async () => {
            const createResponse = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    name: 'Original Name',
                    subject: 'Original Subject',
                    htmlBody: '<p>Original</p>'
                });

            const templateId = createResponse.body.data.id;

            const response = await request(app)
                .patch(`/api/templates/${templateId}`)
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    name: 'Updated Name'
                });

            expect(response.status).toBe(200);
            expect(response.body.data.name).toBe('Updated Name');
            expect(response.body.data.subject).toBe('Original Subject');
        });
    });

    describe('DELETE /api/templates/:id', () => {
        it('should delete a template', async () => {
            const createResponse = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    name: 'To Delete',
                    subject: 'Delete me',
                    htmlBody: '<p>Delete</p>'
                });

            const templateId = createResponse.body.data.id;

            const response = await request(app)
                .delete(`/api/templates/${templateId}`)
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(200);
        });
    });

    describe('GET /api/templates/:id/preview', () => {
        it('should preview a template', async () => {
            const createResponse = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    name: 'Preview Test',
                    subject: 'Hello {{customer.name}}',
                    htmlBody: '<p>Dear {{customer.name}}</p>'
                });

            const templateId = createResponse.body.data.id;

            const response = await request(app)
                .get(`/api/templates/${templateId}/preview`)
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(200);
            expect(response.body.data.subject).toContain('John Doe');
            expect(response.body.data.body).toContain('John Doe');
        });
    });
});
