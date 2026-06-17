import { z } from 'zod';

export const createTicketSchema = z.object({
    organizationId: z.string().min(1, 'Organization ID is required'),
    customerId: z.string().min(1, 'Customer ID is required'),
    orderId: z.string().optional(),
    subject: z.string().min(1, 'Subject is required'),
    description: z.string().min(1, 'Description is required'),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional()
});
