import { Router } from 'express';
import { checkRedisHealth } from '../config/redis.config.js';
import { ResponseHandler, HttpStatus } from '../utils/response.util.js';
import { asyncHandler } from '../middlewares/error.middleware.js';
import prisma from '../config/prisma.config.js';

const router = Router();

router.get(
    '/',
    asyncHandler(async (req, res) => {
        const [redis, db] = await Promise.all([
            checkRedisHealth(),
            checkDatabaseHealth()
        ]);

        const allHealthy = redis.available && db.available;

        return ResponseHandler.success(
            res,
            allHealthy ? 'All services healthy' : 'Some services unhealthy',
            allHealthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE,
            {
                redis,
                database: db,
                timestamp: new Date().toISOString()
            }
        );
    })
);

async function checkDatabaseHealth(): Promise<{
    available: boolean;
    latency?: number;
    error?: string;
}> {
    try {
        const start = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        const latency = Date.now() - start;

        return { available: true, latency };
    } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown error';
        return { available: false, error };
    }
}

export default router;