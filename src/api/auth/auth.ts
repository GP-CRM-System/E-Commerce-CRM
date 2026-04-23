import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins/bearer';
import { organization } from 'better-auth/plugins/organization';
import { openAPI } from 'better-auth/plugins';
import { createAccessControl } from 'better-auth/plugins/access';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import prisma from '../../config/prisma.config.js';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';
import { env } from '../../config/env.config.js';
import { sendEmail } from '../../utils/email.util.js';
import {
    AVAILABLE_PERMISSIONS,
    DEFAULT_ROLES
} from '../../config/roles.config.js';
import loggerUtil from '../../utils/logger.util.js';

const ac = createAccessControl(AVAILABLE_PERMISSIONS);

export const auth = betterAuth({
    baseURL: env.appUrl,
    database: prismaAdapter(prisma, {
        provider: 'postgresql'
    }),
    rateLimit: {
        window: 10,
        max: 100
    },
    session: {
        expiresIn: 60 * 60 * 24 * 7,
        updateAge: 60 * 60 * 24,
        cookieCache: {
            maxAge: 60 * 60 * 24
        }
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
            if (env.nodeEnv !== 'development') {
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
            } else {
                loggerUtil.info(
                    `User ${user.email} was sent a verification mail with url ${url}`
                );
            }
        }
    },
    user: {
        changeEmail: { enabled: true },
        deleteUser: { enabled: true }
    },
    account: {
        accountLinking: { enabled: true }
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
            // Use slug instead of ID for organization identification
            defaultOrganizationIdField: 'slug',
            // Invitation settings
            invitationExpiresIn: 60 * 60 * 24 * 7,
            invitationLimit: 100,
            // Membership settings
            membershipLimit: 100,
            // Prevent accidental organization deletion
            disableOrganizationDeletion: true,
            organizationHooks: {
                beforeDeleteOrganization: async (data) => {
                    const { exportOrganizationData } =
                        await import('../../utils/org-export.util.js');
                    const exportResult = await exportOrganizationData(
                        data.organization.id
                    );

                    if (exportResult.success && exportResult.downloadUrl) {
                        const owner = await prisma.member.findFirst({
                            where: {
                                organizationId: data.organization.id,
                                role: 'root'
                            },
                            include: { user: true }
                        });

                        if (owner?.user.email) {
                            await sendEmail({
                                to: owner.user.email,
                                subject: `Your organization data export is ready`,
                                html: `
                                    <p>Hi ${owner.user.name ?? 'there'},</p>
                                    <p>Your organization <strong>${data.organization.name}</strong> is scheduled for deletion.</p>
                                    <p>Your data export is ready for download:</p>
                                    <br/>
                                    <a href="${exportResult.downloadUrl}" style="padding: 10px 20px; background-color: #28a745; color: white; text-decoration: none; border-radius: 5px;">Download Your Data</a>
                                    <br/><br/>
                                    <p>This link will expire in 7 days.</p>
                                    <p><strong>Warning:</strong> Your organization and all associated data will be permanently deleted. This action cannot be undone.</p>
                                `
                            });
                        }
                    }
                }
            },
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
                root: ac.newRole(DEFAULT_ROLES['root']),
                admin: ac.newRole(DEFAULT_ROLES['admin']),
                member: ac.newRole(DEFAULT_ROLES['member'])
            },
            dynamicAccessControl: {
                enabled: true
            }
        }),
        openAPI()
    ],
    trustedOrigins: [env.appUrl!],
    socialProviders: {
        google: {
            clientId: env.googleClientId!,
            clientSecret: env.googleClientSecret!
        }
        // facebook: {
        //     clientId: env.facebookClientId!,
        //     clientSecret: env.facebookClientSecret!
        // },
        // microsoft: {
        //     clientId: env.microsoftClientId!,
        //     clientSecret: env.microsoftClientSecret!
        // }
    },
    advanced: {
        cookiePrefix: 'better-auth',
        ...(process.env.NODE_ENV === 'production' && {
            useSecureCookies: true
        })
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
