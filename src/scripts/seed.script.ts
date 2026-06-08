import { faker } from '@faker-js/faker';
import prisma from '../config/prisma.config.js';
import { DEFAULT_ROLES } from '../config/roles.config.js';
import { auth } from '../api/auth/auth.js';
import logger from '../utils/logger.util.js';
import { Prisma } from '../generated/prisma/client.js';
import { PLANS, assignFreePlanToOrganizations } from './plans.shared.js';

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

async function createSegmentsAndCampaigns(
    organizationId: string,
    creatorId: string
) {
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
            filter: {
                field: 'lastOrderAt',
                operator: 'gte',
                value: new Date(
                    Date.now() - 30 * 24 * 60 * 60 * 1000
                ).toISOString()
            }
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
                and: [
                    { field: 'totalOrders', operator: 'gte', value: 2 },
                    { field: 'totalOrders', operator: 'lte', value: 4 }
                ]
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
                filter: config.filter,
                creatorId
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
    const statuses = ['OPEN', 'PENDING', 'CLOSED', 'ARCHIVED'] as const;

    const conversationTemplates = [
        {
            inbound: [
                'Hi there! I was wondering if you have this product in stock?',
                'Thanks! And what about the price? Is there any discount?',
                'Perfect, I will place an order now. Thank you!'
            ],
            outbound: [
                'Hello! Yes, we have it in stock and ready to ship.',
                'The current price is 450 EGP, but we have a 10% discount for first-time buyers. Use code WELCOME10!',
                'Great choice! Let me know if you need any assistance with the order.'
            ],
            hasImage: false
        },
        {
            inbound: [
                'I received my order today but the item is damaged.',
                'Yes, the box was crushed and the screen is cracked.',
                'Thank you, please send the return label when ready.'
            ],
            outbound: [
                "I'm sorry to hear that! Can you please share a photo of the damage?",
                "I apologize for the inconvenience. We'll send a replacement right away.",
                "I've initiated the return. You'll receive the label within 24 hours."
            ],
            hasImage: true
        },
        {
            inbound: [
                'Do you ship to Saudi Arabia?',
                'How long does it usually take?',
                'Great, what are the shipping costs?',
                'Perfect, I will go ahead and place the order.'
            ],
            outbound: [
                'Yes, we ship to Saudi Arabia via Aramex!',
                'Delivery typically takes 5-7 business days.',
                'Shipping to KSA costs 120 EGP for orders under 2000 EGP. Free shipping above that!',
                "Excellent! Don't forget to use code SHIPFREE for free shipping on your first order."
            ],
            hasImage: false
        },
        {
            inbound: [
                'Hi, can I change my delivery address?',
                'The new address is 15 El-Tahrir Street, Downtown Cairo.',
                'Thank you so much!'
            ],
            outbound: [
                'Of course! Could you please provide the new address?',
                "I've updated the address for order #54321. The delivery date remains the same.",
                "You're welcome! Is there anything else I can help with?"
            ],
            hasImage: false
        },
        {
            inbound: [
                'Hello! I want to return an item I bought last week.',
                'Its a pair of shoes, size 42. I ordered the wrong size.',
                'Can I exchange them for size 43 instead?',
                'Perfect, that works for me.'
            ],
            outbound: [
                'I can help with that! Could you please share your order number and the item details?',
                'No problem! We offer free exchanges within 30 days.',
                "Sure! I'll start an exchange for size 43. The new pair should arrive in 3-5 days.",
                "All set! You'll receive an email with the exchange confirmation."
            ],
            hasImage: false
        },
        {
            inbound: [
                'Is there any Black Friday sale coming up?',
                'Can I get early access?',
                'Great, please add me to the list! My email is on file.'
            ],
            outbound: [
                "Yes! We're having a 40% off sale starting next Friday. Early access for VIP customers begins Wednesday!",
                "I've added you to our early access list! You'll receive a special link on Wednesday morning.",
                'Perfect! Keep an eye on your inbox Wednesday. The sale runs for 3 days only!'
            ],
            hasImage: true
        }
    ];

    const singleMessageInbound = [
        'Hello, I need help with my account.',
        'Can you send me your product catalog?',
        'How do I track my order?',
        'What payment methods do you accept?',
        'Are there any promo codes available right now?'
    ];

    // const singleMessageOutbound = [
    //     'You can track your order here: https://example.com/track. Let me know if you need anything else!',
    //     'We accept Visa, Mastercard, Fawry, and Cash on Delivery.',
    //     "Here's our latest catalog: https://example.com/catalog. Let me know what catches your eye!",
    //     'Sure! Please verify your email so I can look up your account.',
    //     'Yes! Use code SAVE15 for 15% off your next order. Valid until end of month.'
    // ];

    for (const org of organizations) {
        const customers = await prisma.customer.findMany({
            where: { organizationId: org.id },
            take: 40
        });

        for (const customer of customers) {
            const shouldCreateConversation = faker.datatype.boolean({
                probability: 0.5
            });
            if (!shouldCreateConversation) continue;

            const provider = faker.helpers.arrayElement(providers);
            const status = faker.helpers.arrayElement(statuses);
            const template = faker.helpers.arrayElement(conversationTemplates);
            const numMessages =
                template.inbound.length + template.outbound.length;
            const baseTime = faker.date.recent({ days: 30 });

            const conversation = await prisma.conversation.create({
                data: {
                    organizationId: org.id,
                    customerId: customer.id,
                    externalId: `ext_${faker.string.alphanumeric(12)}`,
                    provider,
                    status,
                    lastMessageAt: baseTime
                }
            });

            const messages = [];

            for (let i = 0; i < numMessages; i++) {
                const isInbound = i % 2 === 0;
                const direction: 'INBOUND' | 'OUTBOUND' = isInbound
                    ? 'INBOUND'
                    : 'OUTBOUND';
                const templateIdx = Math.floor(i / 2);
                const content = isInbound
                    ? template.inbound[templateIdx]!
                    : template.outbound[templateIdx]!;

                const isLast = i === numMessages - 1;
                const msgTime = new Date(
                    baseTime.getTime() +
                        i * faker.number.int({ min: 60000, max: 300000 })
                );

                const shouldFail =
                    isLast && faker.datatype.boolean({ probability: 0.2 });
                const includeImage =
                    template.hasImage &&
                    i === numMessages - 1 &&
                    direction === 'OUTBOUND';

                messages.push({
                    conversationId: conversation.id,
                    externalId: `msg_${faker.string.alphanumeric(12)}`,
                    direction,
                    content,
                    type: includeImage ? 'image' : 'text',
                    status: (shouldFail ? 'FAILED' : 'SENT') as
                        | 'SENT'
                        | 'FAILED',
                    errorMessage: shouldFail
                        ? 'Provider API temporarily unavailable'
                        : null,
                    metadata: includeImage
                        ? {
                              imageUrl: faker.image.url(),
                              caption: 'Product image reference'
                          }
                        : undefined,
                    createdAt: msgTime
                });
            }

            await prisma.message.createMany({ data: messages });
        }

        // Create some single-message conversations (unread inquiries)
        const singleMessageCustomers = await prisma.customer.findMany({
            where: { organizationId: org.id },
            take: 8,
            skip: 40
        });

        for (const customer of singleMessageCustomers) {
            const sentTime = faker.date.recent({ days: 7 });

            const conversation = await prisma.conversation.create({
                data: {
                    organizationId: org.id,
                    customerId: customer.id,
                    externalId: `ext_${faker.string.alphanumeric(12)}`,
                    provider: faker.helpers.arrayElement(providers),
                    status: 'PENDING',
                    lastMessageAt: sentTime
                }
            });

            await prisma.message.create({
                data: {
                    conversationId: conversation.id,
                    externalId: `msg_${faker.string.alphanumeric(12)}`,
                    direction: 'INBOUND',
                    content: faker.helpers.arrayElement(singleMessageInbound),
                    type: 'text',
                    status: 'SENT',
                    createdAt: sentTime
                }
            });
        }
    }

    logger.info('[SEED] Created conversations and messages\n');
}

async function createPlans() {
    logger.info('[SEED] Creating subscription plans...');

    for (const plan of PLANS) {
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

    logger.info(`[SEED] Created ${PLANS.length} subscription plans\n`);
}

async function assignFreePlan(organizations: { id: string }[]) {
    logger.info('[SEED] Assigning Free plan to organizations...');

    const { assigned, total } = await assignFreePlanToOrganizations(
        organizations.map((o) => o.id)
    );

    logger.info(
        `[SEED] Assigned Free plan to ${assigned}/${total} organizations\n`
    );
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
    await createSegmentsAndCampaigns(mainOrgId, adminUserId);
    await createSupportTickets(organizations, adminUserId);
    await createCampaignRecipients(mainOrgId);
    await createConversations(organizations);
    await createPlans();
    await assignFreePlan(organizations);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info(`[SEED] COMPLETED in ${duration}s`);
}

main()
    .catch((error) => {
        logger.error(error);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
