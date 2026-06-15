import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import supertest from 'supertest';

let mockServer: { stop: () => void } | null = null;
let hfApiUrl = '';

function parseCsvIds(csvText: string): string[] {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return [];
    return lines
        .slice(1)
        .map((line) => {
            const raw = line.split(',')[0];
            if (!raw) return '';
            return raw.startsWith('"') && raw.endsWith('"')
                ? raw.slice(1, -1)
                : raw;
        })
        .filter(Boolean);
}

function startMockServer(
    getResponse: (customerIds: string[], productIds: string[]) => object
): string {
    const server = Bun.serve({
        port: 0,
        async fetch(req) {
            if (req.method === 'POST') {
                const formData = await req.formData();
                const customerFile = formData.get('customer_file');
                const interactionFile = formData.get('interaction_file');

                const customerCsv =
                    customerFile instanceof Blob
                        ? await customerFile.text()
                        : '';
                const interactionCsv =
                    interactionFile instanceof Blob
                        ? await interactionFile.text()
                        : '';

                const customerIds = parseCsvIds(customerCsv);
                const interactionLines = interactionCsv
                    .trim()
                    .split('\n')
                    .slice(1);
                const productIds = [
                    ...new Set(
                        interactionLines
                            .map((l) => {
                                const raw = l.split(',')[1];
                                if (!raw) return '';
                                return raw.startsWith('"') && raw.endsWith('"')
                                    ? raw.slice(1, -1)
                                    : raw;
                            })
                            .filter(Boolean)
                    )
                ];

                const response = getResponse(customerIds, productIds);
                return new Response(JSON.stringify(response), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            return new Response('Not Found', { status: 404 });
        }
    });
    mockServer = server;
    return `http://localhost:${server.port}/process`;
}

import app from '../../app.js';
import prisma from '../../config/prisma.config.js';
import { env } from '../../config/env.config.js';
import {
    createTestUser,
    cleanupTestUser,
    type TestAuth
} from '../../test/helpers/auth.js';

const api = supertest(app);

const testAuth = {
    a: null as unknown as TestAuth,
    b: null as unknown as TestAuth
};
const testEmails = { a: '', b: '' };

beforeAll(async () => {
    hfApiUrl = startMockServer((customerIds: string[]) => ({
        churn_results: customerIds.map((id) => ({
            customer_id: id,
            churn_probability: 0.15,
            risk_level: 'stable' as const
        })),
        segmentation_results: customerIds.map((id, i) => ({
            customer_id: id,
            segment: i % 3,
            segment_name: ['Browsers', 'Bargain/Casual', 'Premium Loyal'][
                i % 3
            ]!,
            distances: [1.2, 5.1, 9.8] as [number, number, number]
        })),
        ibcf_recommendations: [],
        training_threshold: 0.35
    }));
    env.hfApiUrl = hfApiUrl;

    testEmails.a = `ai-a-${Date.now()}@test.com`;
    testEmails.b = `ai-b-${Date.now()}@test.com`;
    testAuth.a = await createTestUser(
        testEmails.a,
        'AI Org A',
        `ai-org-a-${Date.now()}`
    );
    testAuth.b = await createTestUser(
        testEmails.b,
        'AI Org B',
        `ai-org-b-${Date.now()}`
    );
});

afterAll(async () => {
    const { a: authA, b: authB } = testAuth;

    if (authA?.orgId) {
        await prisma.aiRecommendation
            .deleteMany({ where: { product: { organizationId: authA.orgId } } })
            .catch(() => {});
        await prisma.customerMetric
            .deleteMany({
                where: { customer: { organizationId: authA.orgId } }
            })
            .catch(() => {});
    }

    if (authB?.orgId) {
        await prisma.aiRecommendation
            .deleteMany({ where: { product: { organizationId: authB.orgId } } })
            .catch(() => {});
        await prisma.customerMetric
            .deleteMany({
                where: { customer: { organizationId: authB.orgId } }
            })
            .catch(() => {});
    }

    if (testEmails.a && authA?.orgId)
        await cleanupTestUser(testEmails.a, authA.orgId).catch(() => {});
    if (testEmails.b && authB?.orgId)
        await cleanupTestUser(testEmails.b, authB.orgId).catch(() => {});

    mockServer?.stop();
});

describe('AI API Routes', () => {
    const getAuth = () => testAuth.a;

    beforeAll(async () => {
        const auth = getAuth();
        await prisma.customer.createMany({
            data: [
                {
                    name: 'HF Test Customer 1',
                    email: `hf-1-${Date.now()}@test.com`,
                    organizationId: auth.orgId,
                    isLoyaltyMember: true,
                    totalOrders: 50,
                    totalSpent: 10000,
                    avgOrderValue: 200,
                    engagementScore: 85,
                    satisfactionScore: 9,
                    browsingFrequency: 20,
                    lastOrderAt: new Date(Date.now() - 2 * 86400000),
                    createdAt: new Date(),
                    updatedAt: new Date()
                },
                {
                    name: 'HF Test Customer 2',
                    email: `hf-2-${Date.now()}@test.com`,
                    organizationId: auth.orgId,
                    isLoyaltyMember: false,
                    totalOrders: 1,
                    totalSpent: 25,
                    avgOrderValue: 25,
                    engagementScore: 10,
                    satisfactionScore: 2,
                    browsingFrequency: 0.5,
                    lastOrderAt: new Date(Date.now() - 180 * 86400000),
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            ]
        });
    });

    describe('GET /api/ai/health', () => {
        it('should return health status (no auth required)', async () => {
            const response = await api.get('/api/ai/health');
            expect(response.status).toBe(200);
            expect(response.body.data).toHaveProperty('churnModel');
            expect(response.body.data).toHaveProperty('segmentation');
            expect(response.body.data).toHaveProperty('recommendations');
        });

        it('should report churn model info', async () => {
            const response = await api.get('/api/ai/health');
            expect(response.body.data.churnModel).toHaveProperty('available');
            expect(response.body.data.churnModel).toHaveProperty('features');
        });
    });

    describe('POST /api/ai/churn (compute)', () => {
        it('should compute churn for authorized user', async () => {
            const auth = getAuth();
            const response = await api
                .post('/api/ai/churn')
                .set('Authorization', `Bearer ${auth.token}`);

            expect(response.status).toBe(200);
            expect(response.body.data).toHaveProperty('totalCustomers');
            expect(response.body.data.totalCustomers).toBeGreaterThanOrEqual(2);
            expect(response.body.data).toHaveProperty('results');
            expect(response.body.data.results.length).toBeGreaterThanOrEqual(2);

            const first = response.body.data.results[0]!;
            expect(first).toHaveProperty('customer_id');
            expect(first).toHaveProperty('churn_probability');
            expect(first).toHaveProperty('risk_level');
            expect(['stable', 'low', 'high']).toContain(first.risk_level);
        });

        it('should store churn results in DB', async () => {
            const auth = getAuth();
            const customers = await prisma.customer.findMany({
                where: { organizationId: auth.orgId },
                select: { id: true, churnRiskScore: true, lastScoredAt: true }
            });

            for (const c of customers) {
                expect(c.churnRiskScore).not.toBeNull();
                expect(c.lastScoredAt).not.toBeNull();
            }
        });

        it('should reject unauthenticated requests', async () => {
            const response = await api.post('/api/ai/churn');
            expect(response.status).toBe(401);
        });
    });

    describe('POST /api/ai/segment (compute)', () => {
        it('should compute segments for authorized user', async () => {
            const auth = getAuth();
            const response = await api
                .post('/api/ai/segment')
                .set('Authorization', `Bearer ${auth.token}`);

            expect(response.status).toBe(200);
            expect(response.body.data).toHaveProperty('totalCustomers');
            expect(response.body.data.totalCustomers).toBeGreaterThanOrEqual(2);
            expect(response.body.data).toHaveProperty('distribution');
            expect(response.body.data).toHaveProperty('results');
            expect(response.body.data.results.length).toBeGreaterThanOrEqual(2);
        });

        it('should return segment distribution with percentages', async () => {
            const auth = getAuth();
            const response = await api
                .post('/api/ai/segment')
                .set('Authorization', `Bearer ${auth.token}`);

            const dist = response.body.data.distribution as Array<{
                segment: number;
                name: string;
                count: number;
                percentage: number;
            }>;
            for (const d of dist) {
                expect(d.segment).toBeGreaterThanOrEqual(0);
                expect(d.name).toBeTruthy();
                expect(d.count).toBeGreaterThanOrEqual(0);
                expect(d.percentage).toBeGreaterThanOrEqual(0);
                expect(d.percentage).toBeLessThanOrEqual(100);
            }
        });

        it('should reject unauthenticated requests', async () => {
            const response = await api.post('/api/ai/segment');
            expect(response.status).toBe(401);
        });
    });

    describe('Cross-Tenant Isolation', () => {
        it('should NOT allow Org B to compute churn for Org A', async () => {
            const auth = testAuth.b;
            const response = await api
                .post('/api/ai/churn')
                .set('Authorization', `Bearer ${auth.token}`);

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('No customers found');
        });

        it('should NOT allow Org B to compute segments for Org A', async () => {
            const auth = testAuth.b;
            const response = await api
                .post('/api/ai/segment')
                .set('Authorization', `Bearer ${auth.token}`);

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('No customers found');
        });
    });

    describe('POST /api/ai/recommend (compute)', () => {
        beforeAll(async () => {
            const auth = getAuth();
            const product1 = await prisma.product.create({
                data: {
                    name: 'HF Rec Product 1',
                    price: 100,
                    organizationId: auth.orgId,
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            });

            const product2 = await prisma.product.create({
                data: {
                    name: 'HF Rec Product 2',
                    price: 50,
                    organizationId: auth.orgId,
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            });

            const customer = await prisma.customer.findFirst({
                where: { organizationId: auth.orgId }
            });

            if (customer) {
                const order = await prisma.order.create({
                    data: {
                        customerId: customer.id,
                        organizationId: auth.orgId,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    }
                });

                await prisma.orderItem.createMany({
                    data: [
                        {
                            orderId: order.id,
                            productId: product1.id,
                            quantity: 1,
                            price: 100,
                            createdAt: new Date(),
                            updatedAt: new Date()
                        },
                        {
                            orderId: order.id,
                            productId: product2.id,
                            quantity: 2,
                            price: 50,
                            createdAt: new Date(),
                            updatedAt: new Date()
                        }
                    ]
                });
            }

            // Restart mock server with recommendations using real IDs
            if (mockServer) mockServer.stop();
            hfApiUrl = startMockServer(
                (_customerIds: string[], productIds: string[]) => ({
                    churn_results: [],
                    segmentation_results: [],
                    ibcf_recommendations: productIds.map((pid) => ({
                        product_id: pid,
                        recommendations: productIds
                            .filter((id) => id !== pid)
                            .map((id) => ({
                                item_id: id,
                                similarity: 0.85
                            }))
                    })),
                    training_threshold: 0.35
                })
            );
            env.hfApiUrl = hfApiUrl;
        });

        it('should compute recommendations for authorized user', async () => {
            const auth = getAuth();
            const response = await api
                .post('/api/ai/recommend')
                .set('Authorization', `Bearer ${auth.token}`);

            expect(response.status).toBe(200);
            expect(response.body.data).toHaveProperty('totalItems');
            expect(response.body.data).toHaveProperty('totalInteractions');
            expect(response.body.data.totalItems).toBeGreaterThanOrEqual(2);
        });

        it('should reject unauthenticated requests', async () => {
            const response = await api.post('/api/ai/recommend');
            expect(response.status).toBe(401);
        });
    });

    describe('GET endpoints', () => {
        it('GET /api/ai/recommend/:productId should reject unauthenticated', async () => {
            const response = await api.get('/api/ai/recommend/some-product');
            expect(response.status).toBe(401);
        });

        it('GET /api/ai/churn should list for authorized user', async () => {
            const auth = getAuth();
            const response = await api
                .get('/api/ai/churn')
                .set('Authorization', `Bearer ${auth.token}`);
            expect(response.status).toBe(200);
            expect(response.body.data).toBeInstanceOf(Array);
        });

        it('GET /api/ai/churn should reject unauthenticated', async () => {
            const response = await api.get('/api/ai/churn');
            expect(response.status).toBe(401);
        });

        it('GET /api/ai/segment should return distribution', async () => {
            const auth = getAuth();
            const response = await api
                .get('/api/ai/segment')
                .set('Authorization', `Bearer ${auth.token}`);
            expect(response.status).toBe(200);
            expect(response.body.data).toHaveProperty('totalCustomers');
            expect(response.body.data).toHaveProperty('distribution');
        });

        it('GET /api/ai/segment should reject unauthenticated', async () => {
            const response = await api.get('/api/ai/segment');
            expect(response.status).toBe(401);
        });
    });
});
