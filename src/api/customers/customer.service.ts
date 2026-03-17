import logger from '../../utils/logger.util.js';
import prisma from '../../config/prisma.config.js';
import { z } from "zod";
import * as customerSchema from './customer.schemas.js';

export async function getAllCustomers(
    organizationId: string,
    take: number,
    skip: number
) {
    try {
        const customers = await prisma.customer.findMany({
            where: {
                organizationId
            },
            orderBy: {
                createdAt: 'desc'
            },
            take,
            skip
        });

        return customers;
    } catch (error) {
        logger.error(`Error fetching customers: ${error}`);
        throw error;
    }
}

export async function createCustomer(
    data: z.infer<typeof customerSchema.createCustomer>,
    activeOrganizationId: string,

) {
    try {
        const customer = await prisma.customer.create({
            data: {
                ...data,
                organizationId: activeOrganizationId,
                createdAt: new Date(),
                updatedAt: new Date(),
            }
        });

        return customer;
    } catch (error) {
        logger.error(`Error creating customer: ${error}`);
        throw error;
    }
}

export async function getCustomerDetails(
    id: string,
    organizationId: string,
) {
    try {
        const customer = await prisma.customer.findUnique({
            where: {
                id,
                organizationId
            },
            include: {
                tags: true,
                notes: true,
                orders: true,
                supportTickets: true,
                customerEvents: true
            }
        });

        return customer;
    } catch (error) {
        logger.error(`Error fetching customer: ${error}`);
        throw error;
    }
}

export async function updateCustomer(
    id: string,
    data: z.infer<typeof customerSchema.updateCustomer>,
    organizationId: string,
) {
    try {
        const customer = await prisma.customer.update({
            where: {
                id,
                organizationId
            },
            data: {
                ...data,
                updatedAt: new Date(),
            }
        });

        return customer;
    } catch (error) {
        logger.error(`Error updating customer: ${error}`);
        throw error;
    }
}

export async function deleteCustomer(
    id: string,
    organizationId: string,
) {
    try {
        const customer = await prisma.customer.delete({
            where: {
                id,
                organizationId
            }
        });

        return customer;
    } catch (error) {
        logger.error(`Error deleting customer: ${error}`);
        throw error;
    }
};