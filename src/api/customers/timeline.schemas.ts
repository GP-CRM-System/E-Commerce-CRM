import { z } from 'zod';

export const getTimelineSchema = z.object({
    limit: z.string().optional().default('50'),
    cursor: z.string().optional()
});

export type GetTimelineInput = z.infer<typeof getTimelineSchema>;
