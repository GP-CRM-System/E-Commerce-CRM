import type { Response, Request } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import * as fawryService from './fawry.service.js';
import * as orderService from '../orders/order.service.js';
import type { Customer, Order } from '../../generated/prisma/client.js';
import {
    ResponseHandler,
    HttpStatus,
    ErrorCode
} from '../../utils/response.util.js';
import { asyncHandler } from '../../middlewares/error.middleware.js';
import { z } from 'zod';

type OrderWithCustomer = Order & { customer: Customer | null };

const fawryCallbackSchema = z.object({
    merchantRefNum: z.string().min(1),
    fawryRefNo: z.string().min(1),
    orderStatus: z.enum(['PAID', 'FAILED']),
    checksum: z.string().min(1)
});

export const initialize = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const orderId = req.params.orderId as string;

        const orderData = (await orderService.getOrderDetails(
            orderId,
            organizationId
        )) as OrderWithCustomer | null;

        if (!orderData || !orderData.customer) {
            return ResponseHandler.error(
                res,
                'Order or Customer not found',
                ErrorCode.RESOURCE_NOT_FOUND,
                HttpStatus.NOT_FOUND
            );
        }

        try {
            const result = await fawryService.initializeFawryPayment({
                orderId: orderData.id,
                organizationId,
                amount: Number(orderData.totalAmount),
                customerName: orderData.customer.name,
                customerEmail: orderData.customer.email || '',
                customerPhone: orderData.customer.phone || ''
            });

            return ResponseHandler.success(
                res,
                'Payment initialized',
                HttpStatus.OK,
                result
            );
        } catch {
            return ResponseHandler.error(
                res,
                'Failed to initialize payment',
                ErrorCode.SERVER_ERROR,
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }
);

export const callback = asyncHandler(async (req: Request, res: Response) => {
    const parsed = fawryCallbackSchema.safeParse(req.body);

    if (!parsed.success) {
        return ResponseHandler.error(
            res,
            'Invalid callback payload',
            ErrorCode.VALIDATION_ERROR,
            HttpStatus.BAD_REQUEST
        );
    }

    try {
        await fawryService.verifyFawryPayment(parsed.data);
        return res.status(200).send('OK');
    } catch {
        return res.status(400).send('Verification Failed');
    }
});
