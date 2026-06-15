import type { MasterCsvRow, CatalogCsvRow } from './hf.types.js';

const MASTER_COLUMNS: (keyof MasterCsvRow)[] = [
    'customer_id',
    'item_id',
    'item_category',
    'price',
    'brand',
    'tags',
    'rating',
    'interaction_type',
    'timestamp',
    'device',
    'session_id',
    'time_of_day',
    'age',
    'gender',
    'annual_income',
    'spending_score',
    'total_purchases',
    'avg_order_value',
    'website_visits_last_month',
    'days_since_last_purchase',
    'email_open_rate',
    'subscription_tier',
    'region',
    'preferred_category',
    'return_rate',
    'loyalty_points',
    'loyalty_member',
    'browsing_frequency_per_week',
    'satisfaction_score',
    'engagement_score',
    'age_group',
    'location'
];

const CATALOG_COLUMNS: (keyof CatalogCsvRow)[] = [
    'item_id',
    'item_category',
    'brand',
    'price',
    'tags'
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

export function buildMasterCsv(rows: MasterCsvRow[]): string {
    return toCsv(rows, MASTER_COLUMNS);
}

export function buildCatalogCsv(rows: CatalogCsvRow[]): string {
    return toCsv(rows, CATALOG_COLUMNS);
}
