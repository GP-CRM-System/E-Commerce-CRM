import { faker } from '@faker-js/faker';
import prisma from '../config/prisma.config.js';
import { DEFAULT_ROLES } from '../config/roles.config.js';
import { auth } from '../api/auth/auth.js';
import logger from '../utils/logger.util.js';
import { Prisma } from '../generated/prisma/client.js';

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
    await safeDelete(() => prisma.subscription.deleteMany());
    await safeDelete(() => prisma.plan.deleteMany());
    await safeDelete(() => prisma.ticketNote.deleteMany());
    await safeDelete(() => prisma.notification.deleteMany());
    await safeDelete(() => prisma.emailTemplate.deleteMany());
    await safeDelete(() => prisma.campaignRecipient.deleteMany());
    await safeDelete(() => prisma.importJob.deleteMany());
    await safeDelete(() => prisma.exportJob.deleteMany());
    await safeDelete(() => prisma.customerMetric.deleteMany());
    await safeDelete(() => prisma.interaction.deleteMany());
    await safeDelete(() => prisma.customer.deleteMany());
    await safeDelete(() => prisma.organization.deleteMany());
    await safeDelete(() => prisma.user.deleteMany());

    logger.info('[SEED] Database reset complete\n');
}

async function createOrganizations(adminUserId: string) {
    logger.info('[SEED] Creating organizations directly via Prisma...');

    const orgNames = ['Demo Organization'];
    const organizations = [];

    for (const name of orgNames) {
        const slug =
            name
                .toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/[^a-z0-9-]/g, '') +
            '-' +
            faker.string.alphanumeric(4);

        const org = await auth.api.createOrganization({
            body: {
                name,
                slug,
                logo: faker.image.url(),
                userId: adminUserId
            }
        });

        organizations.push({ id: org.id });

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

    const adminEmail = 'admin@example.com';
    let adminUserId: string;

    try {
        const adminUser = await auth.api.signUpEmail({
            body: {
                email: adminEmail,
                password: 'Admin123!',
                name: 'Admin User'
            }
        });
        if (!adminUser?.user) throw new Error('Failed to create admin user');
        adminUserId = adminUser.user.id;
    } catch (error) {
        if (
            error instanceof Error &&
            error.message?.includes('already exists')
        ) {
            const existingUser = await prisma.user.findUnique({
                where: { email: adminEmail }
            });
            if (!existingUser)
                throw new Error('User supposedly exists but not found in DB', {
                    cause: error
                });
            adminUserId = existingUser.id;
        } else {
            throw error;
        }
    }

    logger.info(`[SEED] Created/Found admin user\n`);
    return adminUserId;
}

async function createSegmentsAndCampaigns(organizationId: string) {
    logger.info('[SEED] Creating segments with viable filters...');

    const segmentConfigs = [
        {
            name: 'High Value Customers',
            description: 'Customers with total spent over 5000 EGP',
            filter: { field: 'totalSpent', operator: 'gte', value: 5000 }
        },
        {
            name: 'At Risk Customers',
            description: 'Customers with churn risk score > 0.7',
            filter: { field: 'churnRiskScore', operator: 'gt', value: 0.7 }
        },
        {
            name: 'New Prospects',
            description: 'Customers in PROSPECT lifecycle stage',
            filter: {
                field: 'lifecycleStage',
                operator: 'eq',
                value: 'PROSPECT'
            }
        },
        {
            name: 'VIP Customers',
            description: 'Customers with VIP lifecycle stage',
            filter: { field: 'lifecycleStage', operator: 'eq', value: 'VIP' }
        },
        {
            name: 'Recent Purchasers',
            description: 'Customers who ordered in the last 30 days',
            filter: { field: 'lastOrderAt', operator: 'daysAgo', value: 30 }
        },
        {
            name: 'Loyal Customers',
            description: 'Customers with 5+ orders',
            filter: { field: 'totalOrders', operator: 'gte', value: 5 }
        },
        {
            name: 'Email Subscribers',
            description: 'Customers who accept marketing',
            filter: { field: 'acceptsMarketing', operator: 'eq', value: true }
        },
        {
            name: 'Repeat Buyers',
            description: 'Customers with 2-4 orders',
            filter: {
                field: 'totalOrders',
                operator: 'between',
                min: 2,
                max: 4
            }
        }
    ];

    const segments = [];
    for (const config of segmentConfigs) {
        const segment = await prisma.segment.create({
            data: {
                name: config.name,
                description: config.description,
                organizationId,
                filter: config.filter
            }
        });
        segments.push(segment);
    }

    logger.info(
        `[SEED] Created ${segments.length} segments with viable filters`
    );

    const emailTemplates = [
        {
            name: 'Summer Sale',
            subject: '🔥 Hot Summer Deals - Up to 50% Off!'
        },
        { name: 'Welcome', subject: 'Welcome to our family!' },
        { name: 'Winback', subject: "We miss you! Here's a special offer" }
    ];

    for (const tpl of emailTemplates) {
        await prisma.emailTemplate.create({
            data: {
                name: tpl.name,
                subject: tpl.subject,
                htmlBody: `<html><body><h1>${tpl.name}</h1><p>Hello {{customer.name}},</p></body></html>`,
                variables: ['customer.name', 'customer.email'],
                organizationId
            }
        });
    }

    const campaignNames = [
        'Summer Sale 2026',
        'Customer Appreciation',
        'Win-back Promo'
    ];
    for (const name of campaignNames) {
        await prisma.campaign.create({
            data: {
                name,
                organizationId,
                segmentId: faker.helpers.arrayElement(segments).id,
                type: 'EMAIL',
                status: 'SENT',
                subject: `Special offer: ${name}`,
                content: { body: `Check out our special ${name}!` },
                sentAt: new Date(),
                recipientCount: faker.number.int({ min: 50, max: 100 }),
                metrics: {
                    sent: 80,
                    delivered: 75,
                    opened: 45,
                    clicked: 20,
                    converted: 5
                }
            }
        });
    }

    logger.info('[SEED] Created 5 segments, 3 campaigns, 3 email templates\n');
}

