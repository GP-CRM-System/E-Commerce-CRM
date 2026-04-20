import request from 'supertest';
import { it, describe, expect } from 'bun:test';
import app from '../app.js';

describe('Health API', () => {
    describe('GET /api/health', () => {
        it('should return health status', async () => {
            const res = await request(app).get('/api/health');

            expect(res.status).toBe(200);
            expect(res.body.data).toHaveProperty('redis');
            expect(res.body.data).toHaveProperty('database');
            expect(res.body.data).toHaveProperty('timestamp');
        });

        it('should include redis availability', async () => {
            const res = await request(app).get('/api/health');

            expect(res.body.data.redis).toHaveProperty('available');
        });

        it('should include database availability', async () => {
            const res = await request(app).get('/api/health');

            expect(res.body.data.database).toHaveProperty('available');
        });
    });
});