import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import * as ticketService from './ticket.service.js';
import {
    ResponseHandler,
    HttpStatus,
    ErrorCode
} from '../../utils/response.util.js';
import { asyncHandler } from '../../middlewares/error.middleware.js';
import { getPagination } from '../../utils/pagination.util.js';

import type {
    SupportTicketStatus,
    SupportTicketPriority
} from '../../generated/prisma/client.js';

export const create = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const ticket = await ticketService.createTicket({
            ...req.body,
            organizationId
        });

        return ResponseHandler.created(
            res,
            'Ticket created successfully',
            ticket
        );
    }
);

export const list = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const { skip, take, page, limit } = getPagination(
            {
                page: (req.query.page as string) || '1',
                limit: (req.query.limit as string) || '20'
            },
            20
        );

        const filters = {
            status: req.query.status as SupportTicketStatus,
            priority: req.query.priority as SupportTicketPriority,
            assignedToId: req.query.assignedToId as string
        };

        const { tickets, total } = await ticketService.listTickets(
            organizationId,
            filters,
            take,
            skip
        );

        return ResponseHandler.paginated(
            res,
            tickets,
            'Tickets fetched successfully',
            page,
            limit,
            total
        );
    }
);

export const get = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const ticket = await ticketService.getTicketDetails(
            req.params.id as string,
            organizationId
        );

        if (!ticket) {
            return ResponseHandler.error(
                res,
                'Ticket not found',
                ErrorCode.RESOURCE_NOT_FOUND,
                HttpStatus.NOT_FOUND
            );
        }

        return ResponseHandler.success(
            res,
            'Ticket fetched successfully',
            HttpStatus.OK,
            ticket
        );
    }
);

export const update = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const ticket = await ticketService.updateTicket(
            req.params.id as string,
            organizationId,
            req.body
        );

        return ResponseHandler.success(
            res,
            'Ticket updated successfully',
            HttpStatus.OK,
            ticket
        );
    }
);

export const addNote = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const userId = req.session.userId!;
        const note = await ticketService.addTicketNote({
            ticketId: req.params.id as string,
            authorId: userId,
            body: req.body.body,
            isInternal: req.body.isInternal
        });

        return ResponseHandler.created(res, 'Note added successfully', note);
    }
);