async function createCustomers(
    organizations: { id: string }[],
    adminUserId: string
) {
    logger.info('[SEED] Creating 100 customers with accurate RFM data...');

    let totalCreated = 0;
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
        for (let i = 0; i < 100; i++) {
            const r = faker.number.int({ min: 1, max: 5 });
            const f = faker.number.int({ min: 1, max: 5 });
            const m = faker.number.int({ min: 1, max: 5 });

            const daysAgo = Math.max(
                1,
                (5 - r) * 60 + faker.number.int({ min: 1, max: 30 })
            );
            const lastOrderAt = faker.date.recent({ days: daysAgo });

            const totalSpent =
                Math.round(
                    m * faker.number.float({ min: 100, max: 1000 }) * 100
                ) / 100;
            const totalOrders = f * faker.number.int({ min: 1, max: 10 });

            customers.push({
                name: faker.person.fullName(),
                email: faker.internet.email().toLowerCase(),
                phone: faker.phone.number(),
                city: faker.location.city(),
                source: faker.helpers.arrayElement(sources),
                totalSpent: new Prisma.Decimal(totalSpent),
                totalOrders,
                lastOrderAt,
                rfmRecency: r,
                rfmFrequency: f,
                rfmMonetary: m,
                rfmScore: `${r}${f}${m}`,
                churnRiskScore: faker.number.float({ min: 0, max: 1 }),
                organizationId: org.id,
                acceptsMarketing: faker.datatype.boolean(),
                createdAt: faker.date.past({ years: 2 })
            });
        }
        await prisma.customer.createMany({
            data: customers
        });
        totalCreated += customers.length;
    }

    for (const org of organizations) {
        const customers = await prisma.customer.findMany({
            where: { organizationId: org.id },
            take: 30
        });

        for (const customer of customers) {
            await prisma.customerMetric.create({
                data: {
                    customerId: customer.id,
                    churnProbability: faker.number.float({ min: 0, max: 1 }),
                    avgOrderValue: new Prisma.Decimal(
                        faker.number.float({ min: 50, max: 500 })
                    ),
                    daysSinceLastPurchase: faker.number.int({
                        min: 0,
                        max: 90
                    }),
                    totalOrders: faker.number.int({ min: 1, max: 50 }),
                    returnRate: faker.number.float({ min: 0, max: 0.3 })
                }
            });

            const eventTypes = [
                {
                    type: 'order_placed',
                    desc: 'Placed an order',
                    source: 'shopify'
                },
                {
                    type: 'order_completed',
                    desc: 'Order was completed',
                    source: 'shopify'
                },
                {
                    type: 'email_opened',
                    desc: 'Opened marketing email',
                    source: 'campaign'
                },
                {
                    type: 'email_clicked',
                    desc: 'Clicked on email link',
                    source: 'campaign'
                },
                {
                    type: 'tag_added',
                    desc: 'Added to segment',
                    source: 'system'
                },
                {
                    type: 'tag_removed',
                    desc: 'Removed from segment',
                    source: 'system'
                },
                {
                    type: 'note_added',
                    desc: 'Note added to customer',
                    source: 'manual'
                },
                {
                    type: 'support_ticket_created',
                    desc: 'Created support ticket',
                    source: 'support'
                },
                {
                    type: 'support_ticket_resolved',
                    desc: 'Support ticket resolved',
                    source: 'support'
                },
                {
                    type: 'cart_abandoned',
                    desc: 'Abandoned cart',
                    source: 'shopify'
                },
                {
                    type: 'wishlist_added',
                    desc: 'Added item to wishlist',
                    source: 'shopify'
                },
                {
                    type: 'review_submitted',
                    desc: 'Submitted product review',
                    source: 'shopify'
                }
            ];
            const numEvents = faker.number.int({ min: 1, max: 5 });
            const selectedEvents = faker.helpers.arrayElements(
                eventTypes,
                numEvents
            );
            const eventData = selectedEvents.map((e) => ({
                customerId: customer.id,
                eventType: e.type,
                description: e.desc,
                source: e.source,
                metadata:
                    e.type === 'order_placed'
                        ? { orderId: `order_${faker.string.alphanumeric(8)}` }
                        : undefined,
                occurredAt: faker.date.recent({ days: 60 })
            }));
            if (eventData.length > 0) {
                await prisma.customerEvent.createMany({ data: eventData });
            }

            if (faker.datatype.boolean({ probability: 0.4 })) {
                await prisma.interaction.create({
                    data: {
                        customerId: customer.id,
                        type: faker.helpers.arrayElement([
                            'complaint',
                            'inquiry',
                            'feedback'
                        ]),
                        content: faker.lorem.sentence(),
                        sentiment: faker.number.float({ min: -1, max: 1 })
                    }
                });
            }

            const noteBodies = [
                'Customer requested gift wrapping for all orders.',
                'Prefers delivery in the morning hours.',
                'Very satisfied with recent purchase - would recommend to friends.',
                'Inquired about bulk pricing for corporate orders.',
                'Requested to be added to VIP mailing list.',
                'Had issues with previous delivery - resolved.',
                'Prefers contact via WhatsApp over email.',
                'Interested in upcoming summer collection.',
                'Requested personalized discount code.',
                'Follow up needed on recent support ticket.',
                'Customer provided positive feedback on new product line.',
                'Not interested in SMS marketing - prefers email only.',
                'Annual customer - very loyal and reliable.',
                'Recently moved to new address - update needed.',
                'Requested product recommendation based on past purchases.'
            ];
            const numNotes = faker.number.int({ min: 1, max: 3 });
            const noteData = [];
            for (let n = 0; n < numNotes; n++) {
                noteData.push({
                    customerId: customer.id,
                    authorId: adminUserId,
                    body: faker.helpers.arrayElement(noteBodies),
                    createdAt: faker.date.recent({ days: 60 })
                });
            }
            if (noteData.length > 0) {
                await prisma.note.createMany({ data: noteData });
            }

            const tagConfigs = [
                { name: 'VIP', color: 'FFD700' },
                { name: 'Premium', color: '8B5CF6' },
                { name: 'Newsletter', color: '3B82F6' },
                { name: 'Bulk Buyer', color: '10B981' },
                { name: 'Wholesale', color: 'F59E0B' },
                { name: 'New Customer', color: '22C55E' },
                { name: 'Loyal', color: '14B8A6' },
                { name: 'At Risk', color: 'EF4444' },
                { name: 'Inactive', color: '6B7280' },
                { name: 'First Time Buyer', color: 'EC4899' },
                { name: 'Repeat Customer', color: '6366F1' },
                { name: 'High Spender', color: 'F97316' }
            ];
            const existingTags = await prisma.tag.findMany({
                where: { organizationId: org.id }
            });
            let tags = existingTags;
            if (existingTags.length < tagConfigs.length) {
                const newTags = [];
                for (const tc of tagConfigs) {
                    const existing = existingTags.find(
                        (t) => t.name === tc.name
                    );
                    if (!existing) {
                        const tag = await prisma.tag.create({
                            data: {
                                name: tc.name,
                                color: tc.color,
                                organizationId: org.id
                            }
                        });
                        newTags.push(tag);
                    }
                }
                tags = [...existingTags, ...newTags];
            }
            const numTags = faker.number.int({ min: 1, max: 3 });
            const selectedTags = faker.helpers.arrayElements(tags, numTags);
            if (selectedTags.length > 0) {
                const currentTags = await prisma.customer.findUnique({
                    where: { id: customer.id },
                    select: { tags: { select: { id: true } } }
                });
                if (currentTags && currentTags.tags.length === 0) {
                    await prisma.customer.update({
                        where: { id: customer.id },
                        data: {
                            tags: {
                                connect: selectedTags.map((t) => ({ id: t.id }))
                            }
                        }
                    });
                }
            }
        }
    }

    logger.info(
        `[SEED] Created ${totalCreated} customers with metrics, events, interactions, notes\n`
    );
}

