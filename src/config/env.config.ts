import "dotenv/config";

export const env = {
	// Server Configuration
	port: process.env.PORT,
	nodeEnv: process.env.NODE_ENV,
	corsOrigin: process.env.CORS_ORIGIN,

	// JWT Configuration
	jwtSecret: process.env.JWT_SECRET,
	jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,

	// Database Configuration
	databaseUrl: process.env.DATABASE_URL,

	// SMTP Configuration
	smtpHost: process.env.SMTP_HOST,
	smtpPort: process.env.SMTP_PORT,
	smtpSecure: process.env.SMTP_SECURE,
	smtpUser: process.env.SMTP_USER,
	smtpPass: process.env.SMTP_PASS,
	smtpFrom: process.env.SMTP_FROM,

	// Google OAuth Configuration
	appUrl: process.env.APP_URL,
	googleClientId: process.env.GOOGLE_CLIENT_ID,
	googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
	googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL,
}

export function checkEnv(): void {
	if (!env.port || !env.nodeEnv || !env.corsOrigin || !env.jwtSecret || !env.jwtRefreshSecret || !env.databaseUrl || !env.smtpHost || !env.smtpPort || !env.smtpSecure || !env.smtpUser || !env.smtpPass || !env.smtpFrom || !env.appUrl || !env.googleClientId || !env.googleClientSecret || !env.googleCallbackUrl) {
		throw new Error("Missing required environment variables");
	}
}