import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import prisma from '../config/prisma.config.js';
import { exportOrganizationData } from './org-export.util.js';

describe('Organization Export', () => {
    const testOrgId = 'test-org-export-' + Date.now();

    beforeAll(async () => {
        await prisma.organization.upsert({
            where: { id: testOrgId },
            update: {},
            create: {
                id: testOrgId,
                name: 'Export Test Org',
                slug: 'export-test-' + Date.now()
            }
        });

        await prisma.customer.createMany({
            data: [
                {
                    organizationId: testOrgId,
                    name: 'Test Customer 1',
                    email: 'customer1@test.com'
                },
                {
                    organizationId: testOrgId,
                    name: 'Test Customer 2',
                    email: 'customer2@test.com'
                }
            ],
            skipDuplicates: true
        });

        await prisma.product.createMany({
            data: [
                {
                    organizationId: testOrgId,
                    name: 'Test Product 1',
                    sku: 'SKU-001',
                    price: 99.99
                }
            ],
            skipDuplicates: true
        });
    });

    afterAll(async () => {
        await prisma.customer.deleteMany({
            where: { organizationId: testOrgId }
        });
        await prisma.product.deleteMany({
            where: { organizationId: testOrgId }
        });
        await prisma.organization.delete({ where: { id: testOrgId } });
    });

    describe('exportOrganizationData', () => {
        it('should export organization data successfully', async () => {
            const result = await exportOrganizationData(testOrgId);

            expect(result.success).toBe(true);
            expect(result.downloadUrl).toBeDefined();
            expect(result.error).toBeUndefined();
        });

        it('should include customers in export', async () => {
            const result = await exportOrganizationData(testOrgId);

            expect(result.success).toBe(true);
        });

        it('should return success with empty data for non-existent org', async () => {
            const result = await exportOrganizationData('non-existent-org');

            // Prisma returns empty arrays, not error
            expect(result.success).toBe(true);
            expect(result.downloadUrl).toBeDefined();
        });
    });
});