async function createProducts(organizations: { id: string }[]) {
    logger.info('[SEED] Creating 50 products and 10 categories...');
    let totalCreated = 0;
    const categories = [
        'Electronics',
        'Clothing',
        'Home',
        'Garden',
        'Beauty',
        'Toys',
        'Sports',
        'Books',
        'Automotive',
        'Health'
    ];

    for (const org of organizations) {
        const products = [];
        for (let i = 0; i < 50; i++) {
            const price =
                Math.round(faker.number.float({ min: 10, max: 1000 }) * 100) /
                100;
            products.push({
                name: faker.commerce.productName(),
                price: new Prisma.Decimal(price),
                sku: faker.string.alphanumeric(8).toUpperCase(),
                inventory: faker.number.int({ min: 0, max: 500 }),
                category: faker.helpers.arrayElement(categories),
                organizationId: org.id,
                status: 'active'
            });
        }
        await prisma.product.createMany({
            data: products
        });
        totalCreated += products.length;
    }

    for (const org of organizations) {
        const products = await prisma.product.findMany({
            where: { organizationId: org.id },
            take: 20
        });

        for (const product of products) {
            if (faker.datatype.boolean()) {
                await prisma.productVariant.create({
                    data: {
                        productId: product.id,
                        name: faker.helpers.arrayElement([
                            'Small',
                            'Medium',
                            'Large'
                        ]),
                        sku: faker.string.alphanumeric(6).toUpperCase(),
                        price: product.price,
                        inventory: faker.number.int({ min: 0, max: 200 }),
                        options: {
                            size: faker.helpers.arrayElement([
                                'S',
                                'M',
                                'L',
                                'XL'
                            ])
                        }
                    }
                });
            }
        }
    }

    logger.info(`[SEED] Created ${totalCreated} products with variants\n`);
}

