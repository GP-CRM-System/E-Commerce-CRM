import crypto from 'crypto';
import prisma from '../../config/prisma.config.js';

import logger from '../../utils/logger.util.js';

export interface FawryConfig {
    merchantCode: string;
    securityKey: string;
    baseUrl: string;
}

export async function initializeFawryPayment(data: {
    orderId: string;
    organizationId: string;
    amount: number;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
}) {
    // In a real app, get these from organization settings
    const config: FawryConfig = {
        merchantCode: process.env.FAWRY_MERCHANT_CODE || 'TEST',
        securityKey: process.env.FAWRY_SECURITY_KEY || 'TEST',
        baseUrl:
            process.env.FAWRY_BASE_URL || 'https://atfawry.fawrystaging.com'
    };

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
    const transaction = await prisma.transaction.findFirst({
        where: { orderId: data.merchantRefNum, provider: 'FAWRY' }
    });

    if (!transaction) throw new Error('Transaction not found');

    const isSuccess = data.orderStatus === 'PAID';

    await prisma.$transaction([
        prisma.transaction.update({
            where: { id: transaction.id },
            data: {
                status: isSuccess ? 'SUCCESS' : 'FAILED',
                externalId: data.fawryRefNo,
                metadata: {
                    ...((transaction.metadata as object) || {}),
                    ...data
                }
            }
        }),
        prisma.order.update({
            where: { id: transaction.orderId },
            data: {
                paymentStatus: isSuccess ? 'PAID' : 'FAILED'
            }
        })
    ]);

    logger.info(
        { orderId: transaction.orderId, isSuccess },
        'Fawry payment verified'
    );

    return { success: isSuccess };
}
