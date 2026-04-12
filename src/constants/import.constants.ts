export const IMPORT_CONFIG = {
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    SUPPORTED_MIME_TYPES: [
        'text/csv',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel'
    ],
    SUPPORTED_EXTENSIONS: ['.csv', '.xlsx'],
    BATCH_SIZE: {
        customer: 100,
        product: 100,
        order: 25
    }
} as const;

export const IMPORT_JOB_STATUS = {
    PENDING: 'PENDING',
    PROCESSING: 'PROCESSING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    PARTIALLY_FAILED: 'PARTIALLY_FAILED',
    CANCELLED: 'CANCELLED'
} as const;

export const EXPORT_JOB_STATUS = {
    PENDING: 'PENDING',
    PROCESSING: 'PROCESSING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED'
} as const;

export const ENTITY_TYPES = {
    CUSTOMER: 'customer',
    PRODUCT: 'product',
    ORDER: 'order'
} as const;

export const EXPORT_FORMATS = {
    CSV: 'csv',
    XLSX: 'xlsx'
} as const;

export const DUPLICATE_STRATEGIES = {
    CREATE_ONLY: 'create_only',
    UPSERT: 'upsert'
} as const;