async function createOrders(organizations: { id: string }[]) {
    logger.info('[SEED] Creating 500 orders...');
    let totalCreated = 0;
    for (const org of organizations) {
        const customers = await prisma.customer.findMany({
            where: { organizationId: org.id },
            select: { id: true }
        });
        const products = await prisma.product.findMany({
            where: { organizationId: org.id },
            select: { id: true, price: true }
        });

        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        for (let i = 0; i < 500; i++) {
            const customer = faker.helpers.arrayElement(customers);
            const orderProducts = faker.helpers.arrayElements(
                products,
                faker.number.int({ min: 1, max: 3 })
            );
            const subtotal =
                Math.round(
                    orderProducts.reduce((sum, p) => sum + Number(p.price), 0) *
                        100
                ) / 100;
            const orderDate = faker.date.between({
                from: oneYearAgo,
                to: new Date()
            });

            const order = await prisma.order.create({
                data: {
                    organizationId: org.id,
                    customerId: customer.id,
                    totalAmount: new Prisma.Decimal(subtotal),
                    subtotal: new Prisma.Decimal(subtotal),
                    currency: 'EGP',
                    paymentStatus: 'PAID',
                    shippingStatus: 'DELIVERED',
                    createdAt: orderDate,
                    orderItems: {
                        create: orderProducts.map((p) => ({
                            productId: p.id,
                            quantity: 1,
                            price: new Prisma.Decimal(
                                Math.round(Number(p.price) * 100) / 100
                            )
                        }))
                    }
                }
            });

            await prisma.transaction.create({
                data: {
                    organizationId: org.id,
                    orderId: order.id,
                    amount: new Prisma.Decimal(subtotal),
                    provider: 'FAWRY',
                    status: 'SUCCESS',
                    type: 'PAYMENT',
                    externalId: `fawry_${faker.string.alphanumeric(8)}`
                }
            });
            totalCreated++;
        }
    }
    logger.info(
        `[SEED] Created ${totalCreated} orders with items and transactions\n`
    );
}

