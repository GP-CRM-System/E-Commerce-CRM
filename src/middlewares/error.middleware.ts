import type { Request, Response, NextFunction } from 'express';
import {
    ResponseHandler,
    AppError,
    ErrorCode,
    HttpStatus
} from '../utils/response.util.js';
import logger from '../utils/logger.util.js';
import type { ZodError } from 'zod';

/**
 * Format and send a consistent error response for failed requests.
 *
 * @param err Thrown application, validation, or generic error.
 * @param req Incoming Express request.
 * @param res Outgoing Express response.
 * @param _next Unused Express next function.
 * @returns The serialized error response.
 */
export const errorHandler = (
    err: Error | AppError,
    req: Request,
    res: Response
) => {
    const path = `${req.method} ${req.path}`;
    const timestamp = new Date().toISOString();

    if (err instanceof AppError) {
        logger.error(
            `[${err.code}] ${err.message} - Code: ${err.code} - Path: ${path} - Time: ${timestamp}`
        );
        return ResponseHandler.error(
            res,
            err.message,
            err.code as ErrorCode,
            err.status,
            path,
            err.details
        );
    }

    // Handle Zod validation errors
    if (err.name === 'ZodError') {
        const zodErr = err as ZodError;
        const issues = zodErr.issues;

        const details: Record<string, string> = issues.reduce(
            (acc: Record<string, string>, issue) => {
                const errorPath = issue.path.join('.');
                acc[errorPath] = issue.message;
                return acc;
            },
            {}
        );

        logger.warn(`Validation error - Path: ${path}`);
        return ResponseHandler.error(
            res,
            'Validation failed',
            ErrorCode.VALIDATION_ERROR,
            HttpStatus.BAD_REQUEST,
            path,
            details
        );
    }

    // Handle generic errors
    logger.error(`Unhandled error: ${err.message} - Stack: ${err.stack}`);
    return ResponseHandler.error(
        res,
        process.env.NODE_ENV === 'production'
            ? 'An error occurred'
            : err.message,
        ErrorCode.SERVER_ERROR,
        HttpStatus.INTERNAL_SERVER_ERROR,
        path
    );
};

/**
 * Return a standardized 404 response for unmatched routes.
 *
 * @param req Incoming Express request.
 * @param res Outgoing Express response.
 */
export const notFoundHandler = (req: Request, res: Response) => {
    const path = `${req.method} ${req.path}`;
    ResponseHandler.error(
        res,
        `Route ${path} not found`,
        ErrorCode.RESOURCE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        path
    );
};

/**
 * Wrap an async route handler and forward rejected promises to `next`.
 *
 * @param fn Async Express handler to wrap.
 * @returns Middleware that resolves the handler and forwards errors.
 */
export const asyncHandler = <T extends Request = Request>(
    fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>
) => {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req as T, res, next)).catch(next);
    };
};
