import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import * as productService from './product.service.js';
import {
    ResponseHandler,
    HttpStatus,
    ErrorCode
} from '../../utils/response.util.js';
import { asyncHandler } from '../../middlewares/error.middleware.js';
import { getPagination } from '../../utils/pagination.util.js';
import * as productSchema from './product.schemas.js';

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

        const { products, total } = await productService.getAllProducts(
            organizationId,
            take,
            skip
        );

        return ResponseHandler.paginated(
            res,
            products,
            'Products fetched successfully',
            page,
            limit,
            total
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

        const data = productSchema.createProduct.parse(req.body);
        const product = await productService.createProduct(
            data,
            organizationId
        );

        return ResponseHandler.created(
            res,
            'Product created successfully',
            product
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

        const product = await productService.getProductDetails(
            req.params.id as string,
            organizationId
        );

        if (!product) {
            return ResponseHandler.error(
                res,
                'Product not found',
                ErrorCode.RESOURCE_NOT_FOUND,
                HttpStatus.NOT_FOUND
            );
        }

        return ResponseHandler.success(
            res,
            'Product fetched successfully',
            HttpStatus.OK,
            product
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

        const data = productSchema.updateProduct.parse(req.body);
        const product = await productService.updateProduct(
            req.params.id as string,
            data,
            organizationId
        );

        return ResponseHandler.success(
            res,
            'Product updated successfully',
            HttpStatus.OK,
            product
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

        const product = await productService.deleteProduct(
            req.params.id as string,
            organizationId
        );

        return ResponseHandler.success(
            res,
            'Product deleted successfully',
            HttpStatus.OK,
            product
        );
    }
);

export const createVariant = asyncHandler(
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

        const product = await productService.getProductDetails(
            req.params.id as string,
            organizationId
        );

        if (!product) {
            return ResponseHandler.error(
                res,
                'Product not found',
                ErrorCode.RESOURCE_NOT_FOUND,
                HttpStatus.NOT_FOUND
            );
        }

        const data = productSchema.createProductVariant.parse(req.body);
        const variant = await productService.createVariant(
            req.params.id as string,
            data
        );

        return ResponseHandler.created(
            res,
            'Variant created successfully',
            variant
        );
    }
);

export const updateVariant = asyncHandler(
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

        const data = productSchema.updateProductVariant.parse(req.body);
        const variant = await productService.updateVariant(
            req.params.variantId as string,
            req.params.id as string,
            data
        );

        return ResponseHandler.success(
            res,
            'Variant updated successfully',
            HttpStatus.OK,
            variant
        );
    }
);

export const deleteVariant = asyncHandler(
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

        const variant = await productService.deleteVariant(
            req.params.variantId as string,
            req.params.id as string
        );

        return ResponseHandler.success(
            res,
            'Variant deleted successfully',
            HttpStatus.OK,
            variant
        );
    }
);
