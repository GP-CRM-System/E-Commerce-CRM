import type { CsvCustomerRow, CsvInteractionRow } from './hf.types.js';

const CUSTOMER_COLUMNS: (keyof CsvCustomerRow)[] = [
    'customerId',
    'age',
    'gender',
    'annualIncome',
    'region',
    'preferredCategory',
    'subscriptionTier',
    'loyaltyPoints',
    'emailOpenRate',
    'websiteVisitsLastMonth',
    'spendingScore',
    'totalPurchases',
    'avgOrderValue',
    'daysSinceLastPurchase',
    'browsingFrequencyPerWeek',
    'satisfactionScore',
    'returnRate',
    'engagementScore',
    'cartAbandonmentRate',
    'supportTicketsCount',
    'priceSensitivityIndex',
    'totalSpent',
    'totalRefunded',
    'lastSentimentScore',
    'accountAgeMonths',
    'isLoyaltyMember',
    'avgDaysBetweenOrders',
    'rfmRecency',
    'rfmFrequency',
    'rfmMonetary',
    'lifecycleStage',
    'churnRiskScore'
];

const INTERACTION_COLUMNS: (keyof CsvInteractionRow)[] = [
    'userId',
    'itemId',
    'rating',
    'interactionType',
    'timestamp'
];

function escapeCsvValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function toCsv<T>(rows: T[], columns: (keyof T)[]): string {
    const header = columns.map(String).join(',');
    const data = rows.map((row) =>
        columns
            .map((col) => {
                const val = row[col];
                return escapeCsvValue(val);
            })
            .join(',')
    );
    return [header, ...data].join('\n');
}

export function buildCustomerCsv(rows: CsvCustomerRow[]): string {
    return toCsv(rows, CUSTOMER_COLUMNS);
}

export function buildInteractionCsv(rows: CsvInteractionRow[]): string {
    return toCsv(rows, INTERACTION_COLUMNS);
}
