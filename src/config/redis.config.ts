import type { ConnectionOptions } from 'bullmq';
import { env } from '../config/env.config.js';
import { createClient, type RedisClientType } from '@redis/client';
import * as Sentry from '@sentry/bun';
import logger from '../utils/logger.util.js';

const isTestEnv = process.env.NODE_ENV === 'test';

export const redisConnection: string | undefined = env.redisUrl;

function parseRedisUrl(): ConnectionOptions | undefined {
    if (!env.redisUrl) return undefined;
    try {
        const url = new URL(env.redisUrl);
        return {
            host: url.hostname,
            port: parseInt(url.port) || (url.protocol === 'rediss:' ? 443 : 6379)
        };
    } catch {
        return undefined;
    }
}

export function getRedisConnectionOptions(): ConnectionOptions {
    const opts = parseRedisUrl();
    if (!opts) {
        throw new Error('Redis not configured');
    }
    return opts;
}

export const isRedisAvailable = isTestEnv
    ? false
    : !!(env.redisUrl && env.redisUrl.length > 0);

let redisClient: RedisClientType | null = null;
let wasAvailable = false;
let lastHealthCheck: Awaited<ReturnType<typeof checkRedisHealth>> | null = null;
let healthCheckInterval: ReturnType<typeof setInterval> | null = null;

const HEALTH_CHECK_INTERVAL_MS = 60_000; // 1 minute

export function startRedisHealthMonitor(): void {
    if (!isRedisAvailable || healthCheckInterval || isTestEnv) return;

    healthCheckInterval = setInterval(async () => {
        const health = await checkRedisHealth();
        lastHealthCheck = health;

        if (wasAvailable && !health.available) {
            logger.error(
                { error: health.error },
                'Redis became unavailable - imports/exports will run synchronously'
            );
            Sentry.captureMessage(
                `Redis unavailable: ${health.error}. Imports/exports now running synchronously.`,
                'warning'
            );
        } else if (!wasAvailable && health.available) {
            logger.info(
                { latency: health.latency },
                'Redis became available again'
            );
        }

        wasAvailable = health.available;
    }, HEALTH_CHECK_INTERVAL_MS);

    logger.info('[Redis] Health monitor started');
}

export function stopRedisHealthMonitor(): void {
    if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
        healthCheckInterval = null;
        logger.info('[Redis] Health monitor stopped');
    }
}

export { lastHealthCheck };

export async function getRedisClient(): Promise<RedisClientType | null> {
    if (!isRedisAvailable) return null;

    if (!redisClient) {
        redisClient = createClient({ url: env.redisUrl });
        redisClient.on('error', (err: Error) => {
            logger.error({ err }, 'Redis client error');
            redisClient = null;
        });
    }

    if (!redisClient.isOpen) {
        try {
            await redisClient.connect();
        } catch (err) {
            logger.warn(
                { err },
                'Failed to connect to Redis, will retry on next health check'
            );
            redisClient = null;
            return null;
        }
    }

    return redisClient;
}

export async function checkRedisHealth(): Promise<{
    available: boolean;
    latency?: number;
    error?: string;
}> {
    if (!isRedisAvailable) {
        return { available: false, error: 'Redis not configured' };
    }

    try {
        const client = await getRedisClient();
        if (!client) {
            return { available: false, error: 'Failed to create client' };
        }

        const start = Date.now();
        await client.ping();
        const latency = Date.now() - start;

        return { available: true, latency };
    } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown error';
        return { available: false, error };
    }
}
