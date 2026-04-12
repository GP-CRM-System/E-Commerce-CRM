import { env } from '../config/env.config.js';

export const redisConnection = {
    host: env.redisHost,
    port: env.redisPort
};

export const isRedisAvailable = !!(env.redisHost && env.redisPort);
