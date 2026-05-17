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
    redisUrl: process.env.REDIS_URL,

    // Google OAuth Configuration
    appUrl: process.env.APP_URL,
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL,

    // Meta Integration
    metaVerifyToken: process.env.META_VERIFY_TOKEN,
    metaAppSecret: process.env.META_APP_SECRET,

    // Sentry Monitoring
    sentryDsn: process.env.SENTRY_DSN,

    // Backblaze B2 Configuration
    b2KeyId: process.env.B2_KEY_ID,
    b2ApplicationKey: process.env.B2_APPLICATION_KEY,
    b2Region: process.env.B2_REGION,
    b2BucketName: process.env.B2_BUCKET_NAME,

    // Cloudflare Configuration
    cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN,
    cloudflareZoneId: process.env.CLOUDFLARE_ZONE_ID,
    cloudflarePublicDomain: process.env.CF_PUBLIC_DOMAIN,

    // Shopify Configuration
    shopifyClientId: process.env.SHOPIFY_CLIENT_ID,
    shopifyClientSecret: process.env.SHOPIFY_CLIENT_SECRET,
    shopifyScopes:
        process.env.SHOPIFY_SCOPES ||
        'read_customers,read_orders,read_products,read_inventory,write_pixels',

    // Paymob Configuration
    paymobApiKey: process.env.PAYMOB_API_KEY,
    paymobSecretKey: process.env.PAYMOB_SECRET_KEY,
    paymobPublicKey: process.env.PAYMOB_PUBLIC_KEY,
    paymobCardIntegrationId: process.env.PAYMOB_CARD_INTEGRATION_ID
        ? Number(process.env.PAYMOB_CARD_INTEGRATION_ID)
        : undefined,
    paymobBaseUrl: process.env.PAYMOB_BASE_URL || 'https://accept.paymob.com',

    // Encryption
    encryptionKey: process.env.ENCRYPTION_KEY || process.env.BETTER_AUTH_SECRET
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
    if (env.nodeEnv !== 'test') {
        if (!env.shopifyClientId) missingVars.push('SHOPIFY_CLIENT_ID');
        if (!env.shopifyClientSecret) missingVars.push('SHOPIFY_CLIENT_SECRET');
        if (!env.encryptionKey) missingVars.push('ENCRYPTION_KEY');
        if (!env.paymobApiKey) missingVars.push('PAYMOB_API_KEY');
        if (!env.paymobSecretKey) missingVars.push('PAYMOB_SECRET_KEY');
        if (!env.paymobPublicKey) missingVars.push('PAYMOB_PUBLIC_KEY');
        if (!env.paymobCardIntegrationId)
            missingVars.push('PAYMOB_CARD_INTEGRATION_ID');
    }

    if (missingVars.length > 0) {
        throw new Error(
            `Missing required environment variables: ${missingVars.join(', ')}`
        );
    }

    const hasRedis = env.redisUrl;
    const hasB2 = env.b2KeyId && env.b2ApplicationKey && env.b2BucketName;
    if (!hasRedis) {
        // Warning log omitted to avoid circular dependency with logger
    }
    if (!hasB2) {
        // Warning log omitted
    }
}
