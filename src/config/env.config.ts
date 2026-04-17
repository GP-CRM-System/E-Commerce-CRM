import 'dotenv/config';

export const env = {
    // Server Configuration
    port: process.env.PORT,
    nodeEnv: process.env.NODE_ENV,
    corsOrigin: process.env.CORS_ORIGIN,
    timeZone: process.env.TZ,

    // Better Auth
    betterAuthSecret: process.env.BETTER_AUTH_SECRET,

    // Database Configuration
    databaseUrl: process.env.DATABASE_URL,

    // SMTP Configuration
    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT,
    smtpSecure: process.env.SMTP_SECURE,
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    smtpFrom: process.env.SMTP_FROM,

    // Redis Configuration (for BullMQ)
    redisHost: process.env.REDIS_HOST,
    redisPort: process.env.REDIS_PORT
        ? parseInt(process.env.REDIS_PORT, 10)
        : undefined,

    // Google OAuth Configuration
    appUrl: process.env.APP_URL,
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL,

    // Meta Integration
    metaVerifyToken: process.env.META_VERIFY_TOKEN,
    metaAccessToken: process.env.META_ACCESS_TOKEN
};

export function checkEnv(): void {
    const missingVars: string[] = [];

    if (!env.port) missingVars.push('PORT');
    if (!env.nodeEnv) missingVars.push('NODE_ENV');
    if (!env.corsOrigin) missingVars.push('CORS_ORIGIN');
    if (!env.betterAuthSecret) missingVars.push('BETTER_AUTH_SECRET');
    if (!env.databaseUrl) missingVars.push('DATABASE_URL');
    if (!env.smtpHost) missingVars.push('SMTP_HOST');
    if (!env.smtpPort) missingVars.push('SMTP_PORT');
    if (!env.smtpSecure) missingVars.push('SMTP_SECURE');
    if (!env.smtpUser) missingVars.push('SMTP_USER');
    if (!env.smtpPass) missingVars.push('SMTP_PASS');
    if (!env.smtpFrom) missingVars.push('SMTP_FROM');
    if (!env.appUrl) missingVars.push('APP_URL');
    if (!env.googleClientId) missingVars.push('GOOGLE_CLIENT_ID');
    if (!env.googleClientSecret) missingVars.push('GOOGLE_CLIENT_SECRET');
    if (!env.googleCallbackUrl) missingVars.push('GOOGLE_CALLBACK_URL');

    if (missingVars.length > 0) {
        throw new Error(
            `Missing required environment variables: ${missingVars.join(', ')}`
        );
    }

    const hasRedis = env.redisHost && env.redisPort;
    if (!hasRedis) {
        // Warning log omitted to avoid circular dependency with logger
    }
}
