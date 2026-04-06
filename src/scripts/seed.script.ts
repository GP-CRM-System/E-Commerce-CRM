import { faker } from '@faker-js/faker';
import prisma from '../config/prisma.config.js';
import { DEFAULT_ROLES } from '../config/roles.config.js';
import { auth } from '../api/auth/auth.js';
import logger from '../utils/logger.util.js';

const BATCH_SIZE = 100;

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
    await safeDelete(() => prisma.user.deleteMany());
    await safeDelete(() => prisma.organization.deleteMany());

    logger.info('[SEED] Database reset complete\n');
}

async function createOrganizations() {
    logger.info('[SEED] Creating organizations via Better Auth API...');

    const existingOrgs = await prisma.organization.findMany();
    if (existingOrgs.length > 0) {
        logger.info(
            `[SEED] Found ${existingOrgs.length} existing organizations - skipping\n`
        );
        return existingOrgs;
    }

    const orgNames = ['Demo Organization', faker.company.name()];
    const organizations = [];

    for (const name of orgNames) {
        const slug =
            name
                .toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/[^a-z0-9-]/g, '') +
            '-' +
            Date.now();

        const orgResponse = await auth.api.createOrganization({
            body: {
                name,
                slug,
                logo: faker.image.url()
            }
        });

        const org = orgResponse as {
            organization?: { id: string };
            id?: string;
        };
        const orgId = org.organization?.id ?? org.id;

        if (orgId) {
            organizations.push({ id: orgId });

            for (const [roleName, permissions] of Object.entries(
                DEFAULT_ROLES
            )) {
                const flatPermissions: string[] = [];
                for (const [resource, perms] of Object.entries(permissions)) {
                    for (const perm of perms) {
                        flatPermissions.push(`${resource}:${perm}`);
                    }
                }
                await prisma.organizationRole.create({
                    data: {
                        organizationId: orgId,
                        role: roleName.toLowerCase(),
                        permission: JSON.stringify(permissions)
                    }
                });
            }
        }
    }

    logger.info(
        `[SEED] Created ${organizations.length} organizations with roles\n`
    );
    return organizations;
}

async function createUsers() {
    logger.info('[SEED] Creating users via Better Auth API...');

    const users = [];

    // Create first user as the admin (will be organization owner)
    const adminEmail = 'admin@example.com';
    const adminPassword = 'Admin123!';

    const adminUser = await auth.api.signUpEmail({
        body: {
            email: adminEmail,
            password: adminPassword,
            name: 'Admin User'
        }
    });

    if (adminUser?.user) {
        users.push({ id: adminUser.user.id, email: adminEmail });
    }

    // Create remaining users via signUpEmail
    for (let i = 0; i < 49; i++) {
        const email = faker.internet.email().toLowerCase();
        const password = 'TestPassword123!';

        const user = await auth.api.signUpEmail({
            body: {
                email,
                password,
                name: faker.person.fullName()
            }
        });

        if (user?.user) {
            users.push({ id: user.user.id, email });
        }
    }

    logger.info(`[SEED] Created ${users.length} users\n`);
    return users;
}

async function createMemberships(
    organizations: { id: string }[],
    users: { id: string; email: string }[]
) {
    logger.info('[SEED] Creating memberships...');

    let count = 0;
    for (const org of organizations) {
        const orgUsers = faker.helpers.arrayElements(
            users,
            Math.floor(users.length / organizations.length) + 1
        );

        for (const user of orgUsers) {
            const role =
                count % 10 === 0
                    ? 'admin'
                    : count % 20 === 0
                      ? 'root'
                      : 'member';

            await prisma.member.create({
                data: {
                    organizationId: org.id,
                    userId: user.id,
                    role,
                    createdAt: new Date()
                }
            });
            count++;
        }
    }

    logger.info(`[SEED] Created ${count} memberships\n`);
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

        for (let i = 0; i < 500; i++) {
            customers.push({
                name: faker.person.fullName(),
                email: faker.internet.email().toLowerCase(),
                phone: faker.phone.number(),
                city: faker.location.city(),
                address: faker.location.streetAddress(),
                source: faker.helpers.arrayElement(sources),
                lifecycleStage: faker.helpers.arrayElement(lifecycleStages),
                externalId: `shopify_${faker.string.alphanumeric(12)}`,
                totalOrders: faker.number.int({ min: 0, max: 50 }),
                totalSpent: faker.number.float({ min: 0, max: 10000 }),
                totalRefunded: faker.number.float({ min: 0, max: 500 }),
                avgOrderValue: faker.number.float({ min: 10, max: 500 }),
                firstOrderAt: faker.date.past({ years: 2 }),
                lastOrderAt: faker.date.recent({ days: 180 }),
                avgDaysBetweenOrders: faker.number.float({ min: 7, max: 90 }),
                churnRiskScore: faker.number.float({ min: 0, max: 1 }),
                rfmScore: faker.string.alphanumeric(3),
                rfmSegment: faker.helpers.arrayElement([
                    'Champions',
                    'Loyal',
                    'At_Risk',
                    'Lost'
                ]),
                cohortMonth: faker.date
                    .past({ years: 1 })
                    .toISOString()
                    .slice(0, 7),
                acceptsMarketing: faker.datatype.boolean(),
                lastSyncedAt: faker.date.recent({ days: 7 }),
                organizationId: org.id
            });
        }

        for (let i = 0; i < customers.length; i += BATCH_SIZE) {
            const batch = customers.slice(i, i + BATCH_SIZE);
            await prisma.customer.createMany({ data: batch });
            totalCreated += batch.length;
        }
    }

    logger.info(`[SEED] Created ${totalCreated} customers\n`);
}

