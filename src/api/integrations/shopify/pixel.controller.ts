import type { Response } from 'express';
import type { Request } from 'express';
import prisma from '../../../config/prisma.config.js';
import { asyncHandler } from '../../../middlewares/error.middleware.js';
import {
    ResponseHandler,
    HttpStatus,
    ErrorCode
} from '../../../utils/response.util.js';
import { pixelEvent } from './pixel.schemas.js';
import logger from '../../../utils/logger.util.js';

function getShopDomain(req: Request): string | null {
    const host = req.headers['x-shopify-shop-domain'] as string | undefined;
    if (host) return host;
    const origin = req.headers.origin;
    if (origin) {
        try {
            const url = new URL(origin);
            if (url.hostname.endsWith('.myshopify.com')) {
                return url.hostname;
            }
        } catch {
            return null;
        }
    }
    return null;
}

export const ingest = asyncHandler(async (req: Request, res: Response) => {
    const parsed = pixelEvent.safeParse(req.body);
    if (!parsed.success) {
        return ResponseHandler.error(
            res,
            `Invalid pixel event payload: ${parsed.error.message}`,
            ErrorCode.VALIDATION_ERROR,
            HttpStatus.BAD_REQUEST
        );
    }

    const { event, customerId, customerEmail, shopDomain, metadata } =
        parsed.data;

    const shop = getShopDomain(req) || shopDomain;
    if (!shop) {
        return ResponseHandler.error(
            res,
            'Shop domain is required',
            ErrorCode.VALIDATION_ERROR,
            HttpStatus.BAD_REQUEST
        );
    }

    const integration = await prisma.integration.findFirst({
        where: {
            provider: 'shopify',
            shopDomain: shop,
            isActive: true
        }
    });

    if (!integration) {
        return ResponseHandler.error(
            res,
            'Shop not found or integration inactive',
            ErrorCode.RESOURCE_NOT_FOUND,
            HttpStatus.NOT_FOUND
        );
    }

    const orgId = integration.orgId;

    let resolvedCustomerId = customerId;

    if (!resolvedCustomerId && customerEmail) {
        const customer = await prisma.customer.findFirst({
            where: {
                organizationId: orgId,
                email: customerEmail
            }
        });
        if (customer) {
            resolvedCustomerId = customer.id;
        }
    }

    if (resolvedCustomerId) {
        const eventTypeMap: Record<string, string> = {
            product_viewed: 'PRODUCT_VIEWED',
            product_added_to_cart: 'ADDED_TO_CART',
            checkout_started: 'CHECKOUT_STARTED',
            page_viewed: 'PAGE_VIEWED'
        };

        await prisma.customerEvent.create({
            data: {
                customerId: resolvedCustomerId,
                eventType: eventTypeMap[event] || event.toUpperCase(),
                description: `${event}: ${metadata?.productTitle || metadata?.pageUrl || 'N/A'}`,
                metadata: (metadata as object) || {},
                source: 'shopify',
                occurredAt: new Date()
            }
        });
    }

    logger.info(
        `Pixel event ${event} ingested from ${shop}${resolvedCustomerId ? ` for customer ${resolvedCustomerId}` : ' (anonymous)'}`
    );

    return ResponseHandler.success(res, 'Event ingested', HttpStatus.OK, {
        tracked: !!resolvedCustomerId
    });
});
