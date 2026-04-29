import crypto from 'crypto';
import prisma from '../../config/prisma.config.js';

import logger from '../../utils/logger.util.js';

export interface FawryConfig {
    merchantCode: string;
    securityKey: string;
    baseUrl: string;
}

function getFawryConfig(): FawryConfig {
    return {
        merchantCode: process.env.FAWRY_MERCHANT_CODE || 'TEST',
        securityKey: process.env.FAWRY_SECURITY_KEY || 'TEST',
        baseUrl:
            process.env.FAWRY_BASE_URL || 'https://atfawry.fawrystaging.com'
    };
}

function buildCallbackChecksum(params: {
    merchantCode: string;
    merchantRefNum: string;
    fawryRefNo: string;
    orderStatus: string;
    securityKey: string;
}): string {
    const source = `${params.merchantCode}${params.merchantRefNum}${params.fawryRefNo}${params.orderStatus}${params.securityKey}`;
    return crypto.createHash('sha256').update(source).digest('hex');
}

function timingSafeEqualHex(a: string, b: string): boolean {
    const normalizedA = a.toLowerCase().trim();
    const normalizedB = b.toLowerCase().trim();

    if (normalizedA.length !== normalizedB.length) {
        return false;
    }

    try {
        return crypto.timingSafeEqual(
            Buffer.from(normalizedA, 'hex'),
            Buffer.from(normalizedB, 'hex')
        );
    } catch {
        return false;
    }
}

export async function initializeFawryPayment(data: {
    orderId: string;
    organizationId: string;
    amount: number;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
}) {
    const config = getFawryConfig();

    const merchantRefNum = data.orderId;
    const amount = data.amount.toFixed(2);

    // Generate Signature: merchantCode + merchantRefNum + customerProfileId + itemId + quantity + amount + securityKey
    // Simplified for demo
    const signatureSource = `${config.merchantCode}${merchantRefNum}default${amount}${config.securityKey}`;
    const signature = crypto
        .createHash('sha256')
        .update(signatureSource)
        .digest('hex');

    const transaction = await prisma.transaction.create({
        data: {
            organizationId: data.organizationId,
            orderId: data.orderId,
            amount: data.amount,
            provider: 'FAWRY',
            status: 'PENDING',
            type: 'PAYMENT',
            metadata: { merchantRefNum, signature }
        }
    });

    return {
        transactionId: transaction.id,
        merchantCode: config.merchantCode,
        merchantRefNum,
        signature,
        fawryUrl: `${config.baseUrl}/atfawry/plugin/fawry-pay.js`
    };
}

export async function verifyFawryPayment(data: {
    merchantRefNum: string;
    fawryRefNo: string;
    orderStatus: string;
    checksum: string;
}) {
    const config = getFawryConfig();

    const expectedChecksum = buildCallbackChecksum({
        merchantCode: config.merchantCode,
        merchantRefNum: data.merchantRefNum,
        fawryRefNo: data.fawryRefNo,
        orderStatus: data.orderStatus,
        securityKey: config.securityKey
    });

    if (!timingSafeEqualHex(data.checksum, expectedChecksum)) {
        logger.warn(
            { merchantRefNum: data.merchantRefNum },
            'Invalid Fawry callback checksum'
        );
        throw new Error('Invalid callback checksum');
    }

    const transaction = await prisma.transaction.findFirst({
        where: {
            orderId: data.merchantRefNum,
            provider: 'FAWRY'
        },
        include: {
            order: {
                select: {
                    id: true,
                    organizationId: true
                }
            }
        }
    });

    if (!transaction || !transaction.order) {
        throw new Error('Transaction not found');
    }

    if (transaction.organizationId !== transaction.order.organizationId) {
        logger.error(
            {
                transactionId: transaction.id,
                transactionOrgId: transaction.organizationId,
                orderOrgId: transaction.order.organizationId
            },
            'Transaction organization mismatch with order organization'
        );
        throw new Error('Organization mismatch');
    }

    const isSuccess = data.orderStatus === 'PAID';

    await prisma.$transaction([
        prisma.transaction.update({
            where: { id: transaction.id },
            data: {
                status: isSuccess ? 'SUCCESS' : 'FAILED',
                externalId: data.fawryRefNo,
                metadata: {
                    ...((transaction.metadata as object) || {}),
                    ...data,
                    callbackVerifiedAt: new Date().toISOString()
                }
            }
        }),
        prisma.order.update({
            where: {
                id: transaction.orderId,
                organizationId: transaction.organizationId
            },
            data: {
                paymentStatus: isSuccess ? 'PAID' : 'FAILED'
            }
        })
    ]);

    logger.info(
        {
            orderId: transaction.orderId,
            organizationId: transaction.organizationId,
            isSuccess
        },
        'Fawry payment verified'
    );

    return { success: isSuccess };
}
