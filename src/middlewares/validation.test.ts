import { describe, it, expect } from 'bun:test';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { validateRequest } from './validation.middleware.js';

type TestRequest = {
    body?: Record<string, unknown>;
    query?: Record<string, unknown>;
    method?: string;
    path?: string;
};

type TestResponseBody = {
    message: string;
    details?: Record<string, unknown>;
};

type TestResponse = {
    status: (code: number) => {
        json: (data: TestResponseBody) => {
            code: number;
            data: TestResponseBody;
        };
    };
};

describe('Validation Middleware', () => {
    const schema = z.object({
        name: z.string().min(3),
        age: z.number().int().positive()
    });

    it('should call next() for valid body', () => {
        const req: TestRequest = { body: { name: 'John', age: 30 } };
        const res = {} as TestResponse;
        let nextCalled = false;
        const next = () => {
            nextCalled = true;
        };

        const middleware = validateRequest(schema, 'body');
        middleware(req as unknown as Request, res as unknown as Response, next);

        expect(nextCalled).toBe(true);
        expect(req.body).toEqual({ name: 'John', age: 30 });
    });

    it('should return error response for invalid body', () => {
        const req: TestRequest = {
            body: { name: 'Jo', age: -5 },
            method: 'POST',
            path: '/test'
        };
        let statusSet: number = 0;
        let responseData: TestResponseBody | null = null;

        const res: TestResponse = {
            status: (code: number) => {
                statusSet = code;
                return {
                    json: (data: TestResponseBody) => {
                        responseData = data;
                        return { code, data };
                    }
                };
            }
        };
        const next = () => {};

        const middleware = validateRequest(schema, 'body');
        middleware(req as unknown as Request, res as unknown as Response, next);

        expect(statusSet).toBe(400);
        if (!responseData) {
            throw new Error('Expected validation error response');
        }

        const errorResponse = responseData as unknown as TestResponseBody;
        expect(errorResponse.message).toBe('Validation failed');
        expect(errorResponse.details).toHaveProperty('name');
        expect(errorResponse.details).toHaveProperty('age');
    });

    it('should parse and coerce values if schema allows', () => {
        const coerceSchema = z.object({
            age: z.coerce.number()
        });
        const req: TestRequest = { query: { age: '25' } };
        const res = {} as TestResponse;
        const next = () => {};

        const middleware = validateRequest(coerceSchema, 'query');
        middleware(req as unknown as Request, res as unknown as Response, next);

        expect(req.query?.age).toBe(25);
    });
});
