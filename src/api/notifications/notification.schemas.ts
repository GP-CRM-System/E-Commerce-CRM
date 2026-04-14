import { z } from 'zod';

export const NOTIFICATION_TYPES = [
    'import_completed',
    'import_failed',
    'churn_alert',
    'sync_completed',
    'sync_failed',
    'lifecycle_change'
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const notificationQuery = z.object({
    read: z
        .union([z.boolean(), z.string()])
        .transform((v) => (typeof v === 'string' ? v === 'true' : v))
        .optional(),
    type: z.enum(NOTIFICATION_TYPES).optional(),
    limit: z
        .union([z.coerce.number(), z.string()])
        .transform((v) => {
            const num = typeof v === 'string' ? parseInt(v, 10) : v;
            return isNaN(num) ? 20 : Math.min(Math.max(num, 1), 100);
        })
        .default(20),
    offset: z
        .union([z.coerce.number(), z.string()])
        .transform((v) => {
            const num = typeof v === 'string' ? parseInt(v, 10) : v;
            return isNaN(num) ? 0 : Math.max(num, 0);
        })
        .default(0)
});

export const notificationId = z.object({
    id: z.string()
});

export const markAllRead = z.object({});

export type NotificationQueryInput = z.infer<typeof notificationQuery>;
export type NotificationIdInput = z.infer<typeof notificationId>;
export type MarkAllReadInput = z.infer<typeof markAllRead>;
