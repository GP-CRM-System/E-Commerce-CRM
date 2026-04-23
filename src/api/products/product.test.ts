import request from 'supertest';
import { it, describe, expect, beforeAll, afterAll } from 'bun:test';
import app from '../../app.js';
import prisma from '../../config/prisma.config.js';
import {
    createTestUser,
    cleanupTestUser,
    type TestAuth
} from '../../test/helpers/auth.js';

describe('Products API', () => {
    let authA: TestAuth;
    let authB: TestAuth;
    let testProductId: string;

    let emailA: string;
    let emailB: string;

    beforeAll(async () => {
        emailA = `product-a-${Date.now()}@test.com`;
        emailB = `product-b-${Date.now()}@test.com`;
        authA = await createTestUser(
            emailA,
            'Product Org A',
            `prod-org-a-${Date.now()}`
        );
        authB = await createTestUser(
            emailB,
            'Product Org B',
            `prod-org-b-${Date.now()}`
        );
    });

    afterAll(async () => {
        if (authA) await cleanupTestUser(emailA, authA.orgId);
        if (authB) await cleanupTestUser(emailB, authB.orgId);
    });

    describe('POST /api/products', () => {
        it('should create a new product with full validation', async () => {
            const productData = {
                name: 'Test Product',
                price: 29.99,
                description: 'A test product',
                category: 'Electronics',
                sku: 'TEST-001',
                inventory: 100,
                status: 'active'
            };

            const response = await request(app)
                .post('/api/products')
                .set('Authorization', `Bearer ${authA.token}`)
                .send(productData);

            expect(response.status).toBe(201);
            expect(response.body.data).toHaveProperty('id');
            expect(response.body.data.name).toBe(productData.name);
            expect(Number(response.body.data.price)).toBe(productData.price);
            expect(response.body.data.category).toBe('Electronics');
            expect(response.body.data.sku).toBe('TEST-001');
            expect(response.body.data.inventory).toBe(100);
            expect(response.body.data.status).toBe('active');
            expect(response.body.data.organizationId).toBe(authA.orgId);

            testProductId = response.body.data.id;
        });

        it('should fail if name is missing (400)', async () => {
            const response = await request(app)
                .post('/api/products')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ price: 29.99 });

            expect(response.status).toBe(400);
            expect(response.body.code).toBe('VAL_OO1');
        });

        it('should fail if price is negative (400)', async () => {
            const response = await request(app)
                .post('/api/products')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ name: 'Negative Price', price: -10 });

            expect(response.status).toBe(400);
        });

        it('should fail if price is not a number (400)', async () => {
            const response = await request(app)
                .post('/api/products')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ name: 'Bad Price', price: 'not-a-number' });

            expect(response.status).toBe(400);
        });

        it('should fail if inventory is negative (400)', async () => {
            const response = await request(app)
                .post('/api/products')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ name: 'Bad Inventory', inventory: -5 });

            expect(response.status).toBe(400);
        });

        it('should fail if status is invalid enum (400)', async () => {
            const response = await request(app)
                .post('/api/products')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ name: 'Bad Status', status: 'INVALID_STATUS' });

            expect(response.status).toBe(400);
        });

        it('should reject unauthenticated requests', async () => {
            const response = await request(app)
                .post('/api/products')
                .send({ name: 'Test Product', price: 29.99 });

            expect(response.status).toBe(401);
        });
    });

    describe('Cross-Tenant Isolation', () => {
        it('should NOT allow Org B to see Org A product', async () => {
            expect(testProductId).toBeDefined();

            const response = await request(app)
                .get(`/api/products/${testProductId}`)
                .set('Authorization', `Bearer ${authB.token}`);

            expect(response.status).toBe(404);
        });

        it('should NOT allow Org B to update Org A product', async () => {
            const response = await request(app)
                .patch(`/api/products/${testProductId}`)
                .set('Authorization', `Bearer ${authB.token}`)
                .send({ name: 'Hacked Name' });

            expect(response.status).toBe(404);
        });

        it('should NOT allow Org B to delete Org A product', async () => {
            const response = await request(app)
                .delete(`/api/products/${testProductId}`)
                .set('Authorization', `Bearer ${authB.token}`);

            expect(response.status).toBe(404);
        });

        it('should NOT list Org A products in Org B', async () => {
            const response = await request(app)
                .get('/api/products')
                .set('Authorization', `Bearer ${authB.token}`);

            expect(response.status).toBe(200);
            expect(response.body.data).toEqual([]);
        });
    });

    describe('GET /api/products', () => {
        it('should list all products', async () => {
            const response = await request(app)
                .get('/api/products')
                .set('Authorization', `Bearer ${authA.token}`)
                .query({ page: '1', limit: '10' });

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.pagination).toBeDefined();
            expect(response.body.pagination).toHaveProperty('page');
            expect(response.body.pagination).toHaveProperty('limit');
            expect(response.body.pagination).toHaveProperty('total');
            expect(response.body.pagination.page).toBe(1);
            expect(response.body.pagination.limit).toBe(10);
            expect(response.body.pagination.total).toBeGreaterThanOrEqual(0);
        });

        it('should filter products by search', async () => {
            const response = await request(app)
                .get('/api/products')
                .set('Authorization', `Bearer ${authA.token}`)
                .query({ search: 'Test' });

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.data)).toBe(true);
        });

        it('should filter products by category', async () => {
            const response = await request(app)
                .get('/api/products')
                .set('Authorization', `Bearer ${authA.token}`)
                .query({ category: 'Electronics' });

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.data)).toBe(true);
        });

        it('should filter products by status', async () => {
            const response = await request(app)
                .get('/api/products')
                .set('Authorization', `Bearer ${authA.token}`)
                .query({ status: 'active' });

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.data)).toBe(true);
        });

        it('should filter products by price range', async () => {
            const response = await request(app)
                .get('/api/products')
                .set('Authorization', `Bearer ${authA.token}`)
                .query({ minPrice: '10', maxPrice: '50' });

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.data)).toBe(true);
        });

        it('should sort products by name', async () => {
            const response = await request(app)
                .get('/api/products')
                .set('Authorization', `Bearer ${authA.token}`)
                .query({ sortBy: 'name', sortOrder: 'asc' });

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.data)).toBe(true);
        });

        it('should sort products by price desc', async () => {
            const response = await request(app)
                .get('/api/products')
                .set('Authorization', `Bearer ${authA.token}`)
                .query({ sortBy: 'price', sortOrder: 'desc' });

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.data)).toBe(true);
        });
    });

    describe('GET /api/products/:id', () => {
        it('should fetch product details', async () => {
            const response = await request(app)
                .get(`/api/products/${testProductId}`)
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(200);
            expect(response.body.data.id).toBe(testProductId);
            expect(response.body.data.name).toBe('Test Product');
        });

        it('should return 404 for non-existent product', async () => {
            const response = await request(app)
                .get('/api/products/non-existent-id')
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(404);
        });
    });

    describe('PUT /api/products/:id', () => {
        it('should update a product with validation', async () => {
            const updateData = {
                name: 'Updated Product',
                price: 39.99
            };

            const response = await request(app)
                .patch(`/api/products/${testProductId}`)
                .set('Authorization', `Bearer ${authA.token}`)
                .send(updateData);

            expect(response.status).toBe(200);
            expect(response.body.data.name).toBe('Updated Product');
            expect(Number(response.body.data.price)).toBe(39.99);
        });

        it('should fail with invalid price on update (400)', async () => {
            const response = await request(app)
                .patch(`/api/products/${testProductId}`)
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ price: 'not-a-number' });

            expect(response.status).toBe(400);
        });

        it('should fail with invalid status on update (400)', async () => {
            const response = await request(app)
                .patch(`/api/products/${testProductId}`)
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ status: 'INVALID' });

            expect(response.status).toBe(400);
        });

        it('should return 404 for non-existent product on update', async () => {
            const response = await request(app)
                .patch('/api/products/non-existent-id')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ name: 'Test' });

            expect(response.status).toBe(404);
        });

        it('should verify DB state after update', async () => {
            const product = await prisma.product.findUnique({
                where: { id: testProductId },
                select: { name: true, price: true }
            });

            expect(product?.name).toBe('Updated Product');
            expect(Number(product?.price)).toBe(39.99);
        });

        it('should reject update from different org', async () => {
            const response = await request(app)
                .patch(`/api/products/${testProductId}`)
                .set('Authorization', `Bearer ${authB.token}`)
                .send({ name: 'Hacked' });

            expect(response.status).toBe(404);
        });
    });

    describe('DELETE /api/products/:id', () => {
        it('should delete a product', async () => {
            const response = await request(app)
                .delete(`/api/products/${testProductId}`)
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(204);
        });

        it('should verify product is deleted from DB', async () => {
            const product = await prisma.product.findUnique({
                where: { id: testProductId }
            });

            expect(product).toBeNull();
        });

        it('should return 404 for already deleted product', async () => {
            const response = await request(app)
                .delete(`/api/products/${testProductId}`)
                .set('Authorization', `Bearer ${authA.token}`);

            expect(response.status).toBe(404);
        });

        it('should reject delete from different org', async () => {
            const createResponse = await request(app)
                .post('/api/products')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ name: 'To Delete', price: 10 });

            const newProductId = createResponse.body.data.id;

            const response = await request(app)
                .delete(`/api/products/${newProductId}`)
                .set('Authorization', `Bearer ${authB.token}`);

            expect(response.status).toBe(404);
        });
    });

    describe('DB State Verification', () => {
        it('should maintain correct inventory after multiple updates', async () => {
            const createResponse = await request(app)
                .post('/api/products')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ name: 'Inventory Test', price: 10, inventory: 50 });

            const productId = createResponse.body.data.id;

            await request(app)
                .patch(`/api/products/${productId}`)
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ inventory: 25 });

            await request(app)
                .patch(`/api/products/${productId}`)
                .set('Authorization', `Bearer ${authA.token}`)
                .send({ inventory: 10 });

            const product = await prisma.product.findUnique({
                where: { id: productId },
                select: { inventory: true }
            });

            expect(product?.inventory).toBe(10);
        });

        it('should persist all product fields correctly', async () => {
            const createResponse = await request(app)
                .post('/api/products')
                .set('Authorization', `Bearer ${authA.token}`)
                .send({
                    name: 'Full Fields',
                    price: 100,
                    description: 'Full description',
                    category: 'Clothing',
                    sku: 'FULL-001',
                    inventory: 200,
                    status: 'active'
                });

            const productId = createResponse.body.data.id;

            const product = await prisma.product.findUnique({
                where: { id: productId }
            });

            expect(product?.name).toBe('Full Fields');
            expect(Number(product?.price)).toBe(100);
            expect(product?.description).toBe('Full description');
            expect(product?.category).toBe('Clothing');
            expect(product?.sku).toBe('FULL-001');
            expect(product?.inventory).toBe(200);
            expect(product?.status).toBe('active');
            expect(product?.organizationId).toBe(authA.orgId);
        });
    });
});
