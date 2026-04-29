import crypto from 'crypto';
import logger from '../../utils/logger.util.js';
import { NotFoundError } from '../../utils/response.util.js';
import prisma from '../../config/prisma.config.js';
import type { Integration } from '../../generated/prisma/client.js';
import type {
    ConnectShopifyInput,
    UpdateIntegrationInput
} from './integration.schemas.js';

const SHOPIFY_API_VERSION = '2024-01';

export async function createShopifyIntegration(
    orgId: string,
    data: ConnectShopifyInput
): Promise<Integration> {
    logger.info(`Creating Shopify integration for org ${orgId}`);

    const existing = await prisma.integration.findFirst({
        where: {
            orgId,
            provider: 'shopify',
            shopDomain: data.shopDomain
        }
    });

    if (existing) {
        throw new Error(
            `Integration for ${data.shopDomain} already exists for this organization`
        );
    }

    const integration = await prisma.integration.create({
        data: {
            orgId,
            provider: 'shopify',
            name: data.name || data.shopDomain,
            shopDomain: data.shopDomain,
            accessToken: data.accessToken,
            syncStatus: 'pending',
            syncMode: 'webhook',
            isActive: true
        }
    });

    logger.info(
        `Shopify integration created: ${integration.id} for ${data.shopDomain}`
    );
    return integration;
}

export async function getIntegrationByOrg(
    orgId: string,
    provider?: string
): Promise<Integration | Integration[] | null> {
    const where: { orgId: string; provider?: string } = { orgId };
    if (provider) {
        where.provider = provider;
        const integration = await prisma.integration.findFirst({ where });
        return integration;
    }

    return prisma.integration.findMany({ where });
}

export async function getIntegration(
    integrationId: string,
    orgId: string
): Promise<Integration | null> {
    return prisma.integration.findFirst({
        where: {
            id: integrationId,
            orgId
        }
    });
}

export async function updateIntegrationData(
    integrationId: string,
    orgId: string,
    data: UpdateIntegrationInput
): Promise<Integration> {
    const integration = await prisma.integration.findFirst({
        where: { id: integrationId, orgId }
    });

    if (!integration) {
        throw new NotFoundError('Integration not found');
    }

    return prisma.integration.update({
        where: { id: integrationId },
        data: {
            ...data,
            updatedAt: new Date(),
            metadata: data.metadata as object | undefined
        }
    });
}

export async function deleteIntegration(
    integrationId: string,
    orgId: string
): Promise<void> {
    const integration = await prisma.integration.findFirst({
        where: { id: integrationId, orgId }
    });

    if (!integration) {
        throw new NotFoundError('Integration not found');
    }

    await prisma.$transaction([
        prisma.webhookLog.deleteMany({ where: { integrationId } }),
        prisma.syncLog.deleteMany({ where: { integrationId } }),
        prisma.integration.delete({ where: { id: integrationId } })
    ]);

    logger.info(`Deleted integration ${integrationId}`);
}

export async function testConnection(
    integrationId: string,
    orgId: string
): Promise<{ success: boolean; shop?: string; error?: string }> {
    const integration = await prisma.integration.findFirst({
        where: { id: integrationId, orgId }
    });

    if (!integration) {
        throw new NotFoundError('Integration not found');
    }

    if (integration.provider !== 'shopify') {
        throw new Error('Only Shopify integrations supported');
    }

    try {
        const shop = integration.shopDomain!.replace('.myshopify.com', '');
        const response = await fetch(
            `https://${shop}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}/shop.json`,
            {
                headers: {
                    'X-Shopify-Access-Token': integration.accessToken,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!response.ok) {
            return {
                success: false,
                error: `Shopify API error: ${response.status} ${response.statusText}`
            };
        }

        const data = (await response.json()) as { shop: { name: string } };

        await prisma.integration.update({
            where: { id: integrationId },
            data: {
                syncStatus: 'connected',
                lastSyncedAt: new Date()
            }
        });

        return { success: true, shop: data.shop.name };
    } catch (error) {
        logger.error(`Shopify connection test failed: ${error}`);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Connection failed'
        };
    }
}

export async function getShopifyClient(integration: Integration): Promise<{
    shop: string;
    accessToken: string;
    apiCall: <T>(endpoint: string, options?: RequestInit) => Promise<T>;
}> {
    const shop = integration.shopDomain!.replace('.myshopify.com', '');

    const apiCall = async <T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> => {
        const url = `https://${shop}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}${endpoint}`;
        const response = await fetch(url, {
            ...options,
            headers: {
                'X-Shopify-Access-Token': integration.accessToken,
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
                `Shopify API error: ${response.status} - ${errorText}`
            );
        }

        return response.json() as Promise<T>;
    };

    return { shop, accessToken: integration.accessToken, apiCall };
}

export function verifyShopifyWebhook(
    body: string,
    hmac: string,
    secret: string
): boolean {
    const generatedHash = crypto
        .createHmac('sha256', secret)
        .update(body, 'utf8')
        .digest('base64');

    return crypto.timingSafeEqual(
        Buffer.from(hmac || ''),
        Buffer.from(generatedHash)
    );
}

export async function registerWebhooks(
    integrationId: string,
    orgId: string,
    topics: string[],
    webhookUrl: string
): Promise<{
    registered: string[];
    failed: { topic: string; error: string }[];
}> {
    const integration = await prisma.integration.findFirst({
        where: { id: integrationId, orgId }
    });

    if (!integration || integration.provider !== 'shopify') {
        throw new NotFoundError('Integration not found');
    }

    const { apiCall } = await getShopifyClient(integration);
    const registered: string[] = [];
    const failed: { topic: string; error: string }[] = [];

    for (const topic of topics) {
        try {
            const address = `${webhookUrl}/api/webhooks/shopify/${integrationId}`;

            await apiCall('/webhooks.json', {
                method: 'POST',
                body: JSON.stringify({
                    webhook: {
                        topic,
                        address,
                        format: 'json'
                    }
                })
            });

            registered.push(topic);
            logger.info(`Registered webhook for topic: ${topic}`);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            failed.push({ topic, error: message });
            logger.error(`Failed to register webhook for ${topic}: ${message}`);
        }
    }

    return { registered, failed };
}
