import rateLimit from 'express-rate-limit';
import { ResponseHandler, ErrorCode, HttpStatus } from './response.util.js';

const rateLimiter = (windowMs: number, limit: number) =>
    rateLimit({
        windowMs,
        limit,
        handler: (req, res) => {
            ResponseHandler.error(
                res,
                'Too many requests, please try again later.',
                ErrorCode.RATE_LIMIT_EXCEEDED,
                HttpStatus.TOO_MANY_REQUESTS,
                req.path
            );
        },
        standardHeaders: true,
        legacyHeaders: false
    });

export const authRateLimit = rateLimiter(60000, 15);
export const generalRateLimit = rateLimiter(60000, 100);
