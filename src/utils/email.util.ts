import nodemailer from 'nodemailer';
import { env } from '../config/env.config.js';
import logger from './logger.util.js';

const transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: parseInt(env.smtpPort || '587'),
    secure: env.smtpSecure === 'true',
    auth: {
        user: env.smtpUser,
        pass: env.smtpPass
    }
});

export const sendEmail = async ({
    to,
    subject,
    html
}: {
    to: string;
    subject: string;
    html: string;
}) => {
    try {
        if (env.nodeEnv === 'production') {
            const info = await transporter.sendMail({
                from: env.smtpFrom,
                to,
                subject,
                html
            });
            logger.info(`Email sent to ${to}: ${info.messageId}`);
            return info;
        }
    } catch (error) {
        logger.error(
            `Error sending email to ${to}: ${error instanceof Error ? error.message : String(error)}`
        );
        throw error;
    }
};

type NotificationEmailData = {
    type: 'import_failed' | 'churn_alert' | 'sync_failed' | 'lifecycle_change';
    title: string;
    message: string;
    actionUrl?: string;
};

const getNotificationEmailTemplate = (data: NotificationEmailData): string => {
    const { title, message, actionUrl } = data;

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f6f6f6;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f6f6f6;">
        <tr>
            <td align="center" style="padding: 20px 0;">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <tr>
                        <td style="padding: 30px;">
                            <h1 style="margin: 0 0 15px 0; font-size: 24px; font-weight: 600; color: #1a1a1a;">${title}</h1>
                            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5; color: #4a4a4a;">${message}</p>
                            ${
                                actionUrl
                                    ? `
                            <table cellpadding="0" cellspacing="0" style="margin-top: 20px;">
                                <tr>
                                    <td style="background-color: #2563eb; border-radius: 6px; padding: 12px 24px;">
                                        <a href="${actionUrl}" style="color: #ffffff; text-decoration: none; font-weight: 500; display: inline-block;">View Details</a>
                                    </td>
                                </tr>
                            </table>
                            `
                                    : ''
                            }
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 20px 30px; border-top: 1px solid #e5e5e5; background-color: #fafafa; border-radius: 0 0 8px 8px;">
                            <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">This is an automated notification from your CRM.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `.trim();
};

export const sendNotificationEmail = async ({
    to,
    data
}: {
    to: string;
    data: NotificationEmailData;
}): Promise<void> => {
    const subject = `[CRM] ${data.title}`;

    try {
        await sendEmail({
            to,
            subject,
            html: getNotificationEmailTemplate(data)
        });
    } catch (error) {
        logger.error(
            `Failed to send notification email to ${to}: ${error instanceof Error ? error.message : String(error)}`
        );
    }
};
