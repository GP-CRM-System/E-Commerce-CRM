import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { checkEnv, env } from './config/env.config.js';
import prisma from './config/prisma.config.js';
import {
    notFoundHandler,
    errorHandler
} from './middlewares/error.middleware.js';
import logger from './utils/logger.util.js';
import apiRouter from './api/index.js';

checkEnv();

const app = express();

app.use(helmet());
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
        // Test database connection
        await prisma.$queryRaw`SELECT 1`;
        logger.info('[Init] Database connected successfully');

        const server = app.listen(env.port, async () => {
            logger.info(
                `[Init] Server running on http://localhost:${env.port}`
            );
        });

        /**
         * Graceful Shutdown
         */
        process.on('SIGTERM', async () => {
            logger.info('SIGTERM received, shutting down gracefully...');
            server.close(async () => {
                await prisma.$disconnect();
                logger.info('Server closed');
                process.exit(0);
            });
        });

        process.on('SIGINT', async () => {
            logger.info('SIGINT received, shutting down gracefully...');
            server.close(async () => {
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
