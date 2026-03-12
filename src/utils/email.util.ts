import nodemailer from "nodemailer";
import { env } from "../config/env.config.js";
import { logger } from "./logger.util.js";

const transporter = nodemailer.createTransport({
	host: env.smtpHost,
	port: parseInt(env.smtpPort || "587"),
	secure: env.smtpSecure === "true",
	auth: {
		user: env.smtpUser,
		pass: env.smtpPass,
	},
});

export const sendEmail = async ({ to, subject, html }: { to: string; subject: string; html: string }) => {
	try {
		const info = await transporter.sendMail({
			from: env.smtpFrom,
			to,
			subject,
			html,
		});
		logger.info(`Email sent to ${to}: ${info.messageId}`);
		return info;
	} catch (error) {
		logger.error(`Error sending email to ${to}: ${error instanceof Error ? error.message : String(error)}`);
		throw error;
	}
};