async function createSupportTickets(
    organizations: { id: string }[],
    adminUserId: string
) {
    logger.info('[SEED] Creating 35 support tickets...');
    for (const org of organizations) {
        const customers = await prisma.customer.findMany({
            where: { organizationId: org.id },
            take: 35
        });

        for (const customer of customers) {
            const ticket = await prisma.supportTicket.create({
                data: {
                    organizationId: org.id,
                    customerId: customer.id,
                    subject: faker.hacker.phrase(),
                    description: faker.lorem.paragraph(),
                    status: faker.helpers.arrayElement([
                        'OPEN',
                        'PENDING',
                        'CLOSED'
                    ]),
                    priority: faker.helpers.arrayElement([
                        'LOW',
                        'MEDIUM',
                        'HIGH',
                        'URGENT'
                    ]),
                    assignedToId: adminUserId,
                    createdAt: faker.date.recent({ days: 30 })
                }
            });

            if (ticket.status !== 'OPEN') {
                await prisma.ticketNote.create({
                    data: {
                        ticketId: ticket.id,
                        authorId: adminUserId,
                        body: faker.lorem.sentence(),
                        isInternal: faker.datatype.boolean()
                    }
                });
            }
        }
    }

    for (const org of organizations) {
        await prisma.notification.createMany({
            data: [
                {
                    type: 'ticket_created',
                    title: 'New Support Ticket',
                    message: 'A new support ticket has been created',
                    organizationId: org.id,
                    userId: adminUserId,
                    read: faker.datatype.boolean(),
                    createdAt: faker.date.recent({ days: 3 })
                },
                {
                    type: 'campaign_sent',
                    title: 'Campaign Sent',
                    message: 'Your campaign has been sent successfully',
                    organizationId: org.id,
                    userId: adminUserId,
                    read: false,
                    createdAt: faker.date.recent({ days: 1 })
                }
            ]
        });
    }

    logger.info(
        '[SEED] Created 35 support tickets with notes and notifications\n'
    );
}

async function createCampaignRecipients(organizationId: string) {
    logger.info('[SEED] Creating campaign recipients...');

    const campaigns = await prisma.campaign.findMany({
        where: { organizationId }
    });

    const customers = await prisma.customer.findMany({
        where: { organizationId },
        take: 50
    });

    for (const campaign of campaigns) {
        const recipients = faker.helpers.arrayElements(customers, 30);
        for (const customer of recipients) {
            const status = faker.helpers.arrayElement([
                'PENDING',
                'SENT',
                'DELIVERED',
                'OPENED',
                'CLICKED',
                'FAILED'
            ]);
            const sentAt = faker.date.recent({ days: 7 });
            const openedAt = faker.datatype.boolean({ probability: 0.5 })
                ? faker.date.recent({ days: 3 })
                : null;
            const clickedAt = faker.datatype.boolean({ probability: 0.3 })
                ? faker.date.recent({ days: 1 })
                : null;

            await prisma.campaignRecipient.create({
                data: {
                    campaignId: campaign.id,
                    customerId: customer.id,
                    status,
                    sentAt: status !== 'PENDING' ? sentAt : null,
                    openedAt,
                    clickedAt
                }
            });
        }
    }

    logger.info('[SEED] Created campaign recipients\n');
}

