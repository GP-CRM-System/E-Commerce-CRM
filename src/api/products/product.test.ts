import request from 'supertest';
import { it, describe, expect, beforeAll, afterAll } from 'bun:test';
import app from '../../app.js';
import prisma from '../../config/prisma.config.js';
import { auth } from '../auth/auth.js';
import { fromNodeHeaders } from 'better-auth/node';

let authToken: string;
let testOrgId: string;
let testProductId: string;

describe('Products API', () => {
    beforeAll(async () => {
        await prisma.product.deleteMany({
            where: {
                organization: { slug: { startsWith: 'product-test-org' } }
            }
        });
        await prisma.member.deleteMany({
            where: { user: { email: 'product-test@test.com' } }
        });
        await prisma.session.deleteMany({
            where: { user: { email: 'product-test@test.com' } }
        });
        await prisma.account.deleteMany({
            where: { user: { email: 'product-test@test.com' } }
        });
        await prisma.organization.deleteMany({
            where: { slug: { startsWith: 'product-test-org' } }
        });
        await prisma.user.deleteMany({
            where: { email: 'product-test@test.com' }
        });

        const signup = await auth.api.signUpEmail({
            body: {
                email: 'product-test@test.com',
                password: 'Password123!',
                name: 'Product Test User'
            }
        });

        if (!signup) throw new Error('Signup failed');
        authToken = signup.token!;

        const testUserId = signup.user.id;
        await prisma.user.update({
            where: { id: testUserId },
            data: { emailVerified: true }
        });

        const org = await auth.api.createOrganization({
            headers: fromNodeHeaders({ authorization: `Bearer ${authToken}` }),
            body: {
                name: 'Product Test Org',
                slug: 'product-test-org-' + Date.now()
            }
        });

        const orgResponse = org as {
            organization?: { id: string };
            id?: string;
        };
        testOrgId = orgResponse.organization?.id ?? orgResponse.id ?? '';

        await auth.api.setActiveOrganization({
            headers: fromNodeHeaders({ authorization: `Bearer ${authToken}` }),
            body: { organizationId: testOrgId }
        });

        const signin = await auth.api.signInEmail({
            body: { email: 'product-test@test.com', password: 'Password123!' }
        });
        authToken = signin.token!;
    });

    afterAll(async () => {
        await prisma.product.deleteMany({
            where: { organizationId: testOrgId }
        });
    });

    it('should create a new product', async () => {
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
            .set('Authorization', `Bearer ${authToken}`)
            .send(productData);

        expect(response.status).toBe(201);
        expect(response.body.data).toHaveProperty('id');
        expect(response.body.data.name).toBe(productData.name);
        expect(Number(response.body.data.price)).toBe(productData.price);

        testProductId = response.body.data.id;
    });

    it('should list all products', async () => {
        const response = await request(app)
            .get('/api/products')
            .set('Authorization', `Bearer ${authToken}`)
            .query({ page: '1', limit: '10' });

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.data)).toBe(true);
        expect(response.body.pagination).toBeDefined();
    });

    it('should filter products by search', async () => {
        const response = await request(app)
            .get('/api/products')
            .set('Authorization', `Bearer ${authToken}`)
            .query({ search: 'Test' });

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter products by category', async () => {
        const response = await request(app)
            .get('/api/products')
            .set('Authorization', `Bearer ${authToken}`)
            .query({ category: 'Electronics' });

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter products by status', async () => {
        const response = await request(app)
            .get('/api/products')
            .set('Authorization', `Bearer ${authToken}`)
            .query({ status: 'active' });

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter products by price range', async () => {
        const response = await request(app)
            .get('/api/products')
            .set('Authorization', `Bearer ${authToken}`)
            .query({ minPrice: '10', maxPrice: '50' });

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should sort products by name', async () => {
        const response = await request(app)
            .get('/api/products')
            .set('Authorization', `Bearer ${authToken}`)
            .query({ sortBy: 'name', sortOrder: 'asc' });

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should sort products by price desc', async () => {
        const response = await request(app)
            .get('/api/products')
            .set('Authorization', `Bearer ${authToken}`)
            .query({ sortBy: 'price', sortOrder: 'desc' });

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should fetch product details', async () => {
        const response = await request(app)
            .get(`/api/products/${testProductId}`)
            .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data.id).toBe(testProductId);
    });

    it('should update a product', async () => {
        const updateData = {
            name: 'Updated Product',
            price: 39.99
        };

        const response = await request(app)
            .put(`/api/products/${testProductId}`)
            .set('Authorization', `Bearer ${authToken}`)
            .send(updateData);

        expect(response.status).toBe(200);
        expect(response.body.data.name).toBe(updateData.name);
    });

    it('should delete a product', async () => {
        const response = await request(app)
            .delete(`/api/products/${testProductId}`)
            .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
    });

    it('should reject unauthenticated requests', async () => {
        const response = await request(app).get('/api/products');
        expect(response.status).toBe(401);
    });
});
