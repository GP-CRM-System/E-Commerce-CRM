import prisma from '../../config/prisma.config.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { NotificationType } from './notification.schemas.js';

export interface CreateNotificationInput {
    type: NotificationType;
    title: string;
    message: string;
    organizationId: string;
    userId?: string;
    actionUrl?: string;
    metadata?: Record<string, unknown>;
}

export async function createNotification(data: CreateNotificationInput) {
    return prisma.notification.create({
        data: {
            type: data.type,
            title: data.title,
            message: data.message,
            organizationId: data.organizationId,
            userId: data.userId,
            actionUrl: data.actionUrl,
            metadata: data.metadata as Prisma.InputJsonValue | undefined
        }
    });
}

export async function getNotifications(
    organizationId: string,
    options: {
        take: number;
        skip: number;
        read?: boolean;
        type?: NotificationType;
        userId?: string;
    }
) {
    const where: Prisma.NotificationWhereInput = {
        organizationId,
        ...(options.read !== undefined && { read: options.read }),
        ...(options.type && { type: options.type }),
        ...(options.userId && {
            OR: [{ userId: options.userId }, { userId: null }]
        })
    };

    const [notifications, total, unreadCount] = await Promise.all([
        prisma.notification.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: options.take,
            skip: options.skip
        }),
        prisma.notification.count({ where }),
        prisma.notification.count({
            where: {
                organizationId,
                read: false,
                ...(options.userId && {
                    OR: [{ userId: options.userId }, { userId: null }]
                })
            }
        })
    ]);

    return { notifications, total, unreadCount };
}

export async function getNotificationById(id: string, organizationId: string) {
    return prisma.notification.findFirst({
        where: { id, organizationId }
    });
}

export async function markAsRead(
    id: string,
    organizationId: string,
    userId?: string
) {
    const notification = await prisma.notification.findFirst({
        where: {
            id,
            organizationId,
            ...(userId && { OR: [{ userId }, { userId: null }] })
        }
    });

    if (!notification) {
        return null;
    }

    return prisma.notification.update({
        where: { id },
        data: { read: true }
    });
}

export async function markAllAsRead(organizationId: string, userId?: string) {
    return prisma.notification.updateMany({
        where: {
            organizationId,
            read: false,
            ...(userId && { OR: [{ userId }, { userId: null }] })
        },
        data: { read: true }
    });
}

export async function deleteNotification(
    id: string,
    organizationId: string,
    userId?: string
) {
    const notification = await prisma.notification.findFirst({
        where: {
            id,
            organizationId,
            ...(userId && { OR: [{ userId }, { userId: null }] })
        }
    });

    if (!notification) {
        return null;
    }

    return prisma.notification.delete({
        where: { id }
    });
}

export async function createImportNotification(data: {
    organizationId: string;
    userId?: string;
    jobId: string;
    fileName: string;
    status: 'completed' | 'failed' | 'partial';
    successCount: number;
    failureCount: number;
}) {
    const type =
        data.status === 'completed' ? 'import_completed' : 'import_failed';

    const title =
        data.status === 'completed'
            ? 'Import Completed'
            : data.status === 'partial'
              ? 'Import Completed with Errors'
              : 'Import Failed';

    const message =
        data.status === 'completed'
            ? `Successfully imported ${data.successCount} records from ${data.fileName}.`
            : `Import of ${data.fileName} finished with ${data.failureCount} errors and ${data.successCount} successful records.`;

    return createNotification({
        type,
        title,
        message,
        organizationId: data.organizationId,
        userId: data.userId,
        actionUrl: `/imports/${data.jobId}`,
        metadata: {
            jobId: data.jobId,
            successCount: data.successCount,
            failureCount: data.failureCount,
            fileName: data.fileName
        }
    });
}

export async function createChurnAlertNotification(data: {
    organizationId: string;
    customerId: string;
    customerName: string;
    riskLevel: 'low' | 'medium' | 'high';
}) {
    const riskLabel =
        data.riskLevel === 'high'
            ? 'High'
            : data.riskLevel === 'medium'
              ? 'Medium'
              : 'Low';

    return createNotification({
        type: 'churn_alert',
        title: `${riskLabel} Churn Risk Alert`,
        message: `Customer ${data.customerName} is at ${data.riskLevel} risk of churning.`,
        organizationId: data.organizationId,
        actionUrl: `/customers/${data.customerId}`,
        metadata: {
            customerId: data.customerId,
            riskLevel: data.riskLevel
        }
    });
}

export async function createLifecycleNotification(data: {
    organizationId: string;
    customerId: string;
    customerName: string;
    previousStage: string;
    newStage: string;
}) {
    const isAlertStage =
        data.newStage === 'AT_RISK' || data.newStage === 'CHURNED';

    if (!isAlertStage) {
        return null;
    }

    return createNotification({
        type: 'lifecycle_change',
        title:
            data.newStage === 'CHURNED'
                ? 'Customer Churned'
                : 'Customer At Risk',
        message: `Customer ${data.customerName} has moved from ${data.previousStage} to ${data.newStage}.`,
        organizationId: data.organizationId,
        actionUrl: `/customers/${data.customerId}`,
        metadata: {
            customerId: data.customerId,
            previousStage: data.previousStage,
            newStage: data.newStage
        }
    });
}

export async function createSyncNotification(data: {
    organizationId: string;
    integrationId: string;
    integrationName: string;
    status: 'completed' | 'failed';
    stats?: {
        created: number;
        updated: number;
        failed: number;
    };
}) {
    const type = data.status === 'completed' ? 'sync_completed' : 'sync_failed';

    const message =
        data.status === 'completed' && data.stats
            ? `Sync with ${data.integrationName} completed. Created: ${data.stats.created}, Updated: ${data.stats.updated}, Failed: ${data.stats.failed}.`
            : `Sync with ${data.integrationName} failed.`;

    return createNotification({
        type,
        title: data.status === 'completed' ? 'Sync Completed' : 'Sync Failed',
        message,
        organizationId: data.organizationId,
        actionUrl: `/integrations/${data.integrationId}`,
        metadata: {
            integrationId: data.integrationId,
            stats: data.stats
        }
    });
}
