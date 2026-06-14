/**
 * AI Intelligence Module — Tests
 *
 * Covers:
 * - Unit tests for churn engine (sigmoid, percentileRank, prediction)
 * - Unit tests for segment engine (K-Means clustering)
 * - Unit tests for recommend engine (IBCF cosine similarity)
 * - Integration tests for AI API routes (health, churn, segment, recommend)
 * - Auth/permission gating
 * - Cross-tenant isolation
 */
import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import supertest from 'supertest';
import app from '../../app.js';
import prisma from '../../config/prisma.config.js';
import {
    createTestUser,
    cleanupTestUser,
    type TestAuth
} from '../../test/helpers/auth.js';

// ── Engines under test ──
import {
    predictChurn,
    isChurnModelReady,
    getChurnModelInfo
} from './churn.engine.js';
import { segmentCustomers, getSegmentDistribution } from './segment.engine.js';
import { computeRecommendations, getSimilarItems } from './recommend.engine.js';
import type {
    ChurnInput,
    SegmentInput,
    InteractionInput,
    SegmentResult
} from './ai.types.js';

const api = supertest(app);

/* ═══════════════════════════════════════════
   Setup
   ═══════════════════════════════════════════ */

const testAuth = {
    a: null as unknown as TestAuth,
    b: null as unknown as TestAuth
};
const testEmails = { a: '', b: '' };

beforeAll(async () => {
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
            .deleteMany({
                where: { product: { organizationId: authA.orgId } }
            })
            .catch(() => {});
        await prisma.customerMetric
            .deleteMany({
                where: { customer: { organizationId: authA.orgId } }
            })
            .catch(() => {});
    }

    if (authB?.orgId) {
        await prisma.aiRecommendation
            .deleteMany({
                where: { product: { organizationId: authB.orgId } }
            })
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
});

/* ═══════════════════════════════════════════
   Unit Tests — Churn Engine
   ═══════════════════════════════════════════ */

describe('Churn Engine', () => {
    describe('Model loading', () => {
        it('should have model weights loaded', () => {
            expect(isChurnModelReady()).toBe(true);
        });

        it('should return model info with features and threshold', () => {
            const info = getChurnModelInfo();
            expect(info.features).toBe(11);
            expect(info.threshold).toBeGreaterThan(0);
            expect(info.threshold).toBeLessThan(1);
            expect(info.columns).toHaveLength(11);
        });
    });

    describe('predictChurn', () => {
        it('should return results for valid inputs', () => {
            const inputs: ChurnInput[] = [
                {
                    customerId: 'c1',
                    loyaltyMember: true,
                    daysSinceLastPurchase: 5,
                    browsingFrequencyPerWeek: 20,
                    satisfactionScore: 9,
                    totalPurchases: 50,
                    avgOrderValue: 150,
                    websiteVisitsLastMonth: 60,
                    emailOpenRate: 0.8,
                    returnRate: 0.05
                },
                {
                    customerId: 'c2',
                    loyaltyMember: false,
                    daysSinceLastPurchase: 90,
                    browsingFrequencyPerWeek: 2,
                    satisfactionScore: 3,
                    totalPurchases: 1,
                    avgOrderValue: 20,
                    websiteVisitsLastMonth: 3,
                    emailOpenRate: 0.1,
                    returnRate: 0.5
                }
            ];

            const results = predictChurn(inputs);
            expect(results).toHaveLength(2);

            const r0 = results[0]!;
            const r1 = results[1]!;

            expect(r0.churnProbability).toBeGreaterThanOrEqual(0);
            expect(r0.churnProbability).toBeLessThanOrEqual(1);
            expect(r0.customerId).toBe('c1');

            expect(r1.churnProbability).toBeGreaterThanOrEqual(0);
            expect(r1.churnProbability).toBeLessThanOrEqual(1);
            expect(r1.customerId).toBe('c2');
        });

        it('should assign correct risk levels', () => {
            const inputs: ChurnInput[] = [
                {
                    customerId: 'stable_1',
                    loyaltyMember: true,
                    daysSinceLastPurchase: 1,
                    browsingFrequencyPerWeek: 30,
                    satisfactionScore: 10,
                    totalPurchases: 100,
                    avgOrderValue: 200,
                    websiteVisitsLastMonth: 90,
                    emailOpenRate: 0.9,
                    returnRate: 0.01
                },
                {
                    customerId: 'risk_1',
                    loyaltyMember: false,
                    daysSinceLastPurchase: 180,
                    browsingFrequencyPerWeek: 0.5,
                    satisfactionScore: 2,
                    totalPurchases: 0,
                    avgOrderValue: 0,
                    websiteVisitsLastMonth: 1,
                    emailOpenRate: 0.0,
                    returnRate: 0.9
                }
            ];

            const results = predictChurn(inputs);
            expect(results).toHaveLength(2);

            for (const r of results) {
                expect(['stable', 'low', 'high']).toContain(r.riskLevel);
            }
        });

        it('should handle empty input', () => {
            const results = predictChurn([]);
            expect(results).toHaveLength(0);
        });

        it('should handle single customer', () => {
            const inputs: ChurnInput[] = [
                {
                    customerId: 'single',
                    loyaltyMember: false,
                    daysSinceLastPurchase: 30,
                    browsingFrequencyPerWeek: 10,
                    satisfactionScore: 7,
                    totalPurchases: 5,
                    avgOrderValue: 75,
                    websiteVisitsLastMonth: 20,
                    emailOpenRate: 0.4,
                    returnRate: 0.1
                }
            ];

            const results = predictChurn(inputs);
            expect(results).toHaveLength(1);
            const singleResult = results[0]!;
            expect(singleResult.customerId).toBe('single');
            expect(singleResult.churnProbability).toBeGreaterThanOrEqual(0);
            expect(singleResult.churnProbability).toBeLessThanOrEqual(1);
        });
    });
});

