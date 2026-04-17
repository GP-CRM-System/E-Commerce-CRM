import { faker } from '@faker-js/faker';
import prisma from '../config/prisma.config.js';
import { DEFAULT_ROLES } from '../config/roles.config.js';
import { auth } from '../api/auth/auth.js';
import logger from '../utils/logger.util.js';
import type { Prisma } from '../generated/prisma/client.js';

async function safeDelete<T>(fn: () => Promise<T>): Promise<void> {
    try {
        await fn();
    } catch {
        // Table may not exist
    }
}

async function resetDatabase() {
    logger.info('[SEED] Resetting database...\n');

    await safeDelete(() => prisma.webhookLog.deleteMany());
    await safeDelete(() => prisma.syncLog.deleteMany());
    await safeDelete(() => prisma.integration.deleteMany());
    await safeDelete(() => prisma.customerEvent.deleteMany());
    await safeDelete(() => prisma.note.deleteMany());
    await safeDelete(() => prisma.orderItem.deleteMany());
    await safeDelete(() => prisma.order.deleteMany());
    await safeDelete(() => prisma.productVariant.deleteMany());
    await safeDelete(() => prisma.product.deleteMany());
    await safeDelete(() => prisma.tag.deleteMany());
    await safeDelete(() => prisma.segment.deleteMany());
    await safeDelete(() => prisma.campaign.deleteMany());
    await safeDelete(() => prisma.supportTicket.deleteMany());
    await safeDelete(() => prisma.organizationRole.deleteMany());
    await safeDelete(() => prisma.invitation.deleteMany());
    await safeDelete(() => prisma.member.deleteMany());
    await safeDelete(() => prisma.session.deleteMany());
    await safeDelete(() => prisma.account.deleteMany());
    await safeDelete(() => prisma.auditLog.deleteMany());
    await safeDelete(() => prisma.verification.deleteMany());
    await safeDelete(() => prisma.transaction.deleteMany());
    await safeDelete(() => prisma.message.deleteMany());
    await safeDelete(() => prisma.conversation.deleteMany());
    await safeDelete(() => prisma.ticketNote.deleteMany());
    await safeDelete(() => prisma.user.deleteMany());
    await safeDelete(() => prisma.organization.deleteMany());

    logger.info('[SEED] Database reset complete\n');
}

async function createOrganizations(adminUserId: string) {
    logger.info('[SEED] Creating organizations directly via Prisma...');

    const orgNames = ['Demo Organization', faker.company.name()];
    const organizations = [];

    for (const name of orgNames) {
        const slug =
            name
                .toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/[^a-z0-9-]/g, '') +
            '-' +
            faker.string.alphanumeric(4);

        const org = await prisma.organization.create({
            data: {
                name,
                slug,
                logo: faker.image.url(),
                members: {
                    create: {
                        userId: adminUserId,
                        role: 'owner',
                        createdAt: new Date()
                    }
                }
            }
        });

        organizations.push({ id: org.id });

        // Create default roles
        for (const [roleName, permissions] of Object.entries(DEFAULT_ROLES)) {
            await prisma.organizationRole.create({
                data: {
                    organizationId: org.id,
                    role: roleName.toLowerCase(),
                    permission: JSON.stringify(permissions)
                }
            });
        }
    }

    logger.info(
        `[SEED] Created ${organizations.length} organizations with members\n`
    );
    return organizations;
}

async function createUsers() {
    logger.info('[SEED] Creating users via Better Auth API...');

    const users = [];

    // Create first user as the admin
    const adminEmail = 'admin@example.com';
    const adminUser = await auth.api.signUpEmail({
        body: {
            email: adminEmail,
            password: 'Admin123!',
            name: 'Admin User'
        }
    });

    if (!adminUser?.user) throw new Error('Failed to create admin user');
    const adminUserId = adminUser.user.id;
    users.push({ id: adminUserId, email: adminEmail });

    // Create remaining users
    for (let i = 0; i < 19; i++) {
        const email = faker.internet.email().toLowerCase();
        const user = await auth.api.signUpEmail({
            body: {
                email,
                password: 'TestPassword123!',
                name: faker.person.fullName()
            }
        });
        if (user?.user) {
            users.push({ id: user.user.id, email });
        }
    }

    logger.info(`[SEED] Created ${users.length} users\n`);
    return { users, adminUserId };
}

async function createMemberships(
    organizations: { id: string }[],
    users: { id: string; email: string }[],
    adminUserId: string
) {
    logger.info('[SEED] Creating additional memberships...');

    let count = 0;
    for (const org of organizations) {
        // Filter out admin since they are already owners
        const availableUsers = users.filter((u) => u.id !== adminUserId);
        const orgUsers = faker.helpers.arrayElements(availableUsers, 5);

        for (const user of orgUsers) {
            await prisma.member.create({
                data: {
                    organizationId: org.id,
                    userId: user.id,
                    role: faker.helpers.arrayElement(['admin', 'member']),
                    createdAt: new Date()
                }
            });
            count++;
        }
    }

    logger.info(`[SEED] Created ${count} additional memberships\n`);
}

