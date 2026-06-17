// Use the extension config ingestion URL, with a localhost fallback for development.
const INGESTION_URL = (typeof __EXTENSION_CONFIG__ !== 'undefined' && __EXTENSION_CONFIG__.ingestion_url)
    ? __EXTENSION_CONFIG__.ingestion_url
    : 'http://localhost:6892/api/integrations/shopify/pixel-ingest';

function sendEvent(eventName, metadata = {}) {
    const payload = {
        event: eventName,
        shopDomain: window.Shopify?.shop || '',
        timestamp: new Date().toISOString(),
        metadata
    };

    const customerEmail = window.Shopify?.customer?.email;
    if (customerEmail) {
        payload.customerEmail = customerEmail;
    }
    try {
        navigator.sendBeacon(INGESTION_URL, JSON.stringify(payload));
    } catch {
        fetch(INGESTION_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true
        }).catch(() => {});
    }
}

export function register() {
    if (window.Shopify?.analytics) {
        window.Shopify.analytics.subscribe('product_viewed', (event) => {
            sendEvent('product_viewed', {
                productId: event.productId || event.detail?.productId,
                productTitle: event.productTitle || event.detail?.productTitle,
                productPrice: event.price || event.detail?.price,
                currency: event.currency || event.detail?.currency
            });
        });

        window.Shopify.analytics.subscribe(
            'product_added_to_cart',
            (event) => {
                sendEvent('product_added_to_cart', {
                    productId:
                        event.productId || event.detail?.productId,
                    productTitle:
                        event.productTitle ||
                        event.detail?.productTitle,
                    productPrice:
                        event.price || event.detail?.price,
                    variantId:
                        event.variantId || event.detail?.variantId,
                    currency:
                        event.currency || event.detail?.currency
                });
            }
        );

        window.Shopify.analytics.subscribe('checkout_started', (event) => {
            sendEvent('checkout_started', {
                checkoutId:
                    event.checkoutId || event.detail?.checkoutId,
                currency:
                    event.currency || event.detail?.currency
            });
        });

        window.Shopify.analytics.subscribe('page_viewed', (event) => {
            sendEvent('page_viewed', {
                pageUrl:
                    event.pageUrl ||
                    event.detail?.pageUrl ||
                    window.location.href,
                referrer: document.referrer || undefined
            });
        });
    }
}
