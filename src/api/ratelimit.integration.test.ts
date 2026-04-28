import express from 'express';
import request from 'supertest';
import { describe, it, expect } from 'bun:test';
import rateLimit from 'express-rate-limit';
import {
    rateLimitHandler,
    authRateLimitHandler
} from '../config/ratelimit.config.js';
import { ErrorCode, HttpStatus } from '../utils/response.util.js';

type RateLimitErrorBody = {
    message?: string;
    code?: string;
    status?: number;
    timestamp?: string;
    path?: string;
};

const createLimitedApp = (
    limit: number,
    handler: (req: express.Request, res: express.Response) => unknown,
    route: string,
    method: 'get' | 'post'
) => {
    const app = express();

    app.use(
        rateLimit({
            windowMs: 60 * 1000,
            limit,
            skip: () => false,
            standardHeaders: true,
            legacyHeaders: false,
            handler
        })
    );

    if (method === 'get') {
        app.get(route, (_req, res) => {
            return res.status(HttpStatus.OK).json({ success: true });
        });
    } else {
        app.post(route, (_req, res) => {
            return res.status(HttpStatus.OK).json({ success: true });
        });
    }

    return app;
};

describe('Rate Limiting Integration Tests', () => {
    it('should throttle API requests and return 429 error contract', async () => {
        const app = createLimitedApp(2, rateLimitHandler, '/limited', 'get');

        const first = await request(app).get('/limited');
        const second = await request(app).get('/limited');
        const third = await request(app).get('/limited');

        expect(first.status).toBe(HttpStatus.OK);
        expect(second.status).toBe(HttpStatus.OK);
        expect(third.status).toBe(HttpStatus.TOO_MANY_REQUESTS);

        const body = third.body as RateLimitErrorBody;
        expect(body.message).toBe(
            'Too many requests from this IP, please try again later'
        );
        expect(body.code).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);
        expect(body.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect(body.path).toBe('GET /limited');
        expect(typeof body.timestamp).toBe('string');
        expect((body.timestamp ?? '').length).toBeGreaterThan(0);
    });

    it('should throttle auth attempts and return auth-specific 429 message', async () => {
        const app = createLimitedApp(
            1,
            authRateLimitHandler,
            '/auth-limited',
            'post'
        );

        const first = await request(app).post('/auth-limited');
        const second = await request(app).post('/auth-limited');

        expect(first.status).toBe(HttpStatus.OK);
        expect(second.status).toBe(HttpStatus.TOO_MANY_REQUESTS);

        const body = second.body as RateLimitErrorBody;
        expect(body.message).toBe(
            'Too many authentication attempts, please try again later'
        );
        expect(body.code).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);
        expect(body.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect(body.path).toBe('POST /auth-limited');
        expect(typeof body.timestamp).toBe('string');
    });
});
