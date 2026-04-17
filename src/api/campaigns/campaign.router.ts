import { Router } from 'express';
import { requirePermission } from '../../middlewares/auth.middleware.js';
import * as campaignController from './campaign.controller.js';
import * as campaignSchema from './campaign.schemas.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';

const router = Router();

router
    .route('/')
    .get(
        requirePermission('campaigns:read'),
        validateRequest(campaignSchema.campaignQuery, 'query'),
        campaignController.list
    )
    .post(
        requirePermission('campaigns:write'),
        validateRequest(campaignSchema.createCampaign, 'body'),
        campaignController.create
    );

router
    .route('/:id')
    .get(
        requirePermission('campaigns:read'),
        validateRequest(campaignSchema.campaignId, 'params'),
        campaignController.get
    )
    .patch(
        requirePermission('campaigns:write'),
        validateRequest(campaignSchema.campaignId, 'params'),
        validateRequest(campaignSchema.updateCampaign, 'body'),
        campaignController.update
    )
    .delete(
        requirePermission('campaigns:delete'),
        validateRequest(campaignSchema.campaignId, 'params'),
        campaignController.remove
    );

router
    .route('/:id/send')
    .post(
        requirePermission('campaigns:write'),
        validateRequest(campaignSchema.campaignId, 'params'),
        validateRequest(campaignSchema.sendCampaign, 'body'),
        campaignController.send
    );

router
    .route('/:id/stats')
    .get(
        requirePermission('campaigns:read'),
        validateRequest(campaignSchema.campaignId, 'params'),
        campaignController.getStats
    );

export default router;
