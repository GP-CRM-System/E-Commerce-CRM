import * as Sentry from '@sentry/bun';

export const sentry = Sentry.init({
    dsn: process.env.SENTRY_DSN,

    sendDefaultPii: true,

    // 100% in dev, lower in production to control quota
    tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,

    enableLogs: true,

    // Useful for Vercel deployments to distinguish environments
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development'
});
