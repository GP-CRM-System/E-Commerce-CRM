import { env } from '../config/env.config.js';
import { createClient, type RedisClientType } from '@redis/client';

export const redisConnection = {
    host: env.redisHost,
    port: env.redisPort
};

export const isRedisAvailable = !!(env.redisHost && env.redisPort);

let redisClient: RedisClientType | null = null;

export async function getRedisClient(): Promise<RedisClientType | null> {
    if (!isRedisAvailable) return null;

    if (!redisClient) {
        redisClient = createClient({ socket: redisConnection });
        redisClient.on('error', (err: Error) => {
            logger.error({ err }, 'Redis client error');
            redisClient = null;
        });
    }

    if (!redisClient.isOpen) {
        await redisClient.connect();
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
            return { available: false, error: 'Failed to connect' };
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

import logger from '../utils/logger.util.js';
