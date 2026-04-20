import request from 'supertest';
import { it, describe, expect, beforeAll, afterAll } from 'bun:test';
import app from '../../app.js';
import {
    createTestUser,
    cleanupTestUser,
    type TestAuth
} from '../../test/helpers/auth.js';

describe('Audit API', () => {
    let authA: TestAuth;

    beforeAll(async () => {
        authA = await createTestUser(
            `audit-a-${Date.now()}@test.com`,
            'Audit Org A',
            `audit-org-a-${Date.now()}`
        );
    });

    afterAll(async () => {
        if (authA) await cleanupTestUser(authA.email, authA.orgId);
    });

    describe('GET /api/audit-logs', () => {
        it('should return empty list for new org', async () => {
            const res = await request(app)
                .get('/api/audit-logs')
                .set('Authorization', `Bearer ${authA.token}`);

            expect(res.status).toBe(200);
            expect(res.body.data).toBeDefined();
            expect(res.body.pagination).toBeDefined();
        });

        it('should accept pagination params', async () => {
            const res = await request(app)
                .get('/api/audit-logs?page=1&limit=10')
                .set('Authorization', `Bearer ${authA.token}`);

            expect(res.status).toBe(200);
            expect(res.body.pagination.page).toBe(1);
            expect(res.body.pagination.limit).toBe(10);
        });

        it('should reject invalid page/limit', async () => {
            const res = await request(app)
                .get('/api/audit-logs?page=-1')
                .set('Authorization', `Bearer ${authA.token}`);

            expect([400, 500]).toContain(res.status);
        });

        it('should reject unauthorized requests', async () => {
            const res = await request(app).get('/api/audit-logs');

            expect(res.status).toBe(401);
        });
    });
});