async function createTags(organizations: { id: string }[]) {
    logger.info('[SEED] Creating tags...');

    const tagNames = [
        'VIP',
        'At Risk',
        'New Customer',
        'Returning',
        'Churned',
        'Newsletter Subscriber',
        'High Value',
        'Low Value',
        'Wholesale',
        'Retail',
        'Hot Lead',
        'Cold Lead',
        'Influencer',
        'Partner',
        'Beta Tester',
        'Early Adopter',
        'Dormant',
        'Active'
    ];

    for (const org of organizations) {
        const tags = tagNames.map((name) => ({
            name,
            color: faker.color.rgb(),
            organizationId: org.id
        }));

        await prisma.tag.createMany({ data: tags });
    }

    logger.info(`[SEED] Created ${tagNames.length} tags per organization\n`);
}

async function createProducts(organizations: { id: string }[]) {
    logger.info('[SEED] Creating products...');

    let totalCreated = 0;
    const categories = [
        'Electronics',
        'Clothing',
        'Home & Garden',
        'Sports',
        'Books',
        'Toys',
        'Beauty',
        'Food'
    ];
    const statuses = ['active', 'draft', 'archived'] as const;

    for (const org of organizations) {
        const products = [];

        for (let i = 0; i < 200; i++) {
            products.push({
                name: faker.commerce.productName(),
                price: faker.number.float({ min: 5, max: 1000 }),
                description: faker.commerce.productDescription(),
                category: faker.helpers.arrayElement(categories),
                sku: faker.string.alphanumeric(8).toUpperCase(),
                imageUrl: faker.image.url(),
                barcode: faker.string.numeric(13),
                weight: faker.number.float({ min: 0.1, max: 50 }),
                weightUnit: faker.helpers.arrayElement(['kg', 'lb', 'oz', 'g']),
                inventory: faker.number.int({ min: 0, max: 1000 }),
                status: faker.helpers.arrayElement(statuses),
                shopifyProductId: `shopify_${faker.string.alphanumeric(12)}`,
                shopifyCreatedAt: faker.date.past({ years: 1 }),
                shopifyUpdatedAt: faker.date.recent({ days: 30 }),
                organizationId: org.id
            });
        }

        for (let i = 0; i < products.length; i += BATCH_SIZE) {
            const batch = products.slice(i, i + BATCH_SIZE);
            await prisma.product.createMany({ data: batch });
            totalCreated += batch.length;
        }
    }

    logger.info(`[SEED] Created ${totalCreated} products\n`);
}

