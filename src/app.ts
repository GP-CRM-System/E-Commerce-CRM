import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import * as Sentry from '@sentry/bun';
import { checkEnv, env } from './config/env.config.js';
import prisma from './config/prisma.config.js';
import {
    notFoundHandler,
    errorHandler
} from './middlewares/error.middleware.js';
import logger from './utils/logger.util.js';
import apiRouter from './api/index.js';
import { apiReference } from '@scalar/express-api-reference';
import openApi from './openapi.json' with { type: 'json' };
import { importWorker } from './queues/import.queue.js';
import { rfmWorker } from './queues/rfm.processor.js';
import { closeImportQueue } from './api/imports/imports.service.js';
import { redisConnection, isRedisAvailable } from './config/redis.config.js';
import { RedisConnection } from 'bullmq';
import { auth } from './api/auth/auth.js';

checkEnv();

const app = express();

app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                'script-src': [
                    "'self'",
                    "'unsafe-inline'",
                    'https://cdn.jsdelivr.net',
                    'https://api.scalar.com'
                ],
                'script-src-elem': [
                    "'self'",
                    "'unsafe-inline'",
                    'https://cdn.jsdelivr.net',
                    'https://api.scalar.com'
                ],
                'connect-src': [
                    "'self'",
                    'https://cdn.jsdelivr.net',
                    'https://api.scalar.com'
                ],
                'img-src': ["'self'", 'data:', 'https://cdn.jsdelivr.net']
            }
        }
    })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(
    cors({
        origin: process.env.CORS_ORIGIN?.split(',') || [],
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        credentials: true,
        allowedHeaders: ['Content-Type', 'Authorization']
    })
);

// Auth routes
app.use('/api', apiRouter);

// Serve combined API documentation with Scalar
app.get(
    '/docs',
    apiReference({
        pageTitle: 'E-Commerce CRM API',
        sources: [
            {
                title: "Core API",
                content: openApi,
                slug: "core-api"
            },
            {
                title: "Auth",
                content: await auth.api.generateOpenAPISchema(),
                slug: "auth"
            }
        ]
    }
    )
);

// Serve Auth API documentation

// Sentry error handler - captures 5xx errors
Sentry.setupExpressErrorHandler(app);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

/**
 * Start the Express server after verifying database connectivity.
 *
 * @returns A promise that resolves after startup hooks are registered.
 */
export async function startServer(): Promise<void> {
    try {
        // Test PostgreSQL connection
        await prisma.$queryRaw`SELECT 1`;
        logger.info('[Init] PostgreSQL connected successfully');

        // Test Redis connection if available
        if (isRedisAvailable) {
            try {
                new RedisConnection(redisConnection);
                logger.info('[Init] Redis connected successfully');
            } catch (redisErr) {
                logger.error(`[Init] Redis connection failed: ${redisErr}`);
                throw new Error(
                    `Failed to connect to Redis: ${(redisErr as Error).message}`,
                    { cause: redisErr }
                );
            }
        } else {
            logger.warn(
                '[Init] Redis not configured, some features may be unavailable'
            );
        }

        const server = app.listen(env.port, async () => {
            logger.info(
                `[Init] Server running on http://localhost:${env.port}`
            );
            logger.info(`[Docs] Scalar docs http://localhost:${env.port}/docs`);
        });

        /**
         * Graceful Shutdown
         */
        process.on('SIGTERM', async () => {
            logger.info('SIGTERM received, shutting down gracefully...');
            server.close(async () => {
                await Sentry.close(2000);
                await importWorker.close();
                await rfmWorker.close();
                await closeImportQueue();
                await prisma.$disconnect();
                logger.info('Server closed');
                process.exit(0);
            });
        });

        process.on('SIGINT', async () => {
            logger.info('SIGINT received, shutting down gracefully...');
            server.close(async () => {
                await Sentry.close(2000);
                await importWorker.close();
                await rfmWorker.close();
                await closeImportQueue();
                await prisma.$disconnect();
                logger.info('Server closed');
                process.exit(0);
            });
        });
    } catch (err) {
        logger.error(`Failed to start server: ${err}`);
        process.exit(1);
    }
}

export default app;
