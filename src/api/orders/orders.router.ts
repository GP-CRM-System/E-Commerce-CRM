import { Router } from 'express';
import { requirePermission } from '../../middlewares/auth.middleware.js';
import * as orderController from './order.controller.js';
import * as orderSchema from './order.schemas.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import { paginationSchema } from '../../utils/pagination.util.js';

const router = Router();

router
    .route('/')
    .get(
        requirePermission('orders:read'),
        validateRequest(paginationSchema, 'query'),
        validateRequest(orderSchema.orderFilters, 'query'),
        orderController.list
    )
    .post(
        requirePermission('orders:write'),
        validateRequest(orderSchema.createOrder),
        orderController.create
    );

router
    .route('/:id')
    .get(requirePermission('orders:read'), orderController.get)
    .put(
        requirePermission('orders:write'),
        validateRequest(orderSchema.updateOrder),
        orderController.update
    )
    .delete(requirePermission('orders:delete'), orderController.remove);

router
    .route('/:id/invoice')
    .get(requirePermission('orders:read'), orderController.getInvoice);

export default router;
