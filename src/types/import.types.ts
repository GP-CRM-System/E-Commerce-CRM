import type {
    ImportJob,
    ImportJobError,
    ExportJob
} from '../generated/prisma/client.js';

export interface ColumnMapping {
    [fileColumn: string]: string;
}

export interface ImportSummary {
    totalRows: number;
    processedRows: number;
    successfulRows: number;
    failedRows: number;
    startedAt: Date;
    completedAt?: Date;
    errors?: ImportJobError[];
}

export interface ParsedRow {
    rowNumber: number;
    data: Record<string, unknown>;
    errors?: string[];
}

export interface DuplicateCheckResult {
    exists: boolean;
    existingId?: string;
    matchType?: 'externalId' | 'email' | 'phone' | 'sku' | 'barcode';
}

export interface ImportJobWithErrors extends ImportJob {
    errors: ImportJobError[];
}

export interface ExportFilters {
    dateFrom?: string;
    dateTo?: string;
    status?: string;
    source?: string;
    customerId?: string;
}

export interface ExportJobMetadata {
    entityType: string;
    format: string;
    selectedColumns: string[];
    filters?: ExportFilters;
    totalRows: number;
}

export type EntityType = 'customer' | 'product' | 'order';
export type FileType = 'csv' | 'xlsx';
export type DuplicateStrategy = 'create_only' | 'upsert';
export type ImportStatus = ImportJob['status'];
export type ExportStatus = ExportJob['status'];