async function createConversations(organizations: { id: string }[]) {
    logger.info('[SEED] Creating conversations and messages...');

    const providers = ['whatsapp', 'facebook', 'instagram'] as const;
    const messageTypes = ['text', 'image', 'video'] as const;
    const statuses = ['SENT', 'DELIVERED', 'READ'] as const;

    const inboundMessages = [
        'Hi, I want to know more about your products.',
        'Is this item available in blue?',
        'How much for bulk order of 50 units?',
        'Can I get a discount?',
        'Where can I find your physical store?',
        'When will this be back in stock?',
        'I need help with my order #12345',
        'Can I change my delivery address?',
        'Do you ship internationally?',
        'What are your return policy?'
    ];

    const outboundMessages = [
        'Thank you for reaching out! How can I help you today?',
        'Yes, we have that in blue. Would you like to order?',
        'For bulk orders of 50+, we offer 15% off.',
        'Our best price for this item is 450 EGP.',
        'Our store is in Cairo, Maadi district.',
        'This item will be back in stock next week.',
        'I can help you with that order. Please provide your order number.',
        'Let me check available delivery options for you.',
        'Yes, we ship to most countries. Shipping costs apply.',
        'You can return within 30 days for full refund.'
    ];

    for (const org of organizations) {
        const customers = await prisma.customer.findMany({
            where: { organizationId: org.id },
            take: 40
        });

        for (const customer of customers) {
            const shouldCreateConversation = faker.datatype.boolean({
                probability: 0.4
            });
            if (!shouldCreateConversation) continue;

            const provider = faker.helpers.arrayElement(providers);
            const status = faker.helpers.arrayElement([
                'OPEN',
                'PENDING',
                'CLOSED'
            ] as const);

            const conversation = await prisma.conversation.create({
                data: {
                    organizationId: org.id,
                    customerId: customer.id,
                    externalId: `ext_${faker.string.alphanumeric(12)}`,
                    provider,
                    status,
                    lastMessageAt: faker.date.recent({ days: 30 })
                }
            });

            const numMessages = faker.number.int({ min: 2, max: 8 });
            const messages = [];

            for (let i = 0; i < numMessages; i++) {
                const isInbound = i % 2 === 0;
                const direction: 'INBOUND' | 'OUTBOUND' = isInbound
                    ? 'INBOUND'
                    : 'OUTBOUND';
                const content = isInbound
                    ? faker.helpers.arrayElement(inboundMessages)
                    : faker.helpers.arrayElement(outboundMessages);

                messages.push({
                    conversationId: conversation.id,
                    externalId: `msg_${faker.string.alphanumeric(12)}`,
                    direction,
                    content,
                    type: faker.helpers.arrayElement(messageTypes),
                    status: faker.helpers.arrayElement(statuses),
                    createdAt: faker.date.recent({ days: 30 })
                });
            }

            await prisma.message.createMany({ data: messages });
        }
    }

    logger.info('[SEED] Created conversations and messages\n');
}

async function createPlans() {
    logger.info('[SEED] Creating subscription plans...');

    const plans = [
        {
            name: 'free',
            displayName: 'Free',
            price: new Prisma.Decimal(0),
            billingCycle: 'monthly',
            features: {
                customers: 100,
                products: 50,
                orders: 100,
                apiCalls: 1000,
                exports: false,
                imports: false
            },
            isActive: true,
            sortOrder: 1
        },
        {
            name: 'basic',
            displayName: 'Basic',
            price: new Prisma.Decimal(29.99),
            billingCycle: 'monthly',
            features: {
                customers: 1000,
                products: 500,
                orders: 5000,
                apiCalls: 10000,
                exports: true,
                imports: true
            },
            isActive: true,
            sortOrder: 2
        },
        {
            name: 'professional',
            displayName: 'Professional',
            price: new Prisma.Decimal(79.99),
            billingCycle: 'monthly',
            features: {
                customers: 10000,
                products: 5000,
                orders: 50000,
                apiCalls: 100000,
                exports: true,
                imports: true,
                support: true
            },
            isActive: true,
            sortOrder: 3
        }
    ];

    for (const plan of plans) {
        const existing = await prisma.plan.findFirst({
            where: { name: plan.name }
        });
        if (existing) {
            await prisma.plan.update({
                where: { id: existing.id },
                data: plan
            });
        } else {
            await prisma.plan.create({ data: plan });
        }
    }

    logger.info(`[SEED] Created ${plans.length} subscription plans\n`);
}

async function main() {
    logger.info('[SEED] DATABASE SEED SCRIPT');
    const startTime = Date.now();

    await resetDatabase();
    const adminUserId = await createUsers();
    const organizations = await createOrganizations(adminUserId);
    if (organizations.length === 0) throw new Error('No organizations created');
    const mainOrg = organizations[0];
    if (!mainOrg) throw new Error('Main organization not found');
    const mainOrgId = mainOrg.id;

    await createCustomers(organizations, adminUserId);
    await createProducts(organizations);
    await createOrders(organizations);
    await createSegmentsAndCampaigns(mainOrgId);
    await createSupportTickets(organizations, adminUserId);
    await createCampaignRecipients(mainOrgId);
    await createConversations(organizations);
    await createPlans();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info(`[SEED] COMPLETED in ${duration}s`);
}

main()
    .catch((error) => {
        logger.error(error);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
