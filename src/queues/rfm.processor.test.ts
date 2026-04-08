import { it, describe, expect, beforeAll, afterAll } from 'bun:test';
import prisma from '../config/prisma.config.js';
import {
    processSingleCustomerRFM,
    processRFMSynchronously
} from './rfm.queue.js';

describe('RFM Queue Processors', () => {
    let testOrgId: string;
    let testCustomerId: string;

    beforeAll(async () => {
        const org = await prisma.organization.create({
            data: {
                name: 'RFM Test Org',
                slug: 'rfm-test-org-' + Date.now()
            }
        });
        testOrgId = org.id;

        const customer = await prisma.customer.create({
            data: {
                name: 'RFM Test Customer',
                email: 'rfm-test@example.com',
                organizationId: testOrgId,
                totalOrders: 0,
                totalSpent: 0
            }
        });
        testCustomerId = customer.id;
    });

    afterAll(async () => {
        await prisma.order.deleteMany({ where: { organizationId: testOrgId } });
        await prisma.customer.deleteMany({
            where: { organizationId: testOrgId }
        });
        await prisma.organization.delete({ where: { id: testOrgId } });
    });

    it('should process RFM for a customer with no orders', async () => {
        await processSingleCustomerRFM(testCustomerId, testOrgId);

        const customer = await prisma.customer.findUnique({
            where: { id: testCustomerId }
        });

        expect(customer?.totalOrders).toBe(0);
        expect(customer?.rfmScore).toBeNull();
    });

    it('should process RFM for a customer with orders', async () => {
        // Create a test order
        await prisma.order.create({
            data: {
                organizationId: testOrgId,
                customerId: testCustomerId,
                totalAmount: 1000,
                paymentStatus: 'PAID',
                shippingStatus: 'DELIVERED',
                currency: 'EGP',
                source: 'MANUAL',
                createdAt: new Date()
            }
        });

        await processSingleCustomerRFM(testCustomerId, testOrgId);

        const customer = await prisma.customer.findUnique({
            where: { id: testCustomerId }
        });

        expect(customer?.totalOrders).toBe(1);
        expect(Number(customer?.totalSpent)).toBe(1000);
        expect(customer?.rfmScore).toBeDefined();
        expect(customer?.rfmSegment).toBeDefined();
    });

    it('should process batch RFM synchronously', async () => {
        const count = await processRFMSynchronously(testOrgId);
        expect(count).toBe(1); // One customer with orders
    });
});
