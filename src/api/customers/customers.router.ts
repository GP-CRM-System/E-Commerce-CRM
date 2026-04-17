import { Router } from 'express';
import { requirePermission } from '../../middlewares/auth.middleware.js';
import * as customerController from './customer.controller.js';
import * as analyticsController from './analytics.controller.js';
import * as timelineController from './timeline.controller.js';
import * as customerSchema from './customer.schemas.js';
import { getTimelineSchema } from './timeline.schemas.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import { paginationSchema } from '../../utils/pagination.util.js';

const router = Router();

router
    .route('/')
    .get(
        requirePermission('customers:read'),
        validateRequest(paginationSchema, 'query'),
        validateRequest(customerSchema.customerFilters, 'query'),
        customerController.getAllCustomers
    )
    .post(
        requirePermission('customers:write'),
        validateRequest(customerSchema.createCustomer),
        customerController.createCustomer
    );

router
    .route('/analytics/compute')
    .post(
        requirePermission('customers:write'),
        analyticsController.triggerRFMCompute
    );

router
    .route('/analytics/rfm')
    .get(requirePermission('customers:read'), analyticsController.getRFMStats);

router
    .route('/:id')
    .get(requirePermission('customers:read'), customerController.getCustomer)
    .put(
        requirePermission('customers:write'),
        validateRequest(customerSchema.updateCustomer),
        customerController.updateCustomer
    )
    .delete(
        requirePermission('customers:delete'),
        customerController.deleteCustomer
    );

router
    .route('/:id/analytics')
    .get(
        requirePermission('customers:read'),
        analyticsController.getCustomerRFM
    );

router
    .route('/:id/timeline')
    .get(
        requirePermission('customers:read'),
        validateRequest(getTimelineSchema, 'query'),
        timelineController.getTimeline
    );

router
    .route('/:id/notes')
    .get(
        requirePermission('customers:read'),
        customerController.getCustomerNotes
    )
    .post(
        requirePermission('customers:write'),
        validateRequest(customerSchema.createNote),
        customerController.createNote
    );

router
    .route('/:id/notes/:noteId')
    .put(
        requirePermission('customers:write'),
        validateRequest(customerSchema.updateNote),
        customerController.updateNote
    )
    .delete(
        requirePermission('customers:write'),
        customerController.deleteNote
    );

router
    .route('/:id/events')
    .get(
        requirePermission('customers:read'),
        customerController.getCustomerEvents
    )
    .post(
        requirePermission('customers:write'),
        validateRequest(customerSchema.createEvent),
        customerController.createEvent
    );

router
    .route('/:id/events/:eventId')
    .put(
        requirePermission('customers:write'),
        validateRequest(customerSchema.updateEvent),
        customerController.updateEvent
    )
    .delete(
        requirePermission('customers:write'),
        customerController.deleteEvent
    );

export default router;