async function createOrders(organizations: { id: string }[]) {
    logger.info('[SEED] Creating orders...');

    let totalCreated = 0;
    const shippingStatuses = [
        'PENDING',
        'PROCESSING',
        'SHIPPED',
        'DELIVERED',
        'CANCELLED'
    ] as const;
    const paymentStatuses = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'] as const;

    for (const org of organizations) {
        const customers = await prisma.customer.findMany({
            where: { organizationId: org.id },
            select: { id: true }
        });

        const orders = [];

        for (let i = 0; i < 1000; i++) {
            const customer = faker.helpers.arrayElement(customers);
            const createdAt = faker.date.past({ years: 2 });

            orders.push({
                organizationId: org.id,
                customerId: customer.id,
                shippingStatus: faker.helpers.arrayElement(shippingStatuses),
                paymentStatus: faker.helpers.arrayElement(paymentStatuses),
                externalId: `order_${faker.string.alphanumeric(12)}`,
                discountAmount: faker.number.float({ min: 0, max: 50 }),
                refundAmount: faker.number.float({ min: 0, max: 100 }),
                subtotal: faker.number.float({ min: 20, max: 500 }),
                taxAmount: faker.number.float({ min: 2, max: 50 }),
                shippingAmount: faker.number.float({ min: 5, max: 30 }),
                totalAmount: faker.number.float({ min: 30, max: 600 }),
                currency: 'USD',
                fulfillmentStatus: faker.helpers.arrayElement([
                    'unfulfilled',
                    'partial',
                    'fulfilled',
                    null
                ]),
                shopifyOrderId: `shopify_${faker.string.alphanumeric(12)}`,
                shopifyCreatedAt: createdAt,
                shopifyUpdatedAt: faker.date.recent({ days: 7 }),
                tags: faker.helpers
                    .arrayElements(
                        ['web', 'pos', 'app', 'new-customer', 'repeat'],
                        { min: 0, max: 3 }
                    )
                    .join(','),
                note:
                    faker.helpers.maybe(() => faker.lorem.sentence(), {
                        probability: 0.2
                    }) ?? undefined,
                source: faker.helpers.arrayElement([
                    'web',
                    'pos',
                    'shopify_draft_order',
                    'android',
                    'ios'
                ]),
                referringSite:
                    faker.helpers.maybe(() => faker.internet.url(), {
                        probability: 0.3
                    }) ?? undefined,
                createdAt,
                updatedAt: createdAt
            });
        }

        for (let i = 0; i < orders.length; i += BATCH_SIZE) {
            const batch = orders.slice(i, i + BATCH_SIZE);
            await prisma.order.createMany({ data: batch });
            totalCreated += batch.length;
        }
    }

    logger.info(`[SEED] Created ${totalCreated} orders\n`);
}

async function createSegments(organizations: { id: string }[]) {
    logger.info('[SEED] Creating segments...');

    const segmentTemplates = [
        {
            name: 'High Value Customers',
            filter: { field: 'totalSpent', operator: 'gt', value: 1000 }
        },
        {
            name: 'At Risk Customers',
            filter: {
                field: 'lifecycleStage',
                operator: 'eq',
                value: 'AT_RISK'
            }
        },
        {
            name: 'New Customers (30 days)',
            filter: { field: 'firstOrderAt', operator: 'daysAgo', value: 30 }
        },
        {
            name: 'VIP Customers',
            filter: { field: 'lifecycleStage', operator: 'eq', value: 'VIP' }
        },
        {
            name: 'Inactive (90+ days)',
            filter: { field: 'lastOrderAt', operator: 'daysAgo', value: 90 }
        },
        {
            name: 'Newsletter Subscribers',
            filter: { field: 'acceptsMarketing', operator: 'eq', value: true }
        },
        {
            name: 'Churned Customers',
            filter: {
                field: 'lifecycleStage',
                operator: 'eq',
                value: 'CHURNED'
            }
        },
        {
            name: 'Loyal Customers',
            filter: { field: 'lifecycleStage', operator: 'eq', value: 'LOYAL' }
        }
    ];

    for (const org of organizations) {
        for (const template of segmentTemplates) {
            await prisma.segment.create({
                data: {
                    name: template.name,
                    description: `Auto-generated segment for ${template.name.toLowerCase()}`,
                    filter: template.filter,
                    organizationId: org.id
                }
            });
        }
    }

    logger.info(
        `[SEED] Created ${segmentTemplates.length} segments per organization\n`
    );
}

async function createCampaigns(organizations: { id: string }[]) {
    logger.info('[SEED] Creating campaigns...');

    const campaignNames = [
        'Welcome Series',
        'Win Back Campaign',
        'Holiday Sale',
        'New Product Launch',
        'Flash Sale',
        'VIP Exclusive',
        'Re-engagement Campaign',
        'Seasonal Promo',
        'Abandoned Cart',
        'Loyalty Rewards',
        'Referral Program',
        'Birthday Discount'
    ];

    for (const org of organizations) {
        for (let i = 0; i < 20; i++) {
            await prisma.campaign.create({
                data: {
                    name: `${faker.helpers.arrayElement(campaignNames)} ${faker.number.int({ min: 1, max: 100 })}`,
                    description: faker.lorem.sentence(),
                    organizationId: org.id
                }
            });
        }
    }

    logger.info('[SEED] Created 20 campaigns per organization\n');
}

