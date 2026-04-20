import { z } from 'zod';

export const createTicketSchema = z.object({
    customerId: z.string().min(1, 'Customer ID is required'),
    orderId: z.string().optional(),
    subject: z.string().min(1, 'Subject is required'),
    description: z.string().min(1, 'Description is required'),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional()
});

export const updateTicketSchema = z.object({
    status: z
        .enum(['OPEN', 'IN_PROGRESS', 'PENDING', 'RESOLVED', 'CLOSED'])
        .optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
    assignedToId: z.string().optional()
});

export const addNoteSchema = z.object({
    content: z.string().min(1, 'Note content is required'),
    isInternal: z.boolean().optional()
});

export const ticketFilterSchema = z.object({
    status: z
        .enum(['OPEN', 'IN_PROGRESS', 'PENDING', 'RESOLVED', 'CLOSED'])
        .optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
    assignedToId: z.string().optional()
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
export type AddNoteInput = z.infer<typeof addNoteSchema>;
export type TicketFilterInput = z.infer<typeof ticketFilterSchema>;
