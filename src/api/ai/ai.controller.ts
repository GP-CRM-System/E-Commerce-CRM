/**
 * AI Intelligence Controller — HTTP request handlers.
 */
import type { Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware.js';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import { getPagination } from '../../utils/pagination.util.js';
import {
    HttpStatus,
    ResponseHandler,
    AuthorizationError,
    BadRequestError,
    ErrorCode
} from '../../utils/response.util.js';
import * as aiService from './ai.service.js';

/**
 * POST /api/ai/churn
 * Trigger churn prediction computation for the active organization.
 */
export const computeChurn = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const orgId = req.session.activeOrganizationId;
        if (!orgId)
            throw new AuthorizationError('No active organization selected');

        const result = await aiService.computeChurnForOrganization(orgId);

        ResponseHandler.success(
            res,
            `Churn prediction completed for ${result.totalCustomers} customers`,
            HttpStatus.OK,
            {
                totalCustomers: result.totalCustomers,
                results: result.results
            },
            req.url
        );
    }
);

/**
 * GET /api/ai/churn
 * Get churn prediction results (paginated, filterable by risk level).
 */
export const getChurnResults = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const orgId = req.session.activeOrganizationId;
        if (!orgId)
            throw new AuthorizationError('No active organization selected');

        const { skip, take, page, limit } = getPagination({
            page: req.query.page as string,
            limit: req.query.limit as string
        });

        const riskLevel = req.query.riskLevel as
            | 'stable'
            | 'low'
            | 'high'
            | undefined;

        const result = await aiService.getChurnResults(
            orgId,
            skip,
            take,
            riskLevel
        );

        ResponseHandler.paginated(
            res,
            result.customers,
            'Churn results fetched successfully',
            page,
            limit,
            result.total,
            req.url
        );
    }
);

/**
 * POST /api/ai/segment
 * Trigger segmentation computation for the active organization.
 */
export const computeSegments = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const orgId = req.session.activeOrganizationId;
        if (!orgId)
            throw new AuthorizationError('No active organization selected');

        const result = await aiService.computeSegmentsForOrganization(orgId);

        ResponseHandler.success(
            res,
            `Segmentation completed for ${result.totalCustomers} customers`,
            HttpStatus.OK,
            {
                totalCustomers: result.totalCustomers,
                distribution: result.distribution,
                results: result.results
            },
            req.url
        );
    }
);

/**
 * GET /api/ai/segment
 * Get segmentation distribution summary.
 */
export const getSegmentResults = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const orgId = req.session.activeOrganizationId;
        if (!orgId)
            throw new AuthorizationError('No active organization selected');

        // Re-compute or fetch from cache — for now, re-compute on read
        const result = await aiService.computeSegmentsForOrganization(orgId);

        ResponseHandler.success(
            res,
            'Segmentation results fetched successfully',
            HttpStatus.OK,
            {
                totalCustomers: result.totalCustomers,
                distribution: result.distribution
            },
            req.url
        );
    }
);

/**
 * POST /api/ai/recommend
 * Trigger product recommendation computation.
 */
export const computeRecommendations = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const orgId = req.session.activeOrganizationId;
        if (!orgId)
            throw new AuthorizationError('No active organization selected');

        const result =
            await aiService.computeRecommendationsForOrganization(orgId);

        ResponseHandler.success(
            res,
            `Recommendations computed for ${result.totalItems} products`,
            HttpStatus.OK,
            result,
            req.url
        );
    }
);

/**
 * GET /api/ai/recommend/:productId
 * Get recommendations for a specific product.
 */
export const getProductRecommendations = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const productId = req.params.productId as string;
        if (!productId) throw new BadRequestError('Product ID is required');

        const result = await aiService.getRecommendationsForProduct(productId);

        if (!result) {
            ResponseHandler.error(
                res,
                'No recommendations found for this product',
                ErrorCode.RESOURCE_NOT_FOUND,
                HttpStatus.NOT_FOUND,
                req.url
            );
            return;
        }

        ResponseHandler.success(
            res,
            'Product recommendations fetched successfully',
            HttpStatus.OK,
            result,
            req.url
        );
    }
);

/**
 * GET /api/ai/health
 * Check AI engine health status.
 */
export const getAiHealth = asyncHandler(
    async (_req: AuthenticatedRequest, res: Response) => {
        const health = await aiService.getAiHealth();

        ResponseHandler.success(
            res,
            health.churnModel.available
                ? 'All AI engines available'
                : 'Some AI engines unavailable',
            HttpStatus.OK,
            health,
            '/ai/health'
        );
    }
);
