import type { Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware.js';
import { getPagination } from '../../utils/pagination.util.js';
import * as customerService from './customer.service.js';
import type { CustomerFilters } from './customer.schemas.js';
import {
    HttpStatus,
    ResponseHandler,
    AuthorizationError,
    BadRequestError,
    ErrorCode
} from '../../utils/response.util.js';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';

export const getAllCustomers = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { skip, take, page, limit } = getPagination({
            page: req.query.page as string,
            limit: req.query.limit as string
        });

        const orgId = req.session.activeOrganizationId;

        if (!orgId) {
            throw new AuthorizationError('No active organization selected');
        }

        const filters: CustomerFilters = {
            search: req.query.search as string | undefined,
            city: req.query.city as string | undefined,
            source: req.query.source as CustomerFilters['source'],
            lifecycleStage: req.query
                .lifecycleStage as CustomerFilters['lifecycleStage'],
            tagId: req.query.tagId as string | undefined,
            segmentId: req.query.segmentId as string | undefined,
            sortBy:
                (req.query.sortBy as CustomerFilters['sortBy']) || 'createdAt',
            sortOrder:
                (req.query.sortOrder as CustomerFilters['sortOrder']) || 'desc'
        };

        const response = await customerService.getAllCustomers(
            orgId,
            take,
            skip,
            filters
        );

        ResponseHandler.paginated(
            res,
            response.customers,
            'Customers fetched successfully',
            page,
            limit,
            response.total,
            req.url
        );
    }
);

export const createCustomer = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { activeOrganizationId } = req.session;
        const userId = req.user.id;

        if (!activeOrganizationId) {
            throw new AuthorizationError('No active organization selected');
        }

        const response = await customerService.createCustomer(
            req.body,
            activeOrganizationId,
            userId
        );

        if (!response) {
            throw new BadRequestError('Failed to create customer');
        }

        ResponseHandler.success(
            res,
            'Customer created successfully',
            HttpStatus.CREATED,
            response,
            req.url
        );
    }
);

export const getCustomer = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { activeOrganizationId } = req.session;

        const id = req.params.id as string;

        if (!id) {
            throw new BadRequestError('Customer ID is required');
        }

        if (!activeOrganizationId) {
            throw new AuthorizationError('No active organization selected');
        }

        const response = await customerService.getCustomerDetails(
            id,
            activeOrganizationId
        );

        if (!response) {
            ResponseHandler.error(
                res,
                'Customer not found',
                ErrorCode.RESOURCE_NOT_FOUND,
                HttpStatus.NOT_FOUND,
                req.url
            );
            return;
        }

        ResponseHandler.success(
            res,
            'Customer fetched successfully',
            HttpStatus.OK,
            response,
            req.url
        );
    }
);

export const updateCustomer = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { activeOrganizationId } = req.session;

        const id = req.params.id as string;

        if (!id) {
            throw new BadRequestError('Customer ID is required');
        }

        if (!activeOrganizationId) {
            throw new AuthorizationError('No active organization selected');
        }

        const userId = req.user.id;

        const response = await customerService.updateCustomer(
            id,
            req.body,
            activeOrganizationId,
            userId
        );

        if (!response) {
            ResponseHandler.error(
                res,
                'Customer not found',
                ErrorCode.RESOURCE_NOT_FOUND,
                HttpStatus.NOT_FOUND,
                req.url
            );
            return;
        }

        ResponseHandler.success(
            res,
            'Customer updated successfully',
            HttpStatus.OK,
            response,
            req.url
        );
    }
);

export const deleteCustomer = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { activeOrganizationId } = req.session;

        const id = req.params.id as string;

        if (!id) {
            throw new BadRequestError('Customer ID is required');
        }

        if (!activeOrganizationId) {
            throw new AuthorizationError('No active organization selected');
        }

        const userId = req.user.id;

        const response = await customerService.deleteCustomer(
            id,
            activeOrganizationId,
            userId
        );

        if (!response) {
            ResponseHandler.error(
                res,
                'Customer not found',
                ErrorCode.RESOURCE_NOT_FOUND,
                HttpStatus.NOT_FOUND,
                req.url
            );
            return;
        }

        ResponseHandler.success(
            res,
            'Customer deleted successfully',
            HttpStatus.OK,
            response,
            req.url
        );
    }
);

