import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../middlewares/error.middleware.js';

export const rateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    handler: asyncHandler(async () => {
        throw new Error(
            'Too many requests from this IP, please try again later'
        );
    }),
    standardHeaders: true,
    legacyHeaders: false
});
