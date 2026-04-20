import { Router } from 'express';
import { requirePermission } from '../../middlewares/auth.middleware.js';
import * as ticketController from './ticket.controller.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import { paginationSchema } from '../../utils/pagination.util.js';
import {
    createTicketSchema,
    updateTicketSchema,
    addNoteSchema
} from './ticket.schemas.js';

const router = Router();

router
    .route('/')
    .get(
        requirePermission('supportTickets:read'),
        validateRequest(paginationSchema, 'query'),
        ticketController.list
    )
    .post(
        requirePermission('supportTickets:write'),
        validateRequest(createTicketSchema),
        ticketController.create
    );

router
    .route('/:id')
    .get(requirePermission('supportTickets:read'), ticketController.get)
    .patch(
        requirePermission('supportTickets:write'),
        validateRequest(updateTicketSchema),
        ticketController.update
    );

router
    .route('/:id/notes')
    .post(
        requirePermission('supportTickets:write'),
        validateRequest(addNoteSchema),
        ticketController.addNote
    );

export default router;
