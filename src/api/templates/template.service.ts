import prisma from '../../config/prisma.config.js';
import Handlebars from 'handlebars';
import type { Customer, Order } from '../../generated/prisma/client.js';

export interface TemplateContext {
    customer?: Partial<Customer>;
    order?: Partial<Order>;
    [key: string]: unknown;
}

export async function createTemplate(
    organizationId: string,
    data: {
        name: string;
        subject: string;
        htmlBody: string;
        variables?: string[];
    }
) {
    return prisma.emailTemplate.create({
        data: {
            organizationId,
            name: data.name,
            subject: data.subject,
            htmlBody: data.htmlBody,
            variables: data.variables || []
        }
    });
}

export async function getTemplate(id: string, organizationId: string) {
    return prisma.emailTemplate.findFirst({
        where: { id, organizationId }
    });
}

export async function listTemplates(
    organizationId: string,
    take: number,
    skip: number
) {
    const [templates, total] = await Promise.all([
        prisma.emailTemplate.findMany({
            where: { organizationId },
            orderBy: { createdAt: 'desc' },
            take,
            skip
        }),
        prisma.emailTemplate.count({ where: { organizationId } })
    ]);

    return { templates, total };
}

export async function updateTemplate(
    id: string,
    organizationId: string,
    data: {
        name?: string;
        subject?: string;
        htmlBody?: string;
        variables?: string[];
    }
) {
    const template = await prisma.emailTemplate.findFirst({
        where: { id, organizationId }
    });

    if (!template) {
        throw new Error('Template not found');
    }

    return prisma.emailTemplate.update({
        where: { id },
        data: {
            ...(data.name !== undefined && { name: data.name }),
            ...(data.subject !== undefined && { subject: data.subject }),
            ...(data.htmlBody !== undefined && { htmlBody: data.htmlBody }),
            ...(data.variables !== undefined && { variables: data.variables })
        }
    });
}

export async function deleteTemplate(id: string, organizationId: string) {
    const template = await prisma.emailTemplate.findFirst({
        where: { id, organizationId }
    });

    if (!template) {
        throw new Error('Template not found');
    }

    const usedInCampaigns = await prisma.campaign.count({
        where: { templateId: id }
    });

    if (usedInCampaigns > 0) {
        throw new Error(
            `Template is used in ${usedInCampaigns} campaign(s). Remove it from campaigns first.`
        );
    }

    return prisma.emailTemplate.delete({ where: { id } });
}

export function renderTemplate(
    template: string,
    context: TemplateContext
): string {
    const compiled = Handlebars.compile(template);
    return compiled(context);
}

export async function renderTemplatePreview(
    templateId: string,
    organizationId: string
): Promise<{ subject: string; body: string }> {
    const template = await getTemplate(templateId, organizationId);

    if (!template) {
        throw new Error('Template not found');
    }

    const sampleContext: TemplateContext = {
        customer: {
            name: 'John Doe',
            email: 'john@example.com'
        }
    };

    return {
        subject: renderTemplate(template.subject ?? '', sampleContext),
        body: renderTemplate(template.htmlBody ?? '', sampleContext)
    };
}

export function extractVariables(htmlBody: string): string[] {
    const regex = /\{\{([^}]+)\}\}/g;
    const matches: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(htmlBody)) !== null) {
        const variable = match[1]?.trim() ?? '';
        if (variable && !matches.includes(variable)) {
            matches.push(variable);
        }
    }

    return matches;
}
