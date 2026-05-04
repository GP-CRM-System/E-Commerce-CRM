import { describe, it, expect } from 'bun:test';
import { encrypt, decrypt } from './encryption.util.js';

describe('Encryption Utility', () => {
    it('should encrypt and decrypt a string correctly', () => {
        const text = 'my-super-secret-token';
        const encrypted = encrypt(text);

        expect(encrypted).not.toBe(text);
        expect(typeof encrypted).toBe('string');

        const decrypted = decrypt(encrypted);
        expect(decrypted).toBe(text);
    });

    it('should produce different ciphertexts for the same plaintext due to random IV/salt', () => {
        const text = 'my-super-secret-token';
        const encrypted1 = encrypt(text);
        const encrypted2 = encrypt(text);

        expect(encrypted1).not.toBe(encrypted2);

        expect(decrypt(encrypted1)).toBe(text);
        expect(decrypt(encrypted2)).toBe(text);
    });

    it('should throw an error when trying to decrypt invalid data', () => {
        const invalidData = Buffer.from(
            'this is definitely not a valid encrypted payload'
        ).toString('base64');
        expect(() => decrypt(invalidData)).toThrow();
    });

    it('should encrypt and decrypt empty strings', () => {
        const text = '';
        const encrypted = encrypt(text);
        const decrypted = decrypt(encrypted);
        expect(decrypted).toBe(text);
    });

    it('should encrypt and decrypt long strings', () => {
        const text = 'a'.repeat(10000);
        const encrypted = encrypt(text);
        const decrypted = decrypt(encrypted);
        expect(decrypted).toBe(text);
    });
});
