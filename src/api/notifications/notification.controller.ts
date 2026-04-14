import type { Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware.js';
import { ResponseHandler, ErrorCode } from '../../utils/response.util.js';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import * as notificationService from './notification.service.js';
import type { NotificationQueryInput } from './notification.schemas.js';

export const listNotifications = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const userId = req.session.userId!;
        const { limit, offset, read, type } =
            req.query as unknown as NotificationQueryInput;

        const { notifications, total, unreadCount } =
            await notificationService.getNotifications(organizationId, {
                take: limit,
                skip: offset,
                read,
                type,
                userId
            });

        const page = limit > 0 ? Math.floor(offset / limit) + 1 : 1;

        ResponseHandler.success(
            res,
            'Notifications fetched successfully',
            200,
            {
                data: notifications,
                pagination: { page, limit, total, unreadCount }
            },
            req.url
        );
    }
);

export const getNotification = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const notificationId = req.params.id as string;

        const notification = await notificationService.getNotificationById(
            notificationId,
            organizationId
        );

        if (!notification) {
            ResponseHandler.error(
                res,
                'Notification not found',
                ErrorCode.RESOURCE_NOT_FOUND,
                404,
                req.url
            );
            return;
        }

        ResponseHandler.success(
            res,
            'Notification fetched successfully',
            200,
            notification,
            req.url
        );
    }
);

export const markNotificationAsRead = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const userId = req.session.userId!;
        const notificationId = req.params.id as string;

        const notification = await notificationService.markAsRead(
            notificationId,
            organizationId,
            userId
        );

        if (!notification) {
            ResponseHandler.error(
                res,
                'Notification not found',
                ErrorCode.RESOURCE_NOT_FOUND,
                404,
                req.url
            );
            return;
        }

        ResponseHandler.success(
            res,
            'Notification marked as read',
            200,
            notification,
            req.url
        );
    }
);

export const markAllNotificationsAsRead = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const userId = req.session.userId!;

        const result = await notificationService.markAllAsRead(
            organizationId,
            userId
        );

        ResponseHandler.success(
            res,
            'All notifications marked as read',
            200,
            { count: result.count },
            req.url
        );
    }
);

export const deleteNotification = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const userId = req.session.userId!;
        const notificationId = req.params.id as string;

        const notification = await notificationService.deleteNotification(
            notificationId,
            organizationId,
            userId
        );

        if (!notification) {
            ResponseHandler.error(
                res,
                'Notification not found',
                ErrorCode.RESOURCE_NOT_FOUND,
                404,
                req.url
            );
            return;
        }

        ResponseHandler.success(
            res,
            'Notification deleted successfully',
            204,
            null,
            req.url
        );
    }
);

export const getUnreadCount = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const userId = req.session.userId!;

        const { unreadCount } = await notificationService.getNotifications(
            organizationId,
            {
                take: 0,
                skip: 0,
                read: false,
                userId
            }
        );

        ResponseHandler.success(
            res,
            'Unread count fetched successfully',
            200,
            { unreadCount },
            req.url
        );
    }
);
