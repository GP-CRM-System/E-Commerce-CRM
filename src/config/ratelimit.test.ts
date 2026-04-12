import { describe, it, expect } from 'bun:test';
import type { Request, Response } from 'express';
import { rateLimitHandler, authRateLimitHandler } from './ratelimit.config.js';
import { ErrorCode, HttpStatus } from '../utils/response.util.js';

type ErrorPayload = {
    message: string;
    code: ErrorCode;
    status: HttpStatus;
    path?: string;
    timestamp: Date;
    details?: Record<string, unknown>;
};

type CapturedResponse = { code: number; data: ErrorPayload };

const createMockResponse = (): {
    res: Response;
    getResult: () => CapturedResponse;
} => {
    let result: CapturedResponse | null = null;

    const res = {
        status: (code: number) => ({
            json: (data: ErrorPayload) => {
                result = { code, data };
                return res as unknown as Response;
            }
        })
    } as unknown as Response;

    return {
        res,
        getResult: () => {
            if (!result) {
                throw new Error('Expected response to be captured');
            }

            return result;
        }
    };
};

describe('Rate Limit Config', () => {
    it('should return a 429 error response', () => {
        const req = {
            method: 'GET',
            path: '/api/customers'
        } as Request;

        const { res, getResult } = createMockResponse();

        rateLimitHandler(req, res);
        const result = getResult();

        expect(result.code).toBe(429);
        expect(result.data.message).toBe(
            'Too many requests from this IP, please try again later'
        );
        expect(result.data.code).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);
        expect(result.data.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect(result.data.path).toBe('GET /api/customers');
    });

    it('should return a 429 auth rate limit response', () => {
        const req = {
            method: 'POST',
            path: '/api/auth/sign-in/email'
        } as Request;

        const { res, getResult } = createMockResponse();

        authRateLimitHandler(req, res);
        const result = getResult();

        expect(result.code).toBe(429);
        expect(result.data.message).toBe(
            'Too many authentication attempts, please try again later'
        );
        expect(result.data.code).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);
        expect(result.data.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect(result.data.path).toBe('POST /api/auth/sign-in/email');
    });
});
