import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import {
    ErrorCode,
    HttpStatus,
    ResponseHandler
} from '../utils/response.util.js';

const isTestEnv = process.env.NODE_ENV === 'test';

export const rateLimitHandler = (req: Request, res: Response) => {
    return ResponseHandler.error(
        res,
        'Too many requests from this IP, please try again later',
        ErrorCode.RATE_LIMIT_EXCEEDED,
        HttpStatus.TOO_MANY_REQUESTS,
        `${req.method} ${req.path}`
    );
};

export const authRateLimitHandler = (req: Request, res: Response) => {
    return ResponseHandler.error(
        res,
        'Too many authentication attempts, please try again later',
        ErrorCode.RATE_LIMIT_EXCEEDED,
        HttpStatus.TOO_MANY_REQUESTS,
        `${req.method} ${req.path}`
    );
};

export const rateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    handler: rateLimitHandler,
    skip: () => isTestEnv,
    standardHeaders: true,
    legacyHeaders: false
});

export const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 15,
    handler: authRateLimitHandler,
    skip: () => isTestEnv,
    standardHeaders: true,
    legacyHeaders: false
});
