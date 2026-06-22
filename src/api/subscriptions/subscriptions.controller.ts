import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import * as subscriptionService from './subscriptions.service.js';
import { ResponseHandler, HttpStatus } from '../../utils/response.util.js';
import { asyncHandler } from '../../middlewares/error.middleware.js';

export const listPlans = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const includeInactive = req.query.includeInactive === 'true';
        const plans = await subscriptionService.listPlans(includeInactive);

        ResponseHandler.success(
            res,
            'Plans fetched successfully',
            HttpStatus.OK,
            plans.map((p) => ({
                id: p.id,
                name: p.name,
                displayName: p.displayName,
                price: Number(p.price),
                billingCycle: p.billingCycle,
                features: p.features,
                isActive: p.isActive
            })),
            req.url
        );
    }
);

export const getCurrentSubscription = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const { subscription, usage } =
            await subscriptionService.getCurrentSubscription(organizationId);

        ResponseHandler.success(
            res,
            'Subscription fetched successfully',
            HttpStatus.OK,
            { subscription, usage },
            req.url
        );
    }
);

export const subscribe = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const { planId, billingCycle } = req.body;

        const result = await subscriptionService.subscribeOrganization(
            organizationId,
            planId,
            billingCycle
        );

        ResponseHandler.success(
            res,
            result.paymentRequired
                ? 'Payment required to activate subscription'
                : 'Subscription activated',
            result.paymentRequired
                ? HttpStatus.PAYMENT_REQUIRED
                : HttpStatus.OK,
            result,
            req.url
        );
    }
);

export const cancel = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const { immediately } = req.body;

        const subscription = await subscriptionService.cancelSubscription(
            organizationId,
            immediately
        );

        ResponseHandler.success(
            res,
            'Subscription canceled',
            HttpStatus.OK,
            subscription,
            req.url
        );
    }
);

export const listInvoices = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;

        const result = await subscriptionService.listInvoices(
            organizationId,
            page,
            limit
        );

        ResponseHandler.success(
            res,
            'Invoices fetched successfully',
            HttpStatus.OK,
            result,
            req.url
        );
    }
);
