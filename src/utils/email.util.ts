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

export type BuildEmailHtmlParams = {
    title: string;
    body: string;
    previewText?: string;
    orgLogo?: string;
    cta?: {
        url: string;
        text: string;
    };
    footerText?: string;
};

export function buildEmailHtml(params: BuildEmailHtmlParams): string {
    const { title, body, previewText, orgLogo, cta, footerText } = params;

    const logoHtml = orgLogo
        ? `<img src="${orgLogo}" alt="Organization logo" style="height: 32px; width: auto; display: block; border: 0; outline: none;" />`
        : `<span style="font-family: 'Poppins', Arial, sans-serif; font-size: 22px; font-weight: 700; color: #4B91E2; letter-spacing: -0.3px;">Briefly</span>`;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${title}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet" />
</head>
<body style="margin: 0; padding: 0; background-color: #F8FAFC; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
    ${previewText ? `<div style="display: none; font-size: 1px; color: #F8FAFC; line-height: 1px; max-height: 0; max-width: 0; opacity: 0; overflow: hidden;">${previewText}</div>` : ''}

    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F8FAFC; min-height: 100vh;">
        <tr>
            <td align="center" style="padding: 40px 16px;">

                <!-- Logo -->
                <table width="600" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                    <tr>
                        <td align="center">
                            ${logoHtml}
                        </td>
                    </tr>
                </table>

                <!-- Card -->
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #FFFFFF; border-radius: 16px; border: 1px solid #E5E7EB; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    <tr>
                        <td style="padding: 40px 40px 32px;">
                            <h1 style="margin: 0 0 12px; font-size: 22px; font-weight: 600; color: #1A1A1A; line-height: 1.3;">${title}</h1>
                            <div style="font-size: 15px; line-height: 1.7; color: #6B7280;">
                                ${body}
                            </div>
                            ${cta ? `\n                            <table cellpadding="0" cellspacing="0" style="margin-top: 28px;">\n                                <tr>\n                                    <td style="background-color: #4B91E2; border-radius: 8px; padding: 0;">\n                                        <a href="${cta.url}" style="display: inline-block; padding: 12px 28px; font-family: 'Poppins', Arial, sans-serif; font-size: 14px; font-weight: 500; color: #FFFFFF; text-decoration: none; border-radius: 8px;">${cta.text}</a>\n                                    </td>\n                                </tr>\n                            </table>\n                            ` : ''}
                        </td>
                    </tr>
                </table>

                <!-- Footer -->
                <table width="600" cellpadding="0" cellspacing="0" style="margin-top: 24px;">
                    <tr>
                        <td align="center" style="padding: 0 40px;">
                            <p style="margin: 0 0 4px; font-size: 12px; color: #9CA3AF; line-height: 1.5;">
                                ${footerText || 'This is an automated email from Briefly CRM.'}
                            </p>
                            <p style="margin: 0; font-size: 11px; color: #D1D5DB; line-height: 1.5;">
                                &copy; ${new Date().getFullYear()} Briefly CRM. All rights reserved.
                            </p>
                        </td>
                    </tr>
                </table>

            </td>
        </tr>
    </table>
</body>
</html>
    `.trim();
}

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

        logger.info(
            {
                to,
                subject,
                htmlLength: html.length
            },
            `[DEV] Email send simulated (SMTP not used in ${env.nodeEnv || 'development'} mode)`
        );
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

    return buildEmailHtml({
        title,
        body: `<p style="margin: 0 0 16px;">${message}</p>`,
        cta: actionUrl ? { url: actionUrl, text: 'View Details' } : undefined,
        footerText: 'This is an automated notification from Briefly CRM.'
    });
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
