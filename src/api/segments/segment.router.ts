import { Router } from 'express';
import * as segmentController from './segment.controller.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import { requirePermission } from '../../middlewares/auth.middleware.js';
import {
    createSegmentSchema,
    updateSegmentSchema,
    listSegmentsSchema,
    listSegmentCustomersSchema
} from './segment.schemas.js';

const router = Router();

router.post(
    '/',
    requirePermission('segments:write'),
    validateRequest(createSegmentSchema),
    segmentController.createSegment
);

router.get(
    '/',
    requirePermission('segments:read'),
    validateRequest(listSegmentsSchema, 'query'),
    segmentController.listSegments
);

router.get(
    '/:id',
    requirePermission('segments:read'),
    segmentController.getSegment
);

router.patch(
    '/:id',
    requirePermission('segments:write'),
    validateRequest(updateSegmentSchema),
    segmentController.updateSegment
);

router.delete(
    '/:id',
    requirePermission('segments:delete'),
    segmentController.deleteSegment
);

router.get(
    '/:id/customers',
    requirePermission('segments:read'),
    validateRequest(listSegmentCustomersSchema, 'query'),
    segmentController.getSegmentCustomers
);

router.get(
    '/:id/count',
    requirePermission('segments:read'),
    segmentController.getSegmentCount
);

router.get(
    '/:id/preview',
    requirePermission('segments:read'),
    segmentController.previewSegment
);

router.post(
    '/:id/export',
    requirePermission('segments:read', 'exports:write'),
    segmentController.exportSegment
);

export default router;
