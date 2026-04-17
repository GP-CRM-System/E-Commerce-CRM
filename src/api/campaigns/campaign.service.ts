import { Queue } from 'bullmq';
import prisma from '../../config/prisma.config.js';
import {
    redisConnection,
    isRedisAvailable
} from '../../config/redis.config.js';
import {
    renderTemplate,
    type TemplateContext
} from '../templates/template.service.js';
import { buildPrismaWhere } from '../segments/segment.utils.js';
import type { Customer } from '../../generated/prisma/client.js';
import logger from '../../utils/logger.util.js';

export interface CampaignJobData {
    campaignId: string;
    recipientId: string;
    customerId: string;
    organizationId: string;
}

const campaignQueue: Queue<CampaignJobData> | null = isRedisAvailable
    ? new Queue('campaign-send-queue', { connection: redisConnection })
    : null;

export async function createCampaign(
    organizationId: string,
    data: {
        name: string;
        description?: string;
        type?: 'EMAIL' | 'SMS';
        segmentId?: string;
        templateId?: string;
        subject?: string;
        content?: { body?: string };
        scheduledAt?: Date;
    }
) {
    return prisma.campaign.create({
        data: {
            organizationId,
            name: data.name,
            description: data.description,
            type: data.type || 'EMAIL',
            segmentId: data.segmentId,
            templateId: data.templateId,
            subject: data.subject,
            content: data.content as object,
            scheduledAt: data.scheduledAt,
            status: 'DRAFT'
        }
    });
}

export async function getCampaign(id: string, organizationId: string) {
    return prisma.campaign.findFirst({
        where: { id, organizationId },
        include: {
            template: true,
            recipients: {
                take: 10,
                orderBy: { sentAt: 'desc' }
            }
        }
    });
}

export async function listCampaigns(
    organizationId: string,
    filters: { type?: string; status?: string },
    take: number,
    skip: number
) {
    const where: Record<string, unknown> = { organizationId };
    if (filters.type) where.type = filters.type;
    if (filters.status) where.status = filters.status;

    const [campaigns, total] = await Promise.all([
        prisma.campaign.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take,
            skip
        }),
        prisma.campaign.count({ where })
    ]);

    return { campaigns, total };
}

export async function updateCampaign(
    id: string,
    organizationId: string,
    data: {
        name?: string;
        description?: string;
        type?: 'EMAIL' | 'SMS';
        segmentId?: string | null;
        templateId?: string | null;
        subject?: string;
        content?: { body?: string };
        scheduledAt?: Date | null;
    }
) {
    const campaign = await prisma.campaign.findFirst({
        where: { id, organizationId }
    });

    if (!campaign) {
        throw new Error('Campaign not found');
    }

    if (campaign.status === 'SENT' || campaign.status === 'SENDING') {
        throw new Error(
            'Cannot update a campaign that has been or is being sent'
        );
    }

    return prisma.campaign.update({
        where: { id },
        data: {
            ...(data.name !== undefined && { name: data.name }),
            ...(data.description !== undefined && {
                description: data.description
            }),
            ...(data.type !== undefined && { type: data.type }),
            ...(data.segmentId !== undefined && { segmentId: data.segmentId }),
            ...(data.templateId !== undefined && {
                templateId: data.templateId
            }),
            ...(data.subject !== undefined && { subject: data.subject }),
            ...(data.content !== undefined && {
                content: data.content as object
            }),
            ...(data.scheduledAt !== undefined && {
                scheduledAt: data.scheduledAt
            })
        }
    });
}

export async function deleteCampaign(id: string, organizationId: string) {
    const campaign = await prisma.campaign.findFirst({
        where: { id, organizationId }
    });

    if (!campaign) {
        throw new Error('Campaign not found');
    }

    if (campaign.status === 'SENDING') {
        throw new Error('Cannot delete a campaign that is currently sending');
    }

    return prisma.campaign.delete({ where: { id } });
}

export async function resolveRecipients(campaignId: string): Promise<string[]> {
    const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId }
    });

    if (!campaign) {
        throw new Error('Campaign not found');
    }

    if (!campaign.segmentId) {
        const customers = await prisma.customer.findMany({
            where: {
                organizationId: campaign.organizationId,
                acceptsMarketing: true
            },
            select: { id: true }
        });
        return customers.map((c) => c.id);
    }

    const segment = await prisma.segment.findUnique({
        where: { id: campaign.segmentId }
    });

    if (!segment) {
        throw new Error('Segment not found');
    }

    const filterConfig =
        typeof segment.filter === 'object' ? segment.filter : null;
    if (!filterConfig) {
        const customers = await prisma.customer.findMany({
            where: {
                organizationId: campaign.organizationId,
                acceptsMarketing: true
            },
            select: { id: true }
        });
        return customers.map((c) => c.id);
    }

    const whereClause = buildPrismaWhere(filterConfig);
    whereClause.organizationId = campaign.organizationId;
    whereClause.acceptsMarketing = true;

    const customers = await prisma.customer.findMany({
        where: whereClause,
        select: { id: true }
    });

    return customers.map((c) => c.id);
}

