import prisma from '../../config/prisma.config.js';
import { auth } from '../../api/auth/auth.js';
import { fromNodeHeaders } from 'better-auth/node';

export interface TestAuth {
    token: string;
    orgId: string;
    userId: string;
    email: string;
}

export async function createTestUser(
    email?: string,
    orgName?: string,
    orgSlug?: string
): Promise<TestAuth> {
    return createTestUserAndOrg({ email, orgName, orgSlug });
}

export async function createTestUserAndOrg(options?: {
    email?: string;
    orgName?: string;
    orgSlug?: string;
}): Promise<TestAuth> {
    const timestamp = Date.now();
    const email = options?.email ?? `test-${timestamp}@test.com`;
    const orgName = options?.orgName ?? `Test Org ${timestamp}`;
    const orgSlug = options?.orgSlug ?? `test-org-${timestamp}`;

    const signup = await auth.api.signUpEmail({
        body: {
            email,
            password: 'Password123!',
            name: 'Test User'
        }
    });

    if (!signup) throw new Error('Signup failed');
    const authToken = signup.token!;
    const userId = signup.user.id;

    await prisma.user.update({
        where: { id: userId },
        data: { emailVerified: true }
    });

    const org = await auth.api.createOrganization({
        headers: fromNodeHeaders({ authorization: `Bearer ${authToken}` }),
        body: {
            name: orgName,
            slug: orgSlug
        }
    });

    const orgResponse = org as {
        organization?: { id: string };
        id?: string;
    };
    const orgId = orgResponse.organization?.id ?? orgResponse.id ?? '';

    if (!orgId) throw new Error('Failed to get organization ID');

    await auth.api.setActiveOrganization({
        headers: fromNodeHeaders({ authorization: `Bearer ${authToken}` }),
        body: { organizationId: orgId }
    });

    const signin = await auth.api.signInEmail({
        body: { email, password: 'Password123!' }
    });

    if (!signin || !signin.token) throw new Error('Signin failed');

    return {
        token: signin.token,
        orgId,
        userId,
        email
    };
}

export async function createSecondOrgUser(): Promise<TestAuth> {
    return createTestUserAndOrg();
}

export async function cleanupTestUser(email: string, orgId: string) {
    return cleanupTestOrg(orgId, email);
}

export async function cleanupTestOrg(orgId: string, email: string) {
    if (!orgId || !email) return;

    await prisma.conversation.deleteMany({
        where: { organizationId: orgId }
    });
    await prisma.ticketNote.deleteMany({
        where: { ticket: { organizationId: orgId } }
    });
    await prisma.supportTicket.deleteMany({
        where: { organizationId: orgId }
    });
    await prisma.transaction.deleteMany({
        where: { organizationId: orgId }
    });
    await prisma.notification.deleteMany({ where: { organizationId: orgId } });
    await prisma.customerEvent.deleteMany({
        where: { customer: { organizationId: orgId } }
    });
    await prisma.note.deleteMany({
        where: { customer: { organizationId: orgId } }
    });
    await prisma.orderItem.deleteMany({
        where: { order: { organizationId: orgId } }
    });
    await prisma.order.deleteMany({ where: { organizationId: orgId } });
    await prisma.customer.deleteMany({ where: { organizationId: orgId } });
    await prisma.productVariant.deleteMany({
        where: { product: { organizationId: orgId } }
    });
    await prisma.product.deleteMany({ where: { organizationId: orgId } });
    await prisma.segment.deleteMany({ where: { organizationId: orgId } });
    await prisma.importJobError.deleteMany({
        where: { importJob: { organizationId: orgId } }
    });
    await prisma.importJob.deleteMany({ where: { organizationId: orgId } });
    await prisma.exportJob.deleteMany({ where: { organizationId: orgId } });
    await prisma.syncLog.deleteMany({ where: { integration: { orgId } } });
    await prisma.integration.deleteMany({ where: { orgId } });
    await prisma.webhookLog.deleteMany({ where: { integration: { orgId } } });
    await prisma.campaignRecipient.deleteMany({
        where: { campaign: { organizationId: orgId } }
    });
    await prisma.campaign.deleteMany({ where: { organizationId: orgId } });
    await prisma.emailTemplate.deleteMany({ where: { organizationId: orgId } });

    await prisma.member.deleteMany({ where: { organizationId: orgId } });
    await prisma.organizationRole.deleteMany({
        where: { organizationId: orgId }
    });
    await prisma.session.deleteMany({ where: { user: { email } } });
    await prisma.account.deleteMany({ where: { user: { email } } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.user.deleteMany({ where: { email } });
}

export function expectDefined<T>(
    value: T | undefined,
    message?: string
): asserts value is T {
    if (value === undefined) {
        throw new Error(message ?? 'Expected value to be defined');
    }
}

export function expectNotNull<T>(
    value: T | null,
    message?: string
): asserts value is T {
    if (value === null) {
        throw new Error(message ?? 'Expected value to not be null');
    }
}
