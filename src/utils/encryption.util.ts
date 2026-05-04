import crypto from 'crypto';
import { env } from '../config/env.config.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Gets a 32-byte key from the configured ENCRYPTION_KEY or BETTER_AUTH_SECRET.
 * If the key is not exactly 32 bytes, we hash it to ensure correct length.
 */
function getKey(): Buffer {
    const secret = env.encryptionKey;
    if (!secret) {
        throw new Error(
            'ENCRYPTION_KEY or BETTER_AUTH_SECRET must be defined for encryption'
        );
    }

    // Hash the secret to always get exactly 32 bytes (256 bits)
    return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts a string using AES-256-GCM.
 * Output format: base64(iv:salt:encryptedData:authTag)
 */
export function encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = crypto.pbkdf2Sync(getKey(), salt, 100000, KEY_LENGTH, 'sha512');

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
        cipher.update(text, 'utf8'),
        cipher.final()
    ]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([iv, salt, encrypted, tag]).toString('base64');
}

/**
 * Decrypts a string encrypted by `encrypt()`.
 */
export function decrypt(encryptedText: string): string {
    const rawData = Buffer.from(encryptedText, 'base64');

    const iv = rawData.subarray(0, IV_LENGTH);
    const salt = rawData.subarray(IV_LENGTH, IV_LENGTH + SALT_LENGTH);
    const tag = rawData.subarray(rawData.length - TAG_LENGTH);
    const encrypted = rawData.subarray(
        IV_LENGTH + SALT_LENGTH,
        rawData.length - TAG_LENGTH
    );

    const key = crypto.pbkdf2Sync(getKey(), salt, 100000, KEY_LENGTH, 'sha512');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
    ]);
    return decrypted.toString('utf8');
}
