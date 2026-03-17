import type { Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware.js';
import { getPagination } from '../../utils/pagination.util.js';
import * as customerService from './customer.service.js';
import {
    HttpStatus,
    ResponseHandler,
    AuthorizationError
} from '../../utils/response.util.js';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';

export const getAllCustomers = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const { skip, take } = getPagination({
            page: req.query.page as string,
            limit: req.query.limit as string
        });

        const orgId = req.session.activeOrganizationId;

        if (!orgId) {
            throw new AuthorizationError('No active organization selected');
        }

        const response = await customerService.getAllCustomers(
            orgId,
            take,
            skip
        );

        if (!response) {
            throw new Error('Failed to fetch customers');
        }

        ResponseHandler.success(
            res,
            'Customers fetched successfully',
            HttpStatus.OK,
            response,
            req.url
        );
    }
);

export const createCustomer = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {

    const { activeOrganizationId, userId } = req.session;

    if (!activeOrganizationId || !userId) {
        throw new AuthorizationError('No active organization selected');
    }

    const response = await customerService.createCustomer(req.body, activeOrganizationId);

    if (!response) {
        throw new Error('Failed to create customer');
    }

    ResponseHandler.success(
        res,
        'Customer created successfully',
        HttpStatus.CREATED,
        response,
        req.url
    );
})

export const getCustomer = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { activeOrganizationId } = req.session;

    const id = req.params.id as string;

    if (!id) {
        throw new Error('Customer ID is required');
    }

    if (!activeOrganizationId) {
        throw new AuthorizationError('No active organization selected');
    }

    const response = await customerService.getCustomerDetails(id, activeOrganizationId);

    if (!response) {
        throw new Error('Failed to fetch customer');
    }

    ResponseHandler.success(
        res,
        'Customer fetched successfully',
        HttpStatus.OK,
        response,
        req.url
    );
});

export const updateCustomer = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { activeOrganizationId } = req.session;

    const id = req.params.id as string;

    if (!id) {
        throw new Error('Customer ID is required');
    }

    if (!activeOrganizationId) {
        throw new AuthorizationError('No active organization selected');
    }

    const response = await customerService.updateCustomer(id, req.body, activeOrganizationId);

    if (!response) {
        throw new Error('Failed to update customer');
    }

    ResponseHandler.success(
        res,
        'Customer updated successfully',
        HttpStatus.OK,
        response,
        req.url
    );
});

export const deleteCustomer = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { activeOrganizationId } = req.session;

    const id = req.params.id as string;

    if (!id) {
        throw new Error('Customer ID is required');
    }

    if (!activeOrganizationId) {
        throw new AuthorizationError('No active organization selected');
    }

    const response = await customerService.deleteCustomer(id, activeOrganizationId);

    if (!response) {
        throw new Error('Failed to delete customer');
    }

    ResponseHandler.success(
        res,
        'Customer deleted successfully',
        HttpStatus.OK,
        response,
        req.url
    );
});