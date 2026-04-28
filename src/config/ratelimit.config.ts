import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { createClient, type RedisClientType } from '@redis/client';
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

let redisClient: RedisClientType | null = null;
let redisInitPromise: Promise<RedisClientType | null> | null = null;

export const initRateLimitStore = async (): Promise<RedisClientType | null> => {
    if (!isRedisAvailable || isTestEnv) {
        return null;
    }

    if (redisClient) {
        return redisClient;
    }

    if (redisInitPromise) {
        return redisInitPromise;
    }

    redisInitPromise = (async () => {
        try {
            const client = createClient({
                url: redisConnection.url,
                socket: {
                    connectTimeout: redisConnection.connectTimeout
                }
            });

            client.on('error', (err) => {
                logger.error({ err }, 'Redis client error for rate limiter');
            });

            await client.connect();
            redisClient = client;
            return redisClient;
        } catch (err) {
            logger.error({ err }, 'Failed to connect Redis for rate limiter');
            return null;
        }
    })();

    return redisInitPromise;
};

const createStore = (prefix: string) => {
    if (!redisClient || isTestEnv) return undefined;
    return new RedisStore({
        prefix,
        sendCommand: (...args: string[]) => redisClient!.sendCommand(args)
    });
};

export const rateLimiter = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    if (!redisClient) await initRateLimitStore();
    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 100,
        handler: rateLimitHandler,
        skip: () => isTestEnv,
        standardHeaders: true,
        legacyHeaders: false,
        store: createStore('rl:api:'),
        keyGenerator: (req) =>
            ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? 'unknown')
    });
    return limiter(req, res, next);
};

export const authRateLimiter = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    if (!redisClient) await initRateLimitStore();
    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 15,
        handler: authRateLimitHandler,
        skip: () => isTestEnv,
        standardHeaders: true,
        legacyHeaders: false,
        store: createStore('rl:auth:'),
        keyGenerator: (req) =>
            ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? 'unknown')
    });
    return limiter(req, res, next);
};

export const createRateLimiter = async () => {
    if (!redisClient) await initRateLimitStore();
    return rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 100,
        handler: rateLimitHandler,
        skip: () => isTestEnv,
        standardHeaders: true,
        legacyHeaders: false,
        store: createStore('rl:api2:'),
        keyGenerator: (req) =>
            ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? 'unknown')
    });
};

export const createAuthRateLimiter = async () => {
    if (!redisClient) await initRateLimitStore();
    return rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 15,
        handler: authRateLimitHandler,
        skip: () => isTestEnv,
        standardHeaders: true,
        legacyHeaders: false,
        store: createStore('rl:auth2:'),
        keyGenerator: (req) =>
            ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? 'unknown')
    });
};
