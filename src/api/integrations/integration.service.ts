import crypto from 'crypto';
import logger from '../../utils/logger.util.js';
import { decryptSafe, encrypt } from '../../utils/encryption.util.js';
import { NotFoundError } from '../../utils/response.util.js';
import prisma from '../../config/prisma.config.js';
import type { Integration } from '../../generated/prisma/client.js';
import type {
    ConnectShopifyInput,
    UpdateIntegrationInput,
    ConnectMetaInput
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
            apiSecret: data.apiSecret,
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

export async function createMetaIntegration(
    orgId: string,
    data: ConnectMetaInput
): Promise<Integration> {
    logger.info(`Creating Meta ${data.channel} integration for org ${orgId}`);

    const channelKey =
        data.channel === 'whatsapp'
            ? 'whatsappPhoneNumberId'
            : data.channel === 'messenger'
              ? 'facebookPageId'
              : 'instagramBusinessAccountId';

    const existingMeta = await prisma.integration.findMany({
        where: { orgId, provider: 'meta' },
        select: { metadata: true }
    });

    const duplicate = existingMeta.find(
        (i) => i.metadata && (i.metadata as Record<string, string>)[channelKey]
    );

    if (duplicate) {
        throw new Error(
            `Meta ${data.channel} integration already exists for this organization`
        );
    }

    const integration = await prisma.integration.create({
        data: {
            orgId,
            provider: 'meta',
            name: data.name || `Meta ${data.channel}`,
            accessToken: encrypt(data.accessToken),
            syncStatus: 'connected',
            syncMode: 'webhook',
            isActive: true,
            metadata: data.metadata as object
        }
    });

    logger.info(`Meta ${data.channel} integration created: ${integration.id}`);
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

    const { accessToken, metadata, ...rest } = data;

    return prisma.integration.update({
        where: { id: integrationId },
        data: {
            ...rest,
            ...(accessToken ? { accessToken: encrypt(accessToken) } : {}),
            ...(metadata !== undefined ? { metadata: metadata as object } : {}),
            updatedAt: new Date()
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

    try {
        if (integration.provider === 'shopify') {
            const shop = integration.shopDomain!.replace('.myshopify.com', '');
            const response = await fetch(
                `https://${shop}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}/shop.json`,
                {
                    headers: {
                        'X-Shopify-Access-Token': decryptSafe(
                            integration.accessToken
                        ),
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
        }

        if (integration.provider === 'meta') {
            const response = await fetch(
                'https://graph.facebook.com/v18.0/me',
                {
                    headers: {
                        Authorization: `Bearer ${decryptSafe(integration.accessToken)}`
                    }
                }
            );

            const data = (await response.json()) as {
                id?: string;
                name?: string;
                error?: { message?: string };
            };

            if (!response.ok || data.error) {
                return {
                    success: false,
                    error:
                        data.error?.message ||
                        `Meta API error: ${response.status}`
                };
            }

            await prisma.integration.update({
                where: { id: integrationId },
                data: {
                    syncStatus: 'connected',
                    lastSyncedAt: new Date()
                }
            });

            return { success: true, shop: data.name || 'Meta Account' };
        }

        throw new Error(`Unsupported provider: ${integration.provider}`);
    } catch (error) {
        logger.error(`Connection test failed: ${error}`);
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
    apiCallPaginated: <T>(
        endpointOrUrl: string
    ) => Promise<{ data: T; linkHeader: string | null }>;
}> {
    const shop = integration.shopDomain!.replace('.myshopify.com', '');
    const decryptedToken = decryptSafe(integration.accessToken);

    const apiCall = async <T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> => {
        const url = `https://${shop}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}${endpoint}`;
        const response = await fetch(url, {
            ...options,
            headers: {
                'X-Shopify-Access-Token': decryptedToken,
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

    const apiCallPaginated = async <T>(
        endpointOrUrl: string
    ): Promise<{ data: T; linkHeader: string | null }> => {
        const url = endpointOrUrl.startsWith('http')
            ? endpointOrUrl
            : `https://${shop}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}${endpointOrUrl}`;

        const response = await fetch(url, {
            headers: {
                'X-Shopify-Access-Token': decryptedToken,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
                `Shopify API error: ${response.status} - ${errorText}`
            );
        }

        const data = (await response.json()) as T;
        return { data, linkHeader: response.headers.get('Link') };
    };

    return {
        shop,
        accessToken: decryptedToken,
        apiCall,
        apiCallPaginated
    };
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
