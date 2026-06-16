import 'dotenv/config';

export const env = {
    // Server Configuration
    port: process.env.PORT as string,
    nodeEnv: process.env.NODE_ENV as string,
    corsOrigin: process.env.CORS_ORIGIN as string,
    timeZone: process.env.TZ as string,

    // Better Auth
    betterAuthSecret: process.env.BETTER_AUTH_SECRET as string,
    betterAuthUrl: (process.env.BETTER_AUTH_URL ||
        process.env.APP_URL) as string,

    // Database Configuration
    databaseUrl: process.env.DATABASE_URL as string,

    // SMTP Configuration
    smtpHost: process.env.SMTP_HOST as string,
    smtpPort: process.env.SMTP_PORT as string,
    smtpSecure: process.env.SMTP_SECURE as string,
    smtpUser: process.env.SMTP_USER as string,
    smtpPass: process.env.SMTP_PASS as string,
    smtpFrom: process.env.SMTP_FROM as string,

    // Redis Configuration (for BullMQ)
    redisUrl: process.env.REDIS_URL,

    // Google OAuth Configuration
    appUrl: process.env.APP_URL as string,
    googleClientId: process.env.GOOGLE_CLIENT_ID as string,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET as string,

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
    shopifyClientId: process.env.SHOPIFY_CLIENT_ID as string,
    shopifyClientSecret: process.env.SHOPIFY_CLIENT_SECRET as string,
    shopifyScopes: (process.env.SHOPIFY_SCOPES ||
        'read_customers,read_orders,read_products,read_inventory,write_pixels') as string,

    // Paymob Configuration
    paymobApiKey: process.env.PAYMOB_API_KEY as string,
    paymobSecretKey: process.env.PAYMOB_SECRET_KEY as string,
    paymobPublicKey: process.env.PAYMOB_PUBLIC_KEY as string,
    paymobCardIntegrationId: process.env.PAYMOB_CARD_INTEGRATION_ID
        ? Number(process.env.PAYMOB_CARD_INTEGRATION_ID)
        : undefined,
    paymobBaseUrl: (process.env.PAYMOB_BASE_URL ||
        'https://accept.paymob.com') as string,

    // Cloudinary Configuration
    cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME,
    cloudinaryApiKey: process.env.CLOUDINARY_API_KEY,
    cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET,

    // Hugging Face AI
    hfApiUrl: process.env.HF_API_URL as string,
    hfApiToken: process.env.HF_API_TOKEN,

    // Encryption
    encryptionKey: (process.env.ENCRYPTION_KEY ||
        process.env.BETTER_AUTH_SECRET) as string
};

export function checkEnv(): void {
    const missingVars: string[] = [];

    if (!env.port) missingVars.push('PORT');
    if (!env.nodeEnv) missingVars.push('NODE_ENV');
    if (!env.corsOrigin) missingVars.push('CORS_ORIGIN');
    if (!env.betterAuthSecret) missingVars.push('BETTER_AUTH_SECRET');
    if (!env.betterAuthUrl) missingVars.push('BETTER_AUTH_URL');
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
    // GOOGLE_CALLBACK_URL is auto-derived by Better Auth from APP_URL as {appUrl}/api/auth/callback/social
    if (env.nodeEnv !== 'test') {
        if (!env.shopifyClientId) missingVars.push('SHOPIFY_CLIENT_ID');
        if (!env.shopifyClientSecret) missingVars.push('SHOPIFY_CLIENT_SECRET');
        if (!env.encryptionKey) missingVars.push('ENCRYPTION_KEY');
        if (!env.paymobApiKey) missingVars.push('PAYMOB_API_KEY');
        if (!env.paymobSecretKey) missingVars.push('PAYMOB_SECRET_KEY');
        if (!env.paymobPublicKey) missingVars.push('PAYMOB_PUBLIC_KEY');
        if (!env.paymobCardIntegrationId)
            missingVars.push('PAYMOB_CARD_INTEGRATION_ID');
        if (!env.hfApiToken) missingVars.push('HF_API_TOKEN');
        if (!env.hfApiUrl) missingVars.push('HF_API_URL');
    }
    if (env.nodeEnv === 'production') {
        if (!env.metaVerifyToken) missingVars.push('META_VERIFY_TOKEN');
        if (!env.metaAppSecret) missingVars.push('META_APP_SECRET');
    }

    if (missingVars.length > 0) {
        throw new Error(
            `Missing required environment variables: ${missingVars.join(', ')}`
        );
    }

    const hasRedis = env.redisUrl;
    const hasB2 = env.b2KeyId && env.b2ApplicationKey && env.b2BucketName;
    const hasCloudinary =
        env.cloudinaryCloudName &&
        env.cloudinaryApiKey &&
        env.cloudinaryApiSecret;
    if (!hasRedis) {
        // Warning log omitted to avoid circular dependency with logger
    }
    if (!hasB2) {
        // Warning log omitted
    }
    if (!hasCloudinary) {
        // Warning log omitted
    }
}
