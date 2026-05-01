import { z } from 'zod';

export const AnalyticsSummarySchema = z.object({
    total: z.number(),
    change: z.number()
});

export const CampaignPerformanceSchema = z.object({
    date: z.string(),
    orders: z.number(),
    conversions: z.number()
});

export const TopProductSchema = z.object({
    name: z.string(),
    sales: z.number()
});

export const TopEmployeeSchema = z
    .object({
        name: z.string(),
        activityCount: z.number()
    })
    .nullable();

export const AnalyticsResponseSchema = z.object({
    summary: z.object({
        customers: AnalyticsSummarySchema,
        products: AnalyticsSummarySchema,
        orders: AnalyticsSummarySchema
    }),
    campaignPerformance: z.array(CampaignPerformanceSchema),
    ticketsByStatus: z.record(z.string(), z.number()),
    customersByLifecycle: z.record(z.string(), z.number()),
    ordersByShipping: z.record(z.string(), z.number()),
    topProducts: z.array(TopProductSchema),
    supportOverview: z.object({
        totalResolved: z.number(),
        topEmployee: TopEmployeeSchema
    })
});
