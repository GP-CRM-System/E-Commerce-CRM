import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import * as orderService from './order.service.js';
import {
    ResponseHandler,
    HttpStatus,
    ErrorCode
} from '../../utils/response.util.js';
import { asyncHandler } from '../../middlewares/error.middleware.js';
import { getPagination } from '../../utils/pagination.util.js';
import * as orderSchema from './order.schemas.js';
import type { OrderFilters } from './order.schemas.js';

export const list = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId;
        if (!organizationId) {
            return ResponseHandler.error(
                res,
                'No active organization',
                ErrorCode.VALIDATION_ERROR,
                HttpStatus.BAD_REQUEST
            );
        }

        const { skip, take, page, limit } = getPagination(
            {
                page: req.query.page as string,
                limit: req.query.limit as string
            },
            20
        );

        const filters: OrderFilters = {
            search: req.query.search as string | undefined,
            status: req.query.status as OrderFilters['status'],
            paymentStatus: req.query
                .paymentStatus as OrderFilters['paymentStatus'],
            shippingStatus: req.query
                .shippingStatus as OrderFilters['shippingStatus'],
            customerId: req.query.customerId as string | undefined,
            sortBy: (req.query.sortBy as OrderFilters['sortBy']) || 'createdAt',
            sortOrder:
                (req.query.sortOrder as OrderFilters['sortOrder']) || 'desc'
        };

        const { orders, total } = await orderService.getAllOrders(
            organizationId,
            take,
            skip,
            filters
        );

        return ResponseHandler.paginated(
            res,
            orders,
            'Orders fetched successfully',
            page,
            limit,
            total,
            req.url
        );
    }
);

export const create = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId;
        if (!organizationId) {
            return ResponseHandler.error(
                res,
                'No active organization',
                ErrorCode.VALIDATION_ERROR,
                HttpStatus.BAD_REQUEST
            );
        }

        const data = orderSchema.createOrder.parse(req.body);
        const order = await orderService.createOrder(data, organizationId);

        return ResponseHandler.created(
            res,
            'Order created successfully',
            order
        );
    }
);

export const get = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId;
        if (!organizationId) {
            return ResponseHandler.error(
                res,
                'No active organization',
                ErrorCode.VALIDATION_ERROR,
                HttpStatus.BAD_REQUEST
            );
        }

        const order = await orderService.getOrderDetails(
            req.params.id as string,
            organizationId
        );

        if (!order) {
            return ResponseHandler.error(
                res,
                'Order not found',
                ErrorCode.RESOURCE_NOT_FOUND,
                HttpStatus.NOT_FOUND
            );
        }

        return ResponseHandler.success(
            res,
            'Order fetched successfully',
            HttpStatus.OK,
            order
        );
    }
);

export const update = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId;
        if (!organizationId) {
            return ResponseHandler.error(
                res,
                'No active organization',
                ErrorCode.VALIDATION_ERROR,
                HttpStatus.BAD_REQUEST
            );
        }

        const orderId = req.params.id as string;
        const existing = await orderService.getOrderDetails(
            orderId,
            organizationId
        );

        if (!existing) {
            return ResponseHandler.error(
                res,
                'Order not found',
                ErrorCode.RESOURCE_NOT_FOUND,
                HttpStatus.NOT_FOUND
            );
        }

        const data = orderSchema.updateOrder.parse(req.body);
        const order = await orderService.updateOrder(
            orderId,
            data,
            organizationId
        );

        return ResponseHandler.success(
            res,
            'Order updated successfully',
            HttpStatus.OK,
            order
        );
    }
);

export const remove = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId;
        if (!organizationId) {
            return ResponseHandler.error(
                res,
                'No active organization',
                ErrorCode.VALIDATION_ERROR,
                HttpStatus.BAD_REQUEST
            );
        }

        const orderId = req.params.id as string;
        const existing = await orderService.getOrderDetails(
            orderId,
            organizationId
        );

        if (!existing) {
            return ResponseHandler.error(
                res,
                'Order not found',
                ErrorCode.RESOURCE_NOT_FOUND,
                HttpStatus.NOT_FOUND
            );
        }

        await orderService.deleteOrder(orderId, organizationId);

        return ResponseHandler.success(
            res,
            'Order deleted successfully',
            HttpStatus.NO_CONTENT,
            null
        );
    }
);
