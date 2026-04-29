import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import * as subscriptionService from '../api/subscriptions/subscriptions.service.js';
import logger from '../utils/logger.util.js';

export function requireActiveSubscription() {
    return async (req: Request, res: Response, next: NextFunction) => {
        const authReq = req as AuthenticatedRequest;
        const organizationId = authReq.session?.activeOrganizationId;

        if (!organizationId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required',
                code: 'AUTH_002'
            });
        }

        try {
            const subscription = await subscriptionService.getCurrentSubscription(organizationId);
            const isActive = subscriptionService.isSubscriptionActive(subscription);

            if (!isActive) {
                logger.info({ organizationId }, 'Inactive subscription blocked access');
                return res.status(402).json({
                    success: false,
                    message: 'Active subscription required',
                    code: 'SRV_005',
                    data: {
                        subscription: subscription ? {
                            status: subscription.status,
                            plan: subscription.plan.name
                        } : null
                    }
                });
            }

            (req as AuthenticatedRequest & { subscription?: typeof subscription }).subscription = subscription;
            next();
        } catch (error) {
            logger.error({ error, organizationId }, 'Error checking subscription');
            return res.status(500).json({
                success: false,
                message: 'Error verifying subscription',
                code: 'SRV_001'
            });
        }
    };
}