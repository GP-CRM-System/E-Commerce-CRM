import prisma from '../config/prisma.config.js';

async function main() {
    console.log('=== USERS ===');
    const users = await prisma.user.findMany({
        select: { id: true, email: true, name: true }
    });
    console.log(users);

    console.log('\n=== MEMBERS ===');
    const members = await prisma.member.findMany({
        select: { id: true, userId: true, organizationId: true, role: true }
    });
    console.log(members);

    console.log('\n=== ORGANIZATIONS ===');
    const orgs = await prisma.organization.findMany({
        select: { id: true, name: true, slug: true }
    });
    console.log(orgs);

    console.log('\n=== CONVERSATIONS ===');
    const convs = await prisma.conversation.findMany({
        select: {
            id: true,
            organizationId: true,
            provider: true,
            customerId: true
        }
    });
    console.log(convs);

    console.log('\n=== INTEGRATIONS ===');
    const integrations = await prisma.integration.findMany({
        select: {
            id: true,
            orgId: true,
            provider: true,
            isActive: true,
            metadata: true
        }
    });
    console.log(integrations);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
