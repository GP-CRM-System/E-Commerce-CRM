import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { createClient } from '@redis/client';
import type { NextFunction, Request, Response } from 'express';
import {
    ErrorCode,
    HttpStatus,
    ResponseHandler
} from '../utils/response.util.js';
import { redisConnection, isRedisAvailable } from './redis.config.js';
import logger from '../utils/logger.util.js';

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

let redisStore: RedisStore | null = null;
let redisInitPromise: Promise<RedisStore | null> | null = null;

export const initRateLimitStore = async (): Promise<RedisStore | null> => {
    if (!isRedisAvailable || isTestEnv) {
        return null;
    }

    if (redisStore) {
        return redisStore;
    }

    if (redisInitPromise) {
        return redisInitPromise;
    }

    redisInitPromise = (async () => {
        try {
            const client = createClient({
                socket: {
                    host: redisConnection.host,
                    port: redisConnection.port
                }
            });

            client.on('error', (err) => {
                logger.error({ err }, 'Redis client error for rate limiter');
            });

            await client.connect();

            redisStore = new RedisStore({
                sendCommand: (...args: string[]) =>
                    client.sendCommand(args) as Promise<number>
            });

            return redisStore;
        } catch (err) {
            logger.error({ err }, 'Failed to connect Redis for rate limiter');
            return null;
        }
    })();

    return redisInitPromise;
};

export const getRateLimitStore = async (): Promise<RedisStore | null> => {
    if (!isRedisAvailable || isTestEnv) {
        return null;
    }

    if (redisStore) {
        return redisStore;
    }

    return initRateLimitStore();
};

export const rateLimiter = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const store = await getRateLimitStore();
    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 100,
        handler: rateLimitHandler,
        skip: () => isTestEnv,
        standardHeaders: true,
        legacyHeaders: false,
        store: store ?? undefined
    });
    return limiter(req, res, next);
};

export const authRateLimiter = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const store = await getRateLimitStore();
    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 15,
        handler: authRateLimitHandler,
        skip: () => isTestEnv,
        standardHeaders: true,
        legacyHeaders: false,
        store: store ?? undefined
    });
    return limiter(req, res, next);
};

export const createRateLimiter = async () => {
    const store = await getRateLimitStore();

    return rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 100,
        handler: rateLimitHandler,
        skip: () => isTestEnv,
        standardHeaders: true,
        legacyHeaders: false,
        store: store ?? undefined
    });
};

export const createAuthRateLimiter = async () => {
    const store = await getRateLimitStore();

    return rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 15,
        handler: authRateLimitHandler,
        skip: () => isTestEnv,
        standardHeaders: true,
        legacyHeaders: false,
        store: store ?? undefined
    });
};
