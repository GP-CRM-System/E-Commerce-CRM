import * as Sentry from '@sentry/bun';

Sentry.init({
    dsn: process.env.SENTRY_DSN ?? '___DSN___',

    sendDefaultPii: true,

    tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,

    enableLogs: true
});
