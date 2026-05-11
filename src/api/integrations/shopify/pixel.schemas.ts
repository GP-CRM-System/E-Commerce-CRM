import { z } from 'zod';

export const pixelEvent = z.object({
    event: z.enum([
        'product_viewed',
        'product_added_to_cart',
        'checkout_started',
        'page_viewed'
    ]),
    customerId: z.string().optional(),
    customerEmail: z.string().email().optional(),
    shopDomain: z.string(),
    timestamp: z.string().datetime().optional(),
    metadata: z
        .object({
            productId: z.string().optional(),
            productTitle: z.string().optional(),
            productPrice: z.string().optional(),
            variantId: z.string().optional(),
            currency: z.string().optional(),
            pageUrl: z.string().optional(),
            referrer: z.string().optional(),
            checkoutId: z.string().optional(),
            cartToken: z.string().optional()
        })
        .optional()
});

export type PixelEvent = z.infer<typeof pixelEvent>;
