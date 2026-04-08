import { describe, it, expect } from 'bun:test';
import type { Response } from 'express';
import {
    HttpStatus,
    ErrorCode,
    ResponseHandler,
    AppError,
    NotFoundError
} from './response.util.js';

type CapturedResponse<T> = { code: number; data: T };

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

describe('Response Utility', () => {
    describe('ResponseHandler.success', () => {
        it('should format a success response', () => {
            const { res, getResult } =
                createMockResponse<Record<string, unknown>>();

            ResponseHandler.success(
                res,
                'Success message',
                HttpStatus.OK,
                { foo: 'bar' },
                '/test'
            );
            const result = getResult();
            expect(result.code).toBe(200);
            expect(result.data.message).toBe('Success message');
            expect(result.data.data).toEqual({ foo: 'bar' });
            expect(result.data.path).toBe('/test');
            expect(result.data.timestamp).toBeInstanceOf(Date);
        });
    });

    describe('ResponseHandler.error', () => {
        it('should format an error response', () => {
            const { res, getResult } =
                createMockResponse<Record<string, unknown>>();

            ResponseHandler.error(
                res,
                'Error message',
                ErrorCode.RESOURCE_NOT_FOUND,
                HttpStatus.NOT_FOUND,
                '/error'
            );
            const result = getResult();
            expect(result.code).toBe(404);
            expect(result.data.message).toBe('Error message');
            expect(result.data.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
            expect(result.data.status).toBe(HttpStatus.NOT_FOUND);
        });
    });

    describe('ResponseHandler.paginated', () => {
        it('should format a paginated response', () => {
            const { res, getResult } =
                createMockResponse<Record<string, unknown>>();

            const items = [{ id: 1 }, { id: 2 }];
            ResponseHandler.paginated(
                res,
                items,
                'Fetched',
                1,
                10,
                20,
                '/paged'
            );
            const result = getResult();
            expect(result.code).toBe(200);
            expect(result.data.success).toBe(true);
            expect(result.data.data).toEqual(items);
            expect(result.data.pagination).toEqual({
                page: 1,
                limit: 10,
                total: 20,
                pages: 2
            });
        });
    });

    describe('Error Classes', () => {
        it('should create AppError with default values', () => {
            const error = new AppError('Server error');
            expect(error.message).toBe('Server error');
            expect(error.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
            expect(error.code).toBe(ErrorCode.SERVER_ERROR);
        });

        it('should create NotFoundError with correct defaults', () => {
            const error = new NotFoundError('Custom not found');
            expect(error.message).toBe('Custom not found');
            expect(error.status).toBe(HttpStatus.NOT_FOUND);
            expect(error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
        });

        it('should be instance of Error and AppError', () => {
            const error = new NotFoundError();
            expect(error).toBeInstanceOf(Error);
            expect(error).toBeInstanceOf(AppError);
            expect(error).toBeInstanceOf(NotFoundError);
        });
    });
});
