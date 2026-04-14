import prisma from '../../config/prisma.config.js';
import { auth } from '../../api/auth/auth.js';
import { fromNodeHeaders } from 'better-auth/node';

export interface TestAuth {
    token: string;
    orgId: string;
    userId: string;
}

export async function createTestUser(
    email: string,
    orgName: string,
    orgSlug: string
): Promise<TestAuth> {
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
        userId
    };
}

export async function cleanupTestUser(email: string, orgId: string) {
    // Delete by organizationId first (cascading for some models)
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

    // Auth cleanup
    await prisma.member.deleteMany({ where: { organizationId: orgId } });
    await prisma.session.deleteMany({ where: { user: { email } } });
    await prisma.account.deleteMany({ where: { user: { email } } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.user.deleteMany({ where: { email } });
}