export async function sendCampaign(
    campaignId: string,
    organizationId: string,
    sendNow: boolean = true
) {
    const campaign = await prisma.campaign.findFirst({
        where: { id: campaignId, organizationId }
    });

    if (!campaign) {
        throw new Error('Campaign not found');
    }

    if (campaign.status === 'SENT' || campaign.status === 'SENDING') {
        throw new Error('Campaign has already been sent');
    }

    const recipientIds = await resolveRecipients(campaignId);

    if (recipientIds.length === 0) {
        throw new Error('No recipients found for this campaign');
    }

    await prisma.campaignRecipient.deleteMany({
        where: { campaignId }
    });

    const recipientRecords = await prisma.campaignRecipient.createMany({
        data: recipientIds.map((customerId) => ({
            campaignId,
            customerId,
            status: 'PENDING'
        }))
    });

    await prisma.campaign.update({
        where: { id: campaignId },
        data: {
            status: sendNow ? 'SENDING' : 'SCHEDULED',
            recipientCount: recipientRecords.count,
            sentAt: sendNow ? new Date() : null
        }
    });

    if (sendNow && campaignQueue) {
        for (const customerId of recipientIds) {
            const recipient = await prisma.campaignRecipient.findFirst({
                where: { campaignId, customerId }
            });

            if (recipient) {
                await campaignQueue.add('send-email', {
                    campaignId,
                    recipientId: recipient.id,
                    customerId,
                    organizationId
                });
            }
        }
    }

    return { recipientCount: recipientRecords.count };
}

export async function getCampaignStats(
    campaignId: string,
    organizationId: string
) {
    const campaign = await prisma.campaign.findFirst({
        where: { id: campaignId, organizationId }
    });

    if (!campaign) {
        throw new Error('Campaign not found');
    }

    const stats = await prisma.campaignRecipient.groupBy({
        by: ['status'],
        where: { campaignId },
        _count: { status: true }
    });

    const statusCounts = stats.reduce(
        (acc, s) => {
            acc[s.status] = s._count.status;
            return acc;
        },
        {} as Record<string, number>
    );

    const total = campaign.recipientCount || 0;
    const sent = statusCounts['SENT'] || 0;
    const delivered =
        (statusCounts['SENT'] || 0) + (statusCounts['DELIVERED'] || 0);
    const opened = statusCounts['OPENED'] || 0;
    const clicked = statusCounts['CLICKED'] || 0;
    const unsubscribed = statusCounts['UNSUBSCRIBED'] || 0;
    const failed = statusCounts['FAILED'] || 0;

    return {
        totalRecipients: total,
        sent,
        delivered,
        deliveredRate: total > 0 ? delivered / total : 0,
        opened,
        openRate: delivered > 0 ? opened / delivered : 0,
        clicked,
        clickRate: delivered > 0 ? clicked / delivered : 0,
        unsubscribed,
        failed
    };
}

export async function processCampaignSend(jobData: CampaignJobData) {
    const { campaignId, recipientId, customerId, organizationId } = jobData;

    const [campaign, recipient, customer] = await Promise.all([
        prisma.campaign.findFirst({
            where: { id: campaignId, organizationId }
        }),
        prisma.campaignRecipient.findUnique({
            where: { id: recipientId }
        }),
        prisma.customer.findUnique({
            where: { id: customerId }
        })
    ]);

    if (!campaign || !recipient || !customer) {
        throw new Error('Campaign, recipient, or customer not found');
    }

    if (!customer.email) {
        await prisma.campaignRecipient.update({
            where: { id: recipientId },
            data: { status: 'FAILED', failReason: 'No email address' }
        });
        return;
    }

    try {
        let subject = campaign.subject || '';
        let body = (campaign.content as { body?: string })?.body || '';

        if (campaign.templateId) {
            const template = await prisma.emailTemplate.findUnique({
                where: { id: campaign.templateId }
            });
            if (template) {
                subject = template.subject;
                body = template.htmlBody;
            }
        }

        const context: TemplateContext = {
            customer: customer as Partial<Customer>
        };

        const renderedSubject = renderTemplate(subject, context);
        const renderedBody = renderTemplate(body, context);

        void renderedBody;

        logger.info(
            {
                campaignId,
                recipientId,
                email: customer.email,
                subject: renderedSubject
            },
            'Campaign email would be sent (nodemailer stub)'
        );

        await prisma.campaignRecipient.update({
            where: { id: recipientId },
            data: {
                status: 'SENT',
                sentAt: new Date()
            }
        });
    } catch (error) {
        logger.error(
            { error, campaignId, recipientId },
            'Failed to send campaign email'
        );

        await prisma.campaignRecipient.update({
            where: { id: recipientId },
            data: {
                status: 'FAILED',
                failReason:
                    error instanceof Error ? error.message : 'Unknown error'
            }
        });
    }
}

export async function updateRecipientOpened(recipientId: string) {
    return prisma.campaignRecipient.update({
        where: { id: recipientId },
        data: {
            status: 'OPENED',
            openedAt: new Date()
        }
    });
}

export async function updateRecipientClicked(recipientId: string) {
    return prisma.campaignRecipient.update({
        where: { id: recipientId },
        data: {
            status: 'CLICKED',
            clickedAt: new Date()
        }
    });
}

export async function closeCampaignQueue() {
    if (campaignQueue) {
        await campaignQueue.close();
    }
}