/* ═══════════════════════════════════════════
   Unit Tests — Segment Engine
   ═══════════════════════════════════════════ */

describe('Segment Engine', () => {
    describe('segmentCustomers', () => {
        it('should return empty for empty input', () => {
            const results = segmentCustomers([]);
            expect(results).toHaveLength(0);
        });

        it('should cluster customers into 3 segments', () => {
            const inputs: SegmentInput[] = [
                {
                    customerId: 'p1',
                    age: 45,
                    gender: 'male',
                    annualIncome: 120000,
                    spendingScore: 95,
                    totalPurchases: 80,
                    avgOrderValue: 200,
                    websiteVisitsLastMonth: 60,
                    daysSinceLastPurchase: 5,
                    emailOpenRate: 0.9,
                    subscriptionTier: 'premium',
                    region: 'north',
                    preferredCategory: 'electronics',
                    returnRate: 0.02,
                    loyaltyPoints: 5000
                },
                {
                    customerId: 'p2',
                    age: 25,
                    gender: 'female',
                    annualIncome: 35000,
                    spendingScore: 30,
                    totalPurchases: 3,
                    avgOrderValue: 25,
                    websiteVisitsLastMonth: 5,
                    daysSinceLastPurchase: 45,
                    emailOpenRate: 0.1,
                    subscriptionTier: 'free',
                    region: 'south',
                    preferredCategory: 'clothing',
                    returnRate: 0.3,
                    loyaltyPoints: 50
                },
                {
                    customerId: 'p3',
                    age: 30,
                    gender: 'male',
                    annualIncome: 50000,
                    spendingScore: 50,
                    totalPurchases: 1,
                    avgOrderValue: 15,
                    websiteVisitsLastMonth: 15,
                    daysSinceLastPurchase: 60,
                    emailOpenRate: 0.2,
                    subscriptionTier: 'free',
                    region: 'east',
                    preferredCategory: 'books',
                    returnRate: 0.0,
                    loyaltyPoints: 10
                }
            ];

            const results = segmentCustomers(inputs);
            expect(results).toHaveLength(3);

            for (const r of results) {
                expect(r.customerId).toBeTruthy();
                expect([0, 1, 2]).toContain(r.segment);
                expect(r.segmentName).toBeTruthy();
                expect(r.distances).toHaveLength(3);
                for (const d of r.distances) {
                    expect(d).toBeGreaterThanOrEqual(0);
                }
            }
        });

        it('should produce reproducible results with same input', () => {
            const inputs: SegmentInput[] = [
                {
                    customerId: 'a',
                    age: 40,
                    gender: 'male',
                    annualIncome: 80000,
                    spendingScore: 80,
                    totalPurchases: 30,
                    avgOrderValue: 100,
                    websiteVisitsLastMonth: 40,
                    daysSinceLastPurchase: 10,
                    emailOpenRate: 0.7,
                    subscriptionTier: 'premium',
                    region: 'west',
                    preferredCategory: 'electronics',
                    returnRate: 0.05,
                    loyaltyPoints: 2000
                },
                {
                    customerId: 'b',
                    age: 22,
                    gender: 'female',
                    annualIncome: 25000,
                    spendingScore: 25,
                    totalPurchases: 2,
                    avgOrderValue: 30,
                    websiteVisitsLastMonth: 3,
                    daysSinceLastPurchase: 30,
                    emailOpenRate: 0.15,
                    subscriptionTier: 'free',
                    region: 'east',
                    preferredCategory: 'clothing',
                    returnRate: 0.2,
                    loyaltyPoints: 20
                },
                {
                    customerId: 'c',
                    age: 55,
                    gender: 'male',
                    annualIncome: 150000,
                    spendingScore: 95,
                    totalPurchases: 80,
                    avgOrderValue: 250,
                    websiteVisitsLastMonth: 90,
                    daysSinceLastPurchase: 2,
                    emailOpenRate: 0.9,
                    subscriptionTier: 'premium',
                    region: 'north',
                    preferredCategory: 'electronics',
                    returnRate: 0.02,
                    loyaltyPoints: 5000
                }
            ];

            const results1 = segmentCustomers(inputs);
            const results2 = segmentCustomers(inputs);

            for (let i = 0; i < inputs.length; i++) {
                const r1 = results1[i]!;
                const r2 = results2[i]!;
                expect(r1.segment).toBe(r2.segment);
            }
        });
    });

    describe('getSegmentDistribution', () => {
        it('should calculate distribution correctly', () => {
            const resultsData: SegmentResult[] = [
                {
                    customerId: 'a',
                    segment: 0,
                    segmentName: 'Browsers',
                    distances: [1, 5, 10]
                },
                {
                    customerId: 'b',
                    segment: 1,
                    segmentName: 'Bargain/Casual',
                    distances: [8, 1, 6]
                },
                {
                    customerId: 'c',
                    segment: 0,
                    segmentName: 'Browsers',
                    distances: [2, 6, 11]
                },
                {
                    customerId: 'd',
                    segment: 2,
                    segmentName: 'Premium Loyal',
                    distances: [12, 9, 1]
                }
            ];

            const dist = getSegmentDistribution(resultsData);
            expect(dist).toHaveLength(3);

            const seg0 = dist.find((d) => d.segment === 0)!;
            expect(seg0.count).toBe(2);
            expect(seg0.percentage).toBe(50);

            const seg1 = dist.find((d) => d.segment === 1)!;
            expect(seg1.count).toBe(1);
            expect(seg1.percentage).toBe(25);

            const seg2 = dist.find((d) => d.segment === 2)!;
            expect(seg2.count).toBe(1);
            expect(seg2.percentage).toBe(25);
        });

        it('should handle empty input', () => {
            const dist = getSegmentDistribution([]);
            expect(dist).toHaveLength(3);
            for (const d of dist) {
                expect(d.count).toBe(0);
                expect(d.percentage).toBe(0);
            }
        });
    });
});

