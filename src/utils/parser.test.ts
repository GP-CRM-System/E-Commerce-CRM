import { describe, it, expect } from 'bun:test';
import {
    detectFileType,
    suggestMapping,
    applyMapping,
    getFileHeaders,
    validateFileType,
    validateFileSize,
    parseCSV,
    toCSV
} from './parser.util.js';

describe('Parser Utility', () => {
    describe('detectFileType', () => {
        it('should detect csv files', () => {
            expect(detectFileType('test.csv')).toBe('csv');
            expect(detectFileType('test.CSV')).toBe('csv');
        });

        it('should detect excel files', () => {
            expect(detectFileType('test.xlsx')).toBe('xlsx');
            expect(detectFileType('test.xls')).toBe('xlsx');
        });

        it('should return null for unsupported types', () => {
            expect(detectFileType('test.txt')).toBeNull();
            expect(detectFileType('test')).toBeNull();
        });
    });

    describe('suggestMapping', () => {
        it('should suggest mappings for customer', () => {
            const headers = ['Fullname', 'E-mail', 'Phone Number', 'City'];
            const mapping = suggestMapping(headers, 'customer');
            expect(mapping['Fullname']).toBe('name');
            expect(mapping['E-mail']).toBe('email');
            expect(mapping['City']).toBe('city');
        });

        it('should suggest mappings for product', () => {
            const headers = ['Product Name', 'Price', 'SKU', 'Inventory'];
            const mapping = suggestMapping(headers, 'product');
            expect(mapping['Product Name']).toBe('name');
            expect(mapping['Price']).toBe('price');
            expect(mapping['SKU']).toBe('sku');
            expect(mapping['Inventory']).toBe('inventory');
        });

        it('should return empty mapping for unknown headers', () => {
            const headers = ['Random', 'Unknown'];
            const mapping = suggestMapping(headers, 'customer');
            expect(Object.keys(mapping)).toHaveLength(0);
        });
    });

    describe('applyMapping', () => {
        it('should apply mapping to rows', () => {
            const rows = [
                {
                    rowNumber: 1,
                    data: { 'Full Name': 'John Doe', Email: 'john@example.com' }
                }
            ];
            const mapping = { 'Full Name': 'name', Email: 'email' };
            const result = applyMapping(rows, mapping);
            expect(result[0]!.data).toEqual({
                name: 'John Doe',
                email: 'john@example.com'
            });
        });
    });

    describe('getFileHeaders', () => {
        it('should return headers from first row', () => {
            const rows = [
                { rowNumber: 1, data: { name: 'John', email: 'john@test.com' } }
            ];
            expect(getFileHeaders(rows)).toEqual(['name', 'email']);
        });

        it('should return empty array for empty rows', () => {
            expect(getFileHeaders([])).toEqual([]);
        });
    });

    describe('CSV parsing/stringifying', () => {
        it('should parse CSV content', async () => {
            const content =
                'name,email\nJohn,john@test.com\nJane,jane@test.com';
            const result = await parseCSV(content);
            expect(result).toHaveLength(2);
            expect(result[0]!.data.name).toBe('John');
            expect(result[1]!.data.name).toBe('Jane');
        });

        it('should convert to CSV', async () => {
            const data = [{ name: 'John', email: 'john@test.com' }];
            const csv = await toCSV(data);
            expect(csv).toContain('name,email');
            expect(csv).toContain('John,john@test.com');
        });
    });

    describe('validation', () => {
        it('should validate file type', () => {
            expect(validateFileType('test.csv')).toBe(true);
            expect(validateFileType('test.xlsx')).toBe(true);
            expect(validateFileType('test.pdf')).toBe(false);
        });

        it('should validate file size', () => {
            expect(validateFileSize(5 * 1024 * 1024)).toBe(true);
            expect(validateFileSize(15 * 1024 * 1024)).toBe(false);
        });
    });
});
