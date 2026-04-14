import { Router } from 'express';
import * as notificationController from './notification.controller.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import { requirePermission } from '../../middlewares/auth.middleware.js';
import { notificationQuery, markAllRead } from './notification.schemas.js';

const router = Router();

router.get(
    '/',
    requirePermission('notifications:read'),
    validateRequest(notificationQuery, 'query'),
    notificationController.listNotifications
);

router.get(
    '/unread-count',
    requirePermission('notifications:read'),
    notificationController.getUnreadCount
);

router.get(
    '/:id',
    requirePermission('notifications:read'),
    notificationController.getNotification
);

router.patch(
    '/:id/read',
    requirePermission('notifications:write'),
    notificationController.markNotificationAsRead
);

router.post(
    '/mark-all-read',
    requirePermission('notifications:write'),
    validateRequest(markAllRead),
    notificationController.markAllNotificationsAsRead
);

router.delete(
    '/:id',
    requirePermission('notifications:delete'),
    notificationController.deleteNotification
);

export default router;