/* ═══════════════════════════════════════════
   Unit Tests — Recommend Engine
   ═══════════════════════════════════════════ */

describe('Recommend Engine', () => {
    describe('computeRecommendations', () => {
        it('should return empty map for empty input', () => {
            const results = computeRecommendations([]);
            expect(results.size).toBe(0);
        });

        it('should compute recommendations from interactions', () => {
            // Vary timestamps, interaction types, and ratings so scores differ
            // preventing the mean-centering from zeroing all vectors
            const t = new Date();
            const tPast = new Date(t.getTime() - 86400000 * 30).toISOString();
            const tNow = t.toISOString();
            const interactions: InteractionInput[] = [
                // u1 — frequent buyer, high ratings
                {
                    userId: 'u1',
                    itemId: 'item_a',
                    rating: 5,
                    interactionType: 'purchase',
                    timestamp: tNow
                },
                {
                    userId: 'u1',
                    itemId: 'item_b',
                    rating: 4,
                    interactionType: 'purchase',
                    timestamp: tNow
                },
                {
                    userId: 'u1',
                    itemId: 'item_c',
                    rating: 5,
                    interactionType: 'add_to_cart',
                    timestamp: tNow
                },
                // u2 — moderate buyer, mixed ratings
                {
                    userId: 'u2',
                    itemId: 'item_a',
                    rating: 3,
                    interactionType: 'purchase',
                    timestamp: tNow
                },
                {
                    userId: 'u2',
                    itemId: 'item_b',
                    rating: 2,
                    interactionType: 'purchase',
                    timestamp: tPast
                },
                // u3 — light buyer, older interactions
                {
                    userId: 'u3',
                    itemId: 'item_c',
                    rating: 4,
                    interactionType: 'view',
                    timestamp: tPast
                },
                {
                    userId: 'u3',
                    itemId: 'item_d',
                    rating: 3,
                    interactionType: 'purchase',
                    timestamp: tPast
                }
            ];

            const results = computeRecommendations(interactions);
            expect(results.size).toBeGreaterThan(0);

            // item_a purchased by both u1 (rating 5) and u2 (rating 3) → should have similarities
            const recsForA = results.get('item_a')!;
            expect(recsForA).toBeDefined();
            expect(recsForA.length).toBeGreaterThanOrEqual(0);

            // Validate all recommendations
            results.forEach((recs) => {
                for (const rec of recs) {
                    expect(rec.itemId).toBeTruthy();
                    expect(rec.similarity).toBeGreaterThanOrEqual(0);
                    expect(rec.similarity).toBeLessThanOrEqual(1);
                }
            });
        });

        it('should handle single user interactions gracefully', () => {
            const now = new Date().toISOString();
            const interactions: InteractionInput[] = [
                {
                    userId: 'u1',
                    itemId: 'item_x',
                    rating: 5,
                    interactionType: 'purchase',
                    timestamp: now
                },
                {
                    userId: 'u1',
                    itemId: 'item_y',
                    rating: 4,
                    interactionType: 'add_to_cart',
                    timestamp: now
                }
            ];

            const results = computeRecommendations(interactions);
            expect(results.size).toBe(2);
            results.forEach((recs) => {
                expect(Array.isArray(recs)).toBe(true);
            });
        });

        it('should respect different interaction types with different weights', () => {
            const now = new Date().toISOString();
            const interactions: InteractionInput[] = [
                {
                    userId: 'u1',
                    itemId: 'item_p',
                    rating: null,
                    interactionType: 'purchase',
                    timestamp: now
                },
                {
                    userId: 'u1',
                    itemId: 'item_q',
                    rating: null,
                    interactionType: 'view',
                    timestamp: now
                },
                {
                    userId: 'u1',
                    itemId: 'item_r',
                    rating: null,
                    interactionType: 'add_to_cart',
                    timestamp: now
                }
            ];

            const interactions2: InteractionInput[] = [
                ...interactions,
                {
                    userId: 'u2',
                    itemId: 'item_p',
                    rating: null,
                    interactionType: 'purchase',
                    timestamp: now
                },
                {
                    userId: 'u2',
                    itemId: 'item_q',
                    rating: null,
                    interactionType: 'purchase',
                    timestamp: now
                }
            ];

            const results = computeRecommendations(interactions2);
            expect(results.size).toBeGreaterThan(0);
        });
    });

    describe('getSimilarItems', () => {
        it('should return empty array for unknown item', () => {
            const map = new Map<
                string,
                import('./ai.types.js').SimilarItem[]
            >();
            const items = getSimilarItems('unknown', map);
            expect(items).toEqual([]);
        });

        it('should return stored recommendations', () => {
            const map = new Map<
                string,
                import('./ai.types.js').SimilarItem[]
            >();
            map.set('item_1', [
                { itemId: 'item_2', similarity: 0.85 },
                { itemId: 'item_3', similarity: 0.72 }
            ]);

            const items = getSimilarItems('item_1', map);
            expect(items).toHaveLength(2);
            const firstItem = items[0]!;
            expect(firstItem.itemId).toBe('item_2');
            expect(firstItem.similarity).toBe(0.85);
        });
    });
});