export const getCustomerNotes = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { activeOrganizationId } = req.session;

        const id = req.params.id as string;

        if (!id) {
            throw new BadRequestError('Customer ID is required');
        }

        if (!activeOrganizationId) {
            throw new AuthorizationError('No active organization selected');
        }

        const response = await customerService.getCustomerNotes(id);

        if (!response) {
            throw new BadRequestError('Failed to fetch customer notes');
        }

        ResponseHandler.success(
            res,
            'Customer notes fetched successfully',
            HttpStatus.OK,
            response,
            req.url
        );
    }
);

export const createNote = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { activeOrganizationId } = req.session;
        const userId = req.user.id;

        const id = req.params.id as string;

        if (!id) {
            throw new BadRequestError('Customer ID is required');
        }

        if (!activeOrganizationId) {
            throw new AuthorizationError('No active organization selected');
        }

        const response = await customerService.createNote(id, req.body, userId);

        if (!response) {
            throw new BadRequestError('Failed to create note');
        }

        ResponseHandler.success(
            res,
            'Note created successfully',
            HttpStatus.CREATED,
            response,
            req.url
        );
    }
);

export const updateNote = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { activeOrganizationId } = req.session;
        const userId = req.user.id;

        const id = req.params.id as string;
        const noteId = req.params.noteId as string;

        if (!id || !noteId) {
            throw new BadRequestError('Customer ID and Note ID are required');
        }

        if (!activeOrganizationId) {
            throw new AuthorizationError('No active organization selected');
        }

        const response = await customerService.updateNote(
            id,
            noteId,
            req.body,
            userId
        );

        if (!response) {
            throw new BadRequestError('Failed to update note');
        }

        ResponseHandler.success(
            res,
            'Note updated successfully',
            HttpStatus.OK,
            response,
            req.url
        );
    }
);

export const deleteNote = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { activeOrganizationId } = req.session;
        const userId = req.user.id;

        const id = req.params.id as string;
        const noteId = req.params.noteId as string;

        if (!id || !noteId) {
            throw new BadRequestError('Customer ID and Note ID are required');
        }

        if (!activeOrganizationId) {
            throw new AuthorizationError('No active organization selected');
        }

        const response = await customerService.deleteNote(id, noteId, userId);

        if (!response) {
            throw new BadRequestError('Failed to delete note');
        }

        ResponseHandler.success(
            res,
            'Note deleted successfully',
            HttpStatus.OK,
            response,
            req.url
        );
    }
);

export const getCustomerEvents = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { activeOrganizationId } = req.session;

        const customerId = req.params.id as string;
        if (!customerId || !activeOrganizationId) {
            throw new BadRequestError(
                'Customer ID and Organization ID are required'
            );
        }

        const response = await customerService.getCustomerEvents(customerId);

        if (!response) {
            throw new BadRequestError('Failed to fetch customer events');
        }

        ResponseHandler.success(
            res,
            'Customer events fetched successfully',
            HttpStatus.OK,
            response,
            req.url
        );
    }
);

export const createEvent = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { activeOrganizationId } = req.session;

        const customerId = req.params.id as string;

        if (!customerId || !activeOrganizationId) {
            throw new BadRequestError(
                'Customer ID and Organization ID are required'
            );
        }

        const response = await customerService.createEvent(
            customerId,
            req.body
        );

        if (!response) {
            throw new BadRequestError('Failed to create event');
        }

        ResponseHandler.success(
            res,
            'Event created successfully',
            HttpStatus.CREATED,
            response,
            req.url
        );
    }
);

export const updateEvent = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { activeOrganizationId } = req.session;

        const customerId = req.params.id as string;
        const eventId = req.params.eventId as string;

        if (!customerId || !eventId || !activeOrganizationId) {
            throw new BadRequestError(
                'Customer ID, Event ID and Organization ID are required'
            );
        }

        const response = await customerService.updateEvent(
            customerId,
            eventId,
            req.body
        );

        if (!response) {
            throw new BadRequestError('Failed to update event');
        }

        ResponseHandler.success(
            res,
            'Event updated successfully',
            HttpStatus.OK,
            response,
            req.url
        );
    }
);

export const deleteEvent = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { activeOrganizationId } = req.session;

        const customerId = req.params.id as string;
        const eventId = req.params.eventId as string;

        if (!customerId || !eventId || !activeOrganizationId) {
            throw new BadRequestError(
                'Customer ID, Event ID and Organization ID are required'
            );
        }

        const response = await customerService.deleteEvent(customerId, eventId);

        if (!response) {
            throw new BadRequestError('Failed to delete event');
        }

        ResponseHandler.success(
            res,
            'Event deleted successfully',
            HttpStatus.OK,
            response,
            req.url
        );
    }
);
