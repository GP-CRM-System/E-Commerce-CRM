import { parse } from 'csv-parse';
import { stringify } from 'csv-stringify';
import * as XLSX from 'xlsx';
import { IMPORT_CONFIG } from '../constants/import.constants.js';
import type {
    ParsedRow,
    EntityType,
    FileType,
    ColumnMapping
} from '../types/import.types.js';

export async function parseCSV(content: string): Promise<ParsedRow[]> {
    return new Promise((resolve, reject) => {
        const records: ParsedRow[] = [];
        const parser = parse(content, {
            columns: true,
            skip_empty_lines: true,
            trim: true
        });

        let rowNumber = 0;
        parser.on('readable', function () {
            let record;
            while ((record = parser.read()) !== null) {
                rowNumber++;
                records.push({ rowNumber, data: record });
            }
        });
        parser.on('error', reject);
        parser.on('end', () => resolve(records));
    });
}

export async function parseExcel(buffer: Buffer): Promise<ParsedRow[]> {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return [];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return [];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    return json.map((row: unknown, index: number) => ({
        rowNumber: index + 1,
        data: row as Record<string, unknown>
    }));
}

export async function parseFile(
    buffer: Buffer,
    fileType: FileType
): Promise<ParsedRow[]> {
    if (fileType === 'csv') {
        return parseCSV(buffer.toString('utf-8'));
    }
    return parseExcel(buffer);
}

export function detectFileType(filename: string): FileType | null {
    const ext = filename.toLowerCase().split('.').pop() as string;
    if (ext === 'csv') return 'csv';
    if (ext === 'xlsx' || ext === 'xls') return 'xlsx';
    return null;
}

export function getFileHeaders(rows: ParsedRow[]): string[] {
    if (rows.length === 0) return [];
    const firstRow = rows[0];
    if (!firstRow) return [];
    return Object.keys(firstRow.data);
}

export function suggestMapping(
    headers: string[],
    entityType: EntityType
): ColumnMapping {
    const fieldMappings: Record<EntityType, Record<string, string>> = {
        customer: {
            name: 'name',
            'customer name': 'name',
            fullname: 'name',
            email: 'email',
            'e-mail': 'email',
            mail: 'email',
            phone: 'phone',
            mobile: 'phone',
            cell: 'phone',
            address: 'address',
            city: 'city',
            source: 'source',
            'lifecycle stage': 'lifecycleStage',
            stage: 'lifecycleStage',
            'external id': 'externalId',
            externalid: 'externalId',
            'accepts marketing': 'acceptsMarketing',
            marketing: 'acceptsMarketing',
            totalorders: 'totalOrders',
            'total orders': 'totalOrders',
            totalspent: 'totalSpent',
            'total spent': 'totalSpent'
        },
        product: {
            name: 'name',
            'product name': 'name',
            title: 'name',
            price: 'price',
            cost: 'price',
            amount: 'price',
            description: 'description',
            desc: 'description',
            'external id': 'externalId',
            externalid: 'externalId',
            sku: 'sku',
            'sku code': 'sku',
            category: 'category',
            type: 'category',
            'image url': 'imageUrl',
            image: 'imageUrl',
            barcode: 'barcode',
            upc: 'barcode',
            weight: 'weight',
            inventory: 'inventory',
            stock: 'inventory',
            quantity: 'inventory',
            status: 'status'
        },
        order: {
            'external id': 'externalId',
            externalid: 'externalId',
            'order id': 'externalId',
            customer: 'customerId',
            'customer id': 'customerId',
            'customer email': 'customerEmail',
            subtotal: 'subtotal',
            total: 'totalAmount',
            'total amount': 'totalAmount',
            tax: 'taxAmount',
            'tax amount': 'taxAmount',
            shipping: 'shippingAmount',
            'shipping amount': 'shippingAmount',
            discount: 'discountAmount',
            'discount amount': 'discountAmount',
            currency: 'currency',
            status: 'status',
            'payment status': 'paymentStatus',
            'shipping status': 'shippingStatus',
            note: 'note',
            notes: 'note',
            source: 'source',
            tags: 'tags'
        }
    };

    const mapping: ColumnMapping = {};
    const entityFields = fieldMappings[entityType] as Record<string, string>;

    for (const header of headers) {
        const normalizedHeader = header.toLowerCase().trim();
        if (entityFields[normalizedHeader]) {
            mapping[header] = entityFields[normalizedHeader];
        }
    }

    return mapping;
}

export function applyMapping(
    rows: ParsedRow[],
    mapping: ColumnMapping
): ParsedRow[] {
    return rows.map(({ rowNumber, data }) => {
        const mappedData: Record<string, unknown> = {};
        for (const [header, value] of Object.entries(data)) {
            const mappedField = mapping[header];
            if (mappedField) {
                mappedData[mappedField] = value;
            }
        }
        return { rowNumber, data: mappedData };
    });
}

export async function toCSV(data: Record<string, unknown>[]): Promise<string> {
    return new Promise((resolve, reject) => {
        stringify(data, { header: true }, (err, output) => {
            if (err) reject(err);
            else resolve(output);
        });
    });
}

export async function toExcel(
    data: Record<string, unknown>[]
): Promise<Buffer> {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Export');
    return Buffer.from(
        XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
    );
}

export function validateFileType(filename: string): boolean {
    const ext = filename.toLowerCase().split('.').pop() as string;
    return IMPORT_CONFIG.SUPPORTED_EXTENSIONS.includes(
        `.${ext}` as '.csv' | '.xlsx'
    );
}

export function validateFileSize(size: number): boolean {
    return size <= IMPORT_CONFIG.MAX_FILE_SIZE;
}
