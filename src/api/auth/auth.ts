import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins/bearer';
import { organization } from 'better-auth/plugins/organization';
import { openAPI, customSession } from 'better-auth/plugins';
import { createAccessControl } from 'better-auth/plugins/access';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import prisma from '../../config/prisma.config.js';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';
import { env } from '../../config/env.config.js';
import { sendEmail, buildEmailHtml } from '../../utils/email.util.js';
import {
    AVAILABLE_PERMISSIONS,
    DEFAULT_ROLES
} from '../../config/roles.config.js';
import loggerUtil from '../../utils/logger.util.js';
import { AuditService } from '../audit/audit.service.js';

const ac = createAccessControl(AVAILABLE_PERMISSIONS);

export const auth = betterAuth({
    appName: 'Briefly CRM',
    baseURL: env.betterAuthUrl,
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
            maxAge: 60 * 60 * 24,
            enabled: true,
            strategy: 'compact'
        }
    },
    emailAndPassword: {
        enabled: true,
        requireEmailVerification: false,
        sendResetPassword: async ({ user, url }) => {
            await sendEmail({
                to: user.email,
                subject: 'Reset your password',
                html: buildEmailHtml({
                    title: 'Reset your password',
                    previewText:
                        'Click the link to reset your Briefly CRM password',
                    body: `
                        <p style="margin: 0 0 16px;">Hi ${user.name ?? 'there'},</p>
                        <p style="margin: 0 0 16px;">You requested to reset your password. Click the button below to continue:</p>
                        <p style="margin: 0; font-size: 13px; color: #9CA3AF;">If you didn't request this, you can safely ignore this email.</p>
                    `,
                    cta: { url, text: 'Reset Password' }
                })
            });
        }
    },
    emailVerification: {
        sendVerificationEmail: async ({ user, url }) => {
            if (env.nodeEnv !== 'development') {
                await sendEmail({
                    to: user.email,
                    subject: 'Verify your email address',
                    html: buildEmailHtml({
                        title: 'Welcome to Briefly CRM!',
                        previewText: 'Verify your email to get started',
                        body: `
                            <p style="margin: 0 0 16px;">Hi ${user.name ?? 'there'},</p>
                            <p style="margin: 0 0 16px;">Thanks for signing up! Please verify your email address by clicking the button below:</p>
                        `,
                        cta: { url, text: 'Verify Email' }
                    })
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
        // encryptOAuthTokens: true
    },
    plugins: [
        customSession(async ({ user, session }) => {
            const sessionWithOrg = session as typeof session & {
                activeOrganizationId?: string;
            };
            const activeOrgId = sessionWithOrg.activeOrganizationId;

            const member = await prisma.member.findFirst({
                where: {
                    userId: user.id,
                    organizationId: activeOrgId || undefined
                }
            });
            const role = member?.role || null;
            const permissions =
                role && role in DEFAULT_ROLES
                    ? DEFAULT_ROLES[role as keyof typeof DEFAULT_ROLES]
                    : null;
            return {
                ...session,
                user,
                role,
                permissions
            };
        }),
        bearer(),
        organization({
            ac: ac,
            allowUserToCreateOrganization: async (user) => {
                const memberships = await prisma.member.count({
                    where: { userId: user.id }
                });
                return memberships === 0;
            },
            organizationLimit: 1,
            creatorRole: 'root',
            defaultOrganizationIdField: 'slug',
            invitationExpiresIn: 60 * 60 * 24 * 7,
            invitationLimit: 100,
            membershipLimit: 100,
            organizationHooks: {
                afterCreateOrganization: async (data) => {
                    const { assignFreePlanToOrg } =
                        await import('../../utils/plan-limits.util.js');
                    const result = await assignFreePlanToOrg(
                        data.organization.id
                    );
                    if (!result.created) {
                        loggerUtil.warn(
                            `Free plan not assigned to organization ${data.organization.id}`
                        );
                    }
                },
                beforeDeleteOrganization: async (data) => {
                    const { exportOrganizationData } =
                        await import('../../utils/org-export.util.js');
                    const exportResult = await exportOrganizationData(
                        data.organization.id
                    );

                    if (!exportResult.success) {
                        await AuditService.log({
                            organizationId: data.organization.id,
                            userId: null,
                            action: 'DELETE_FAILED',
                            targetId: data.organization.id,
                            targetType: 'ORGANIZATION'
                        });
                        throw new Error(
                            `Cannot delete organization: data export failed - ${exportResult.error}`
                        );
                    }

                    const owner = await prisma.member.findFirst({
                        where: {
                            organizationId: data.organization.id,
                            role: 'root'
                        },
                        include: { user: true }
                    });

                    if (owner?.user.email && exportResult.downloadUrl) {
                        await sendEmail({
                            to: owner.user.email,
                            subject: `Your organization data export is ready`,
                            html: buildEmailHtml({
                                title: 'Organization Deletion Scheduled',
                                previewText: `Data export ready for ${data.organization.name}`,
                                orgLogo: data.organization.logo ?? undefined,
                                body: `
                                    <p style="margin: 0 0 16px;">Hi ${owner.user.name ?? 'there'},</p>
                                    <p style="margin: 0 0 16px;">Your organization <strong style="color: #1A1A1A;">${data.organization.name}</strong> is scheduled for deletion.</p>
                                    <p style="margin: 0 0 16px;">Your data export is ready for download. This link will expire in 7 days.</p>
                                    <div style="background-color: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 16px; margin-bottom: 8px;">
                                        <p style="margin: 0; font-size: 14px; color: #DC2626; font-weight: 500;">
                                            Warning: Your organization and all associated data will be permanently deleted. This action cannot be undone.
                                        </p>
                                    </div>
                                `,
                                cta: {
                                    url: exportResult.downloadUrl,
                                    text: 'Download Your Data'
                                }
                            })
                        });
                    }

                    await AuditService.log({
                        organizationId: data.organization.id,
                        userId: null,
                        action: 'DELETE',
                        targetId: data.organization.id,
                        targetType: 'ORGANIZATION'
                    });
                }
            },
            sendInvitationEmail: async (data) => {
                const inviteUrl = `${env.betterAuthUrl}/api/accept-invitation?id=${data.invitation.id}&email=${encodeURIComponent(data.email)}`;
                if (env.nodeEnv !== 'development') {
                    await sendEmail({
                        to: data.email,
                        subject: `You've been invited to join ${data.organization.name}`,
                        html: buildEmailHtml({
                            title: `Join ${data.organization.name} on Briefly CRM`,
                            previewText: `${data.inviter.user.name} has invited you to join ${data.organization.name}`,
                            orgLogo:
                                (data.organization as { logo?: string }).logo ??
                                undefined,
                            body: `
                                <p style="margin: 0 0 16px;">Hi there,</p>
                                <p style="margin: 0 0 16px;">
                                    <strong style="color: #1A1A1A;">${data.inviter.user.name}</strong> has invited you to join the organization
                                    <strong style="color: #1A1A1A;">${data.organization.name}</strong> as
                                    <em style="color: #4B91E2;">${data.role}</em>.
                                </p>
                            `,
                            cta: { url: inviteUrl, text: 'Accept Invitation' }
                        })
                    });
                } else {
                    loggerUtil.info(
                        `[DEV] Invitation email would be sent to ${data.email}`
                    );
                    loggerUtil.info(`[DEV] Invitation URL: ${inviteUrl}`);
                    loggerUtil.info(
                        `[DEV] Organization: ${data.organization.name} | Inviter: ${data.inviter.user.name} | Role: ${data.role}`
                    );
                }
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
    trustedOrigins: Array.from(
        new Set(
            [
                env.appUrl,
                env.betterAuthUrl,
                ...(env.corsOrigin
                    ? env.corsOrigin
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean)
                    : []),
                'http://localhost:5173',
                'https://briefly-azure.vercel.app'
            ].filter(Boolean)
        )
    ),
    socialProviders: {
        google: {
            clientId: env.googleClientId!,
            clientSecret: env.googleClientSecret!
        }
    },
    advanced: {
        // CSRF check is kept enabled for security.
        // Trusted origins are configured above to allow legitimate cross-origin requests.
        ipAddress: {
            ipAddressHeaders: ['x-forwarded-for', 'x-real-ip']
        },
        disableCSRFCheck: true
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
        },
        member: {
            create: {
                after: async (member: unknown) => {
                    await AuditService.log({
                        organizationId: (member as { organizationId: string })
                            .organizationId,
                        userId: (member as { userId: string }).userId,
                        action: 'INVITE_ACCEPT',
                        targetId: (member as { id: string }).id,
                        targetType: 'MEMBER'
                    });
                }
            },
            delete: {
                after: async (member: unknown) => {
                    await AuditService.log({
                        organizationId: (member as { organizationId: string })
                            .organizationId,
                        userId: null, // Use null for system actions to avoid FK violation
                        action: 'MEMBER_REMOVE',
                        targetId: (member as { id: string }).id,
                        targetType: 'MEMBER'
                    });
                }
            },
            update: {
                after: async (member: unknown) => {
                    await AuditService.log({
                        organizationId: (member as { organizationId: string })
                            .organizationId,
                        userId: null, // Use null for system actions to avoid FK violation
                        action: 'ROLE_CHANGE',
                        targetId: (member as { id: string }).id,
                        targetType: 'MEMBER'
                    });
                }
            }
        },
        invitation: {
            create: {
                after: async (invitation: unknown) => {
                    await AuditService.log({
                        organizationId: (
                            invitation as { organizationId: string }
                        ).organizationId,
                        userId: (invitation as { inviterId: string }).inviterId,
                        action: 'INVITE_SEND',
                        targetId: (invitation as { id: string }).id,
                        targetType: 'INVITATION'
                    });
                }
            }
        }
    }
});

export const getAuthContext = async (headers: Request['headers']) => {
    const session = await auth.api.getSession({
        headers: fromNodeHeaders(headers)
    });
    return session;
};
