import { betterAuth } from 'better-auth';
import { bearer, organization } from 'better-auth/plugins';
import { createAccessControl } from 'better-auth/plugins/access';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import prisma from '../../config/prisma.config.js';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';
import { env } from '../../config/env.config.js';
import { sendEmail } from '../../utils/email.util.js';
import { DEFAULT_ROLES } from '../../config/roles.config.js';

const ac = createAccessControl({
    organization: ['update', 'delete'],
    member: ['create', 'update', 'delete'],
    invitation: ['create', 'cancel'],
    ac: ['create', 'read', 'update', 'delete'],
    orders: ['read', 'write', 'delete']
});

export const auth = betterAuth({
    database: prismaAdapter(prisma, {
        provider: 'postgresql'
    }),
    rateLimit: {
        window: 10,
        max: 100
    },
    emailAndPassword: {
        enabled: true,
        requireEmailVerification: process.env.NODE_ENV !== 'test',
        sendResetPassword: async ({ user, url }) => {
            await sendEmail({
                to: user.email,
                subject: 'Reset your password',
                html: `
					<p>Hi ${user.name ?? 'there'},</p>
					<p>You requested to reset your password. Click the button below to continue:</p>
					<br/>
					<a href="${url}" style="padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a>
					<p>If you didn't request this, you can safely ignore this email.</p>
				`
            });
        }
    },
    emailVerification: {
        sendVerificationEmail: async ({ user, url }) => {
            await sendEmail({
                to: user.email,
                subject: 'Verify your email address',
                html: `
					<p>Hi ${user.name ?? 'there'},</p>
					<p>Welcome to our CRM! Please verify your email address by clicking the button below:</p>
					<br/>
					<a href="${url}" style="padding: 10px 20px; background-color: #28a745; color: white; text-decoration: none; border-radius: 5px;">Verify Email</a>
				`
            });
        }
    },
    plugins: [
        bearer(),
        organization({
            ac: ac,
            // User can only create an organization if they are not already a member of one.
            allowUserToCreateOrganization: async (user) => {
                const memberships = await prisma.member.count({
                    where: { userId: user.id }
                });
                return memberships === 0;
            },
            // Each user can own at most one organization.
            organizationLimit: 1,
            // The creator gets the root role with full permissions.
            creatorRole: 'root',
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
                root: ac.newRole(DEFAULT_ROLES.root),
                admin: ac.newRole(DEFAULT_ROLES.admin),
                member: ac.newRole(DEFAULT_ROLES.member)
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
    },
    advanced: {
        disableOriginCheck: true
    },
    databaseHooks: {
        session: {
            create: {
                before: async (session) => {
                    if (!session.activeOrganizationId) {
                        const member = await prisma.member.findFirst({
                            where: { userId: session.userId }
                        });
                        if (member) {
                            return {
                                data: {
                                    ...session,
                                    activeOrganizationId: member.organizationId
                                }
                            };
                        }
                    }
                }
            }
        }
    }
});


/**
 * Retrieve the current authentication session from request headers.
 *
 * @param headers Request headers containing authentication credentials.
 * @returns The resolved session payload from Better Auth.
 */
export const getAuthContext = async (headers: Request['headers']) => {
    const session = await auth.api.getSession({
        headers: fromNodeHeaders(headers)
    });
    return session;
};