async function createCustomers(organizations: { id: string }[]) {
    logger.info('[SEED] Creating customers...');

    let totalCreated = 0;
    const lifecycleStages = [
        'PROSPECT',
        'ONE_TIME',
        'RETURNING',
        'LOYAL',
        'VIP',
        'AT_RISK',
        'CHURNED',
        'WINBACK'
    ] as const;
    const sources = [
        'WEBSITE',
        'SOCIAL',
        'REFERRAL',
        'ORGANIC',
        'EMAIL',
        'CAMPAIGN',
        'OTHER'
    ] as const;

    for (const org of organizations) {
        const customers = [];
        for (let i = 0; i < 250; i++) {
            customers.push({
                name: faker.person.fullName(),
                email: faker.internet.email().toLowerCase(),
                phone: faker.phone.number(),
                city: faker.location.city(),
                source: faker.helpers.arrayElement(sources),
                lifecycleStage: faker.helpers.arrayElement(lifecycleStages),
                totalSpent: faker.number.float({ min: 0, max: 5000 }),
                organizationId: org.id,
                acceptsMarketing: faker.datatype.boolean()
            });
        }
        await prisma.customer.createMany({
            data: customers as Prisma.CustomerCreateManyInput[]
        });
        totalCreated += customers.length;
    }
    logger.info(`[SEED] Created ${totalCreated} customers\n`);
}

async function createProducts(organizations: { id: string }[]) {
    logger.info('[SEED] Creating products...');
    let totalCreated = 0;
    for (const org of organizations) {
        const products = [];
        for (let i = 0; i < 50; i++) {
            products.push({
                name: faker.commerce.productName(),
                price: faker.number.float({ min: 10, max: 500 }),
                sku: faker.string.alphanumeric(8).toUpperCase(),
                inventory: faker.number.int({ min: 0, max: 100 }),
                organizationId: org.id
            });
        }
        await prisma.product.createMany({
            data: products as Prisma.ProductCreateManyInput[]
        });
        totalCreated += products.length;
    }
    logger.info(`[SEED] Created ${totalCreated} products\n`);
}

async function createOrders(organizations: { id: string }[]) {
    logger.info('[SEED] Creating orders...');
    let totalCreated = 0;
    for (const org of organizations) {
        const customers = await prisma.customer.findMany({
            where: { organizationId: org.id },
            select: { id: true }
        });
        const orders = [];
        for (let i = 0; i < 100; i++) {
            const customer = faker.helpers.arrayElement(customers);
            orders.push({
                organizationId: org.id,
                customerId: customer.id,
                totalAmount: faker.number.float({ min: 20, max: 1000 }),
                currency: 'EGP',
                paymentStatus: 'PAID',
                shippingStatus: 'DELIVERED',
                createdAt: faker.date.past({ years: 1 })
            });
        }
        await prisma.order.createMany({
            data: orders as Prisma.OrderCreateManyInput[]
        });
        totalCreated += orders.length;
    }
    logger.info(`[SEED] Created ${totalCreated} orders\n`);
}

async function createTransactions(organizations: { id: string }[]) {
    logger.info('[SEED] Creating transactions...');
    let totalCreated = 0;
    for (const org of organizations) {
        const orders = await prisma.order.findMany({
            where: { organizationId: org.id }
        });
        const txs = orders.map((o) => ({
            organizationId: org.id,
            orderId: o.id,
            amount: o.totalAmount,
            provider: 'FAWRY',
            status: 'SUCCESS',
            type: 'PAYMENT',
            externalId: `fawry_${faker.string.alphanumeric(8)}`
        }));
        await prisma.transaction.createMany({
            data: txs as Prisma.TransactionCreateManyInput[]
        });
        totalCreated += txs.length;
    }
    logger.info(`[SEED] Created ${totalCreated} transactions\n`);
}

async function createConversations(organizations: { id: string }[]) {
    logger.info('[SEED] Creating conversations...');
    for (const org of organizations) {
        const customers = await prisma.customer.findMany({
            where: { organizationId: org.id },
            take: 10
        });
        for (const customer of customers) {
            const conversation = await prisma.conversation.create({
                data: {
                    organizationId: org.id,
                    customerId: customer.id,
                    provider: 'whatsapp',
                    externalId: `wa_${faker.string.alphanumeric(8)}`
                }
            });
            await prisma.message.create({
                data: {
                    conversationId: conversation.id,
                    direction: 'INBOUND',
                    content: 'Hello, I need help with my order',
                    status: 'READ'
                }
            });
        }
    }
    logger.info('[SEED] Created sample conversations\n');
}

async function createSupportTickets(organizations: { id: string }[]) {
    logger.info('[SEED] Creating support tickets...');
    for (const org of organizations) {
        const customers = await prisma.customer.findMany({
            where: { organizationId: org.id },
            take: 5
        });
        const users = await prisma.member.findMany({
            where: { organizationId: org.id },
            take: 2
        });
        for (const customer of customers) {
            const ticket = await prisma.supportTicket.create({
                data: {
                    organizationId: org.id,
                    customerId: customer.id,
                    subject: 'Delivery issue',
                    description: 'My order has not arrived yet',
                    status: 'OPEN',
                    assignedToId: users[0]?.userId
                }
            });
            await prisma.ticketNote.create({
                data: {
                    ticketId: ticket.id,
                    authorId: users[1]?.userId ?? users[0]?.userId ?? '',
                    body: 'Looking into the courier status',
                    isInternal: true
                }
            });
        }
    }
    logger.info('[SEED] Created sample tickets with notes\n');
}

async function main() {
    logger.info('[SEED] DATABASE SEED SCRIPT');
    const startTime = Date.now();

    await resetDatabase();
    const { users, adminUserId } = await createUsers();
    const organizations = await createOrganizations(adminUserId);
    await createMemberships(organizations, users, adminUserId);
    await createCustomers(organizations);
    await createProducts(organizations);
    await createOrders(organizations);
    await createTransactions(organizations);
    await createConversations(organizations);
    await createSupportTickets(organizations);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info(`[SEED] COMPLETED in ${duration}s`);
}

main()
    .catch((error) => {
        logger.error(error);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
