import { Router } from 'express';
import { requirePermission } from '../../middlewares/auth.middleware.js';
import * as productController from './product.controller.js';
import * as productSchema from './product.schemas.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';

const router = Router();

router
    .route('/')
    .get(
        requirePermission('products:read'),
        validateRequest(productSchema.productFilters, 'query'),
        productController.list
    )
    .post(
        requirePermission('products:write'),
        validateRequest(productSchema.createProduct),
        productController.create
    );

router
    .route('/:id')
    .get(requirePermission('products:read'), productController.get)
    .patch(
        requirePermission('products:write'),
        validateRequest(productSchema.updateProduct),
        productController.update
    )
    .delete(requirePermission('products:delete'), productController.remove);

router.get(
    '/analytics/best-selling',
    requirePermission('products:read'),
    productController.getBestSelling
);

router.get(
    '/analytics/category-revenue',
    requirePermission('products:read'),
    productController.getCategoryRevenue
);

router.get(
    '/analytics/customer/:customerId/category-spend',
    requirePermission('products:read'),
    productController.getCustomerCategorySpend
);

router
    .route('/:id/variants')
    .post(
        requirePermission('products:write'),
        validateRequest(productSchema.createProductVariant),
        productController.createVariant
    );

router
    .route('/:id/variants/:variantId')
    .patch(
        requirePermission('products:write'),
        validateRequest(productSchema.updateProductVariant),
        productController.updateVariant
    )
    .delete(
        requirePermission('products:delete'),
        productController.deleteVariant
    );

export default router;
