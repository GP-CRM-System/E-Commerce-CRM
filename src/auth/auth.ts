import { betterAuth } from "better-auth";
import { bearer, organization } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "../config/prisma.config.js";
import { fromNodeHeaders } from "better-auth/node";
import type { Request } from "express";
import { env } from "../config/env.config.js";
import { sendEmail } from "../utils/email.util.js";

const ac = createAccessControl({
	organization: ["update", "delete"],
	member: ["create", "update", "delete"],
	invitation: ["create", "cancel"],
	team: ["create", "update", "delete"],
	ac: ["create", "read", "update", "delete"],
	deals: ["read", "write", "delete"],
	employees: ["read", "write", "delete"],
});

export const auth = betterAuth({
	database: prismaAdapter(prisma, {
		provider: "postgresql",
	}),
	emailAndPassword: {
		enabled: true
	},
	plugins: [
		bearer(),
		organization({
			ac: ac,
			allowUserToCreateOrganization: true,
			organizationLimit: 1,
			creatorRole: "owner",
			sendInvitationEmail: async (data) => {
				const inviteUrl = `${env.appUrl}/accept-invitation?id=${data.invitation.id}`;
				await sendEmail({
					to: data.email,
					subject: `You've been invited to join ${data.organization.name}`,
					html: `
						<p>Hi there,</p>
						<p>${data.inviter.user.name} has invited you to join the organization <strong>${data.organization.name}</strong> as a <em>${data.role}</em>.</p>
						<br/>
						<a href="${inviteUrl}" style="padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Accept Invitation</a>
					`
				});
			},
			roles: {
				owner: ac.newRole({
					organization: ["update", "delete"],
					member: ["create", "update", "delete"],
					invitation: ["create", "cancel"],
					team: ["create", "update", "delete"],
					ac: ["create", "read", "update", "delete"],
					deals: ["read", "write", "delete"],
					employees: ["read", "write", "delete"],
				}),
				admin: ac.newRole({
					organization: ["update"],
					member: ["create", "update", "delete"],
					invitation: ["create", "cancel"],
					team: ["create", "update", "delete"],
					ac: ["create", "read", "update", "delete"],
				}),
				member: ac.newRole({
					organization: [],
					member: [],
					invitation: [],
					team: [],
					ac: ["read"],
				})
			},
			dynamicAccessControl: {
				enabled: true
			}
		})
	],
	trustedOrigins: [env.appUrl!],
	socialProviders: {
		google: {
			clientId: env.googleClientId!,
			clientSecret: env.googleClientSecret!
		}
	}
});

/**
 * Retrieve the current authentication session from request headers.
 *
 * @param headers Request headers containing authentication credentials.
 * @returns The resolved session payload from Better Auth.
 */
export const getAuthContext = async (headers: Request["headers"]) => {
	const session = await auth.api.getSession({
		headers: fromNodeHeaders(headers)
	});
	return session;
};