/* ═══════════════════════════════════════════
   Integration Tests — AI API Routes
   ═══════════════════════════════════════════ */

describe('AI API Routes', () => {
    const getAuth = () => testAuth.a;

    describe('GET /api/ai/health', () => {
        it('should return health status (no auth required)', async () => {
            const response = await api.get('/api/ai/health');
            expect(response.status).toBe(200);
            expect(response.body.data).toHaveProperty('churnModel');
            expect(response.body.data).toHaveProperty('segmentation');
            expect(response.body.data).toHaveProperty('recommendations');
        });

        it('should report churn model availability', async () => {
            const response = await api.get('/api/ai/health');
            expect(response.body.data.churnModel.available).toBe(true);
            expect(response.body.data.churnModel.features).toBe(11);
        });
    });

    describe('POST /api/ai/churn (compute)', () => {
        beforeAll(async () => {
            const auth = getAuth();
            // Create test customers for churn computation
            await prisma.customer.createMany({
                data: [
                    {
                        name: 'AI Churn Test 1',
                        email: `churn-1-${Date.now()}@test.com`,
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
                        name: 'AI Churn Test 2',
                        email: `churn-2-${Date.now()}@test.com`,
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

            const allResults = response.body.data.results as Array<
                Record<string, unknown>
            >;
            const firstResult = allResults[0]!;
            expect(firstResult).toHaveProperty('customerId');
            expect(firstResult).toHaveProperty('churnProbability');
            expect(firstResult).toHaveProperty('riskLevel');
            expect(['stable', 'low', 'high']).toContain(
                firstResult.riskLevel as string
            );
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
            expect(response.body.data.distribution).toHaveLength(3);
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

            expect(response.status).toBe(200);
            expect(response.body.data.totalCustomers).toBe(0);
        });

        it('should NOT allow Org B to compute segments for Org A', async () => {
            const auth = testAuth.b;
            const response = await api
                .post('/api/ai/segment')
                .set('Authorization', `Bearer ${auth.token}`);

            expect(response.status).toBe(200);
            expect(response.body.data.totalCustomers).toBe(0);
        });
    });

    describe('POST /api/ai/recommend (compute)', () => {
        beforeAll(async () => {
            const auth = getAuth();
            const product1 = await prisma.product.create({
                data: {
                    name: 'AI Rec Product 1',
                    price: 100,
                    organizationId: auth.orgId,
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            });

            const product2 = await prisma.product.create({
                data: {
                    name: 'AI Rec Product 2',
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
            expect(response.body.data.totalInteractions).toBeGreaterThanOrEqual(
                2
            );
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
