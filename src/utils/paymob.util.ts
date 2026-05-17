import crypto from 'crypto';
import { env } from '../config/env.config.js';
import logger from './logger.util.js';

export interface PaymobIntentionPayload {
    amount: number; // in cents
    currency: string;
    payment_methods: number[];
    items: Array<{
        name: string;
        amount: number; // in cents
        description: string;
        quantity: number;
    }>;
    billing_data: {
        apartment: string;
        first_name: string;
        last_name: string;
        street: string;
        building: string;
        phone_number: string;
        city: string;
        country: string;
        email: string;
        floor: string;
        state: string;
    };
    notification_url: string;
    redirection_url: string;
    special_reference?: string;
    extras?: Record<string, unknown>;
}

export interface PaymobCallbackPayload {
    hmac?: string;
    obj: {
        id: string;
        amount_cents: number;
        created_at: string;
        currency: string;
        success: boolean;
        pending: boolean;
        is_3d_secure: boolean;
        is_auth: boolean;
        is_capture: boolean;
        is_refunded: boolean;
        is_standalone_payment: boolean;
        is_voided: boolean;
        error_occured: boolean;
        has_parent_transaction: boolean;
        integration_id: number;
        order: number | { id: number };
        owner: number;
        source_data: {
            pan: string;
            sub_type: string;
            type: string;
        } | null;
        merchant_order_id?: string;
        extra?: { special_reference?: string };
    };
}

export interface PaymobIntentionResponse {
    client_secret: string;
    id: string; // The intention ID
    payment_keys?: Array<{
        integration: number;
        key: string;
    }>;
}

/**
 * Creates a payment intention on Paymob
 */
export async function createIntention(payload: PaymobIntentionPayload): Promise<PaymobIntentionResponse> {
    const url = `${env.paymobBaseUrl}/v1/intention/`;
    
    logger.info({ amount: payload.amount }, 'Creating Paymob payment intention');

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Token ${env.paymobSecretKey}`
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorText = await response.text();
        logger.error({ status: response.status, errorText }, 'Paymob Intention API Error');
        throw new Error(`Paymob Intention API Error: ${response.status} - ${errorText}`);
    }

    return response.json() as Promise<PaymobIntentionResponse>;
}

/**
 * Verifies Paymob transaction callback HMAC signature
 */
export function verifyCallbackSignature(
    payload: PaymobCallbackPayload,
    hmacReceived: string
): boolean {
    const { obj } = payload;

    const orderId = typeof obj.order === 'object' ? obj.order.id : obj.order;
    const pan = obj.source_data?.pan || '';
    const subType = obj.source_data?.sub_type || '';
    const type = obj.source_data?.type || '';

    const stringToHash = 
        `${obj.amount_cents}` +
        `${obj.created_at}` +
        `${obj.currency}` +
        `${obj.error_occured}` +
        `${obj.has_parent_transaction}` +
        `${obj.id}` +
        `${obj.integration_id}` +
        `${obj.is_3d_secure}` +
        `${obj.is_auth}` +
        `${obj.is_capture}` +
        `${obj.is_refunded}` +
        `${obj.is_standalone_payment}` +
        `${obj.is_voided}` +
        `${orderId}` +
        `${obj.owner}` +
        `${obj.pending}` +
        `${pan}` +
        `${subType}` +
        `${type}` +
        `${obj.success}`;

    const computedHmac = crypto
        .createHmac('sha256', env.paymobSecretKey || '')
        .update(stringToHash)
        .digest('hex');

    const match = crypto.timingSafeEqual(
        Buffer.from(computedHmac, 'hex'),
        Buffer.from(hmacReceived, 'hex')
    );

    if (!match) {
        logger.warn({ computedHmac, hmacReceived }, 'Paymob HMAC signature verification failed');
    }

    return match;
}

/**
 * Reconstructs a Paymob callback payload from flat redirect query params.
 */
export function parseRedirectQueryParams(
    query: Record<string, string | string[] | undefined>
): { payload: PaymobCallbackPayload; hmac: string } | null {
    const get = (key: string): string | undefined => {
        const val = query[key];
        if (Array.isArray(val)) return val[0];
        return val;
    };

    const hmac = get('hmac');
    if (!hmac) return null;

    const id = get('id');
    if (!id) return null;

    const payload: PaymobCallbackPayload = {
        hmac,
        obj: {
            id,
            amount_cents: Number(get('amount_cents') || 0),
            created_at: get('created_at') || '',
            currency: get('currency') || '',
            success: get('success') === 'true',
            pending: get('pending') === 'true',
            is_3d_secure: get('is_3d_secure') === 'true',
            is_auth: get('is_auth') === 'true',
            is_capture: get('is_capture') === 'true',
            is_refunded: get('is_refunded') === 'true',
            is_standalone_payment: get('is_standalone_payment') === 'true',
            is_voided: get('is_voided') === 'true',
            error_occured: get('error_occured') === 'true',
            has_parent_transaction: get('has_parent_transaction') === 'true',
            integration_id: Number(get('integration_id') || 0),
            order: (() => {
                const order = get('order');
                return order ? Number(order) : 0;
            })(),
            owner: Number(get('owner') || 0),
            source_data: {
                pan: get('source_data.pan') || '',
                sub_type: get('source_data.sub_type') || '',
                type: get('source_data.type') || ''
            },
            merchant_order_id: get('merchant_order_id')
        }
    };

    return { payload, hmac };
}