async function createSupportTickets(organizations: { id: string }[]) {
    logger.info('[SEED] Creating support tickets...');

    let totalCreated = 0;
    const statuses = ['OPEN', 'PENDING', 'CLOSED'] as const;
    const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
    const subjects = [
        'Order not received',
        'Request for refund',
        'Product quality issue',
        'Shipping delay inquiry',
        'Account access problem',
        'Product exchange request',
        'Billing question',
        'Delivery address change',
        'Missing item from order',
        'Damaged product received'
    ];

    for (const org of organizations) {
        const customers = await prisma.customer.findMany({
            where: { organizationId: org.id },
            select: { id: true }
        });

        const tickets = [];

        for (let i = 0; i < 200; i++) {
            tickets.push({
                organizationId: org.id,
                customerId: faker.helpers.arrayElement(customers).id,
                subject: faker.helpers.arrayElement(subjects),
                description: faker.lorem.paragraph(),
                status: faker.helpers.arrayElement(statuses),
                priority: faker.helpers.arrayElement(priorities)
            });
        }

        for (let i = 0; i < tickets.length; i += BATCH_SIZE) {
            const batch = tickets.slice(i, i + BATCH_SIZE);
            await prisma.supportTicket.createMany({ data: batch });
            totalCreated += batch.length;
        }
    }

    logger.info(`[SEED] Created ${totalCreated} support tickets\n`);
}

async function createCustomerEvents(organizations: { id: string }[]) {
    logger.info('[SEED] Creating customer events...');

    let totalCreated = 0;
    const eventTypes = [
        'ORDER_PLACED',
        'ORDER_SHIPPED',
        'ORDER_DELIVERED',
        'ORDER_CANCELLED',
        'ORDER_REFUNDED',
        'ORDER_RETURNED'
    ];
    const sources = ['shopify', 'manual', 'web', 'pos', 'app'];

    for (const org of organizations) {
        const customers = await prisma.customer.findMany({
            where: { organizationId: org.id },
            select: { id: true }
        });

        const events = [];

        for (let i = 0; i < 2000; i++) {
            events.push({
                customerId: faker.helpers.arrayElement(customers).id,
                eventType: faker.helpers.arrayElement(eventTypes),
                description: faker.lorem.sentence(),
                metadata: {
                    orderId: `order_${faker.string.alphanumeric(8)}`,
                    source: faker.helpers.arrayElement(sources)
                },
                source: faker.helpers.arrayElement(sources),
                occurredAt: faker.date.recent({ days: 365 })
            });
        }

        for (let i = 0; i < events.length; i += BATCH_SIZE) {
            const batch = events.slice(i, i + BATCH_SIZE);
            await prisma.customerEvent.createMany({ data: batch });
            totalCreated += batch.length;
        }
    }

    logger.info(`[SEED] Created ${totalCreated} customer events\n`);
}

async function createIntegrations(organizations: { id: string }[]) {
    logger.info('[SEED] Creating integrations...');

    for (const org of organizations) {
        await prisma.integration.create({
            data: {
                orgId: org.id,
                provider: 'shopify',
                name: 'Shopify Store',
                shopDomain: `${faker.string.alphanumeric(8)}.myshopify.com`,
                accessToken: faker.string.alphanumeric(32),
                syncStatus: 'connected',
                syncMode: 'webhook',
                isActive: true,
                lastSyncedAt: faker.date.recent({ days: 1 })
            }
        });
    }

    logger.info(
        `[SEED] Created ${organizations.length} Shopify integrations\n`
    );
}

async function main() {
    logger.info('[SEED] ='.repeat(50));
    logger.info('[SEED] DATABASE SEED SCRIPT');
    logger.info('[SEED] ='.repeat(50) + '\n');

    const startTime = Date.now();

    await resetDatabase();
    const organizations = await createOrganizations();
    const users = await createUsers();
    await createMemberships(organizations, users);
    await createCustomers(organizations);
    await createTags(organizations);
    await createProducts(organizations);
    await createOrders(organizations);
    await createSegments(organizations);
    await createCampaigns(organizations);
    await createSupportTickets(organizations);
    await createCustomerEvents(organizations);
    await createIntegrations(organizations);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    logger.info('[SEED] ='.repeat(50));
    logger.info('[SEED] SEED COMPLETED SUCCESSFULLY');
    logger.info(`[SEED] Duration: ${duration}s`);
    logger.info('[SEED] ='.repeat(50));
}

main()
    .catch((error) => {
        logger.error('[SEED]Seed failed:', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
