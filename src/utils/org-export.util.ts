import prisma from '../config/prisma.config.js';
import {
    uploadToB2,
    getSignedDownloadUrl,
    isB2Configured
} from '../config/b2.config.js';
import logger from './logger.util.js';

export async function exportOrganizationData(organizationId: string): Promise<{
    success: boolean;
    downloadUrl?: string;
    error?: string;
}> {
    try {
        const [customers, products, orders, members, segments, campaigns] =
            await Promise.all([
                prisma.customer.findMany({
                    where: { organizationId },
                    take: 50000
                }),
                prisma.product.findMany({
                    where: { organizationId },
                    take: 50000
                }),
                prisma.order.findMany({
                    where: { organizationId },
                    take: 50000,
                    include: { customer: true }
                }),
                prisma.member.findMany({
                    where: { organizationId },
                    include: { user: { select: { email: true, name: true } } },
                    take: 50000
                }),
                prisma.segment.findMany({
                    where: { organizationId },
                    take: 50000
                }),
                prisma.campaign.findMany({
                    where: { organizationId },
                    take: 50000
                })
            ]);

        const exportData = {
            exportDate: new Date().toISOString(),
            organizationId,
            summary: {
                customers: customers.length,
                products: products.length,
                orders: orders.length,
                members: members.length,
                segments: segments.length,
                campaigns: campaigns.length
            },
            customers: customers.map((c) => ({
                name: c.name,
                email: c.email,
                phone: c.phone,
                city: c.city,
                source: c.source,
                lifecycleStage: c.lifecycleStage
            })),
            products: products.map((p) => ({
                name: p.name,
                sku: p.sku,
                price: Number(p.price),
                category: p.category,
                inventory: p.inventory
            })),
            orders: orders.map((o) => ({
                externalId: o.externalId,
                customerName: o.customer?.name,
                totalAmount: Number(o.totalAmount),
                paymentStatus: o.paymentStatus,
                shippingStatus: o.shippingStatus,
                createdAt: o.createdAt
            })),
            members: members.map((m) => ({
                email: m.user?.email,
                name: m.user?.name,
                role: m.role
            })),
            segments: segments.map((s) => ({
                name: s.name,
                filter: s.filter
            })),
            campaigns: campaigns.map((c) => ({
                name: c.name,
                status: c.status,
                sentAt: c.sentAt
            }))
        };

        const jsonContent = JSON.stringify(exportData, null, 2);
        const buffer = Buffer.from(jsonContent);

        const b2Key = `exports/org-${organizationId}-${Date.now()}.json`;

        if (isB2Configured) {
            const uploadResult = await uploadToB2(b2Key, buffer);
            if (!uploadResult.success) {
                return {
                    success: false,
                    error: uploadResult.error
                };
            }

            const urlResult = await getSignedDownloadUrl(b2Key, 60 * 60 * 24 * 7);
            if (urlResult.success) {
                logger.info(
                    { organizationId },
                    'Organization data export created in B2'
                );
                return {
                    success: true,
                    downloadUrl: urlResult.url
                };
            }
        }

        const fs = await import('fs');
        const path = await import('path');
        const tempDir = path.join(process.cwd(), 'temp', 'exports');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const filePath = path.join(tempDir, `org-${organizationId}-export.json`);
        fs.writeFileSync(filePath, buffer);

        logger.info({ organizationId, filePath }, 'Organization data exported locally');
        return {
            success: true,
            downloadUrl: `/api/exports/download/${organizationId}`
        };
    } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown error';
        logger.error({ error, organizationId }, 'Failed to export organization data');
        return { success: false, error };
    }
}