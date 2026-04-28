import { describe, it, expect, afterAll } from 'bun:test';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { errorHandler, notFoundHandler } from './error.middleware.js';
import { AppError, ErrorCode, HttpStatus } from '../utils/response.util.js';

type ErrorResponseBody = {
    message: string;
    code: ErrorCode | string;
    status: number;
    timestamp: Date;
    path?: string;
    details?: Record<string, unknown>;
};

type CapturedResponse<T> = {
    code: number;
    data: T;
};

const createMockResponse = <T>(): {
    res: Response;
    getResult: () => CapturedResponse<T>;
} => {
    let result: CapturedResponse<T> | null = null;

    const res = {
        status: (code: number) => ({
            json: (data: T) => {
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

const createMockRequest = (method: string, path: string): Request => {
    return {
        method,
        path
    } as Request;
};

const originalNodeEnv = process.env.NODE_ENV;

afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
});

describe('Error Middleware', () => {
    it('should return AppError responses with the app error contract', () => {
        const { res, getResult } = createMockResponse<ErrorResponseBody>();
        const req = createMockRequest('GET', '/api/customers/123');

        const error = new AppError(
            'Customer not found',
            HttpStatus.NOT_FOUND,
            ErrorCode.RESOURCE_NOT_FOUND,
            { customerId: '123' }
        );

        errorHandler(error, req, res);

        const result = getResult();
        expect(result.code).toBe(HttpStatus.NOT_FOUND);
        expect(result.data.message).toBe('Customer not found');
        expect(result.data.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
        expect(result.data.status).toBe(HttpStatus.NOT_FOUND);
        expect(result.data.path).toBe('GET /api/customers/123');
        expect(result.data.details).toEqual({ customerId: '123' });
        expect(result.data.timestamp).toBeInstanceOf(Date);
    });

    it('should return validation contract for ZodError', () => {
        const { res, getResult } = createMockResponse<ErrorResponseBody>();
        const req = createMockRequest('POST', '/api/customers');

        const schema = z.object({
            email: z.string().email(),
            age: z.number().positive()
        });

        let zodError: Error;
        try {
            schema.parse({ email: 'invalid-email', age: -1 });
            throw new Error('Expected schema.parse to throw');
        } catch (err) {
            zodError = err as Error;
        }

        errorHandler(zodError!, req, res);

        const result = getResult();
        expect(result.code).toBe(HttpStatus.BAD_REQUEST);
        expect(result.data.message).toBe('Validation failed');
        expect(result.data.code).toBe(ErrorCode.VALIDATION_ERROR);
        expect(result.data.status).toBe(HttpStatus.BAD_REQUEST);
        expect(result.data.path).toBe('POST /api/customers');
        expect(result.data.details).toBeDefined();
        expect(result.data.details).toHaveProperty('email');
        expect(result.data.details).toHaveProperty('age');
    });

    it('should return generic error details in development mode', () => {
        process.env.NODE_ENV = 'development';

        const { res, getResult } = createMockResponse<ErrorResponseBody>();
        const req = createMockRequest('PUT', '/api/orders/77');

        errorHandler(new Error('Unexpected failure'), req, res);

        const result = getResult();
        expect(result.code).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(result.data.message).toBe('Unexpected failure');
        expect(result.data.code).toBe(ErrorCode.SERVER_ERROR);
        expect(result.data.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(result.data.path).toBe('PUT /api/orders/77');
    });

    it('should mask generic error details in production mode', () => {
        process.env.NODE_ENV = 'production';

        const { res, getResult } = createMockResponse<ErrorResponseBody>();
        const req = createMockRequest('DELETE', '/api/orders/77');

        errorHandler(new Error('Sensitive backend failure'), req, res);

        const result = getResult();
        expect(result.code).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(result.data.message).toBe('An error occurred');
        expect(result.data.code).toBe(ErrorCode.SERVER_ERROR);
        expect(result.data.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(result.data.path).toBe('DELETE /api/orders/77');
    });

    it('should return not found handler contract for unknown routes', () => {
        const { res, getResult } = createMockResponse<ErrorResponseBody>();
        const req = createMockRequest('PATCH', '/api/unknown-resource');

        notFoundHandler(req, res);

        const result = getResult();
        expect(result.code).toBe(HttpStatus.NOT_FOUND);
        expect(result.data.message).toBe(
            'Route PATCH /api/unknown-resource not found'
        );
        expect(result.data.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
        expect(result.data.status).toBe(HttpStatus.NOT_FOUND);
        expect(result.data.path).toBe('PATCH /api/unknown-resource');
    });
});
