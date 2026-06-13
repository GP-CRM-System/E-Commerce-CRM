import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    PutBucketCorsCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from './env.config.js';
import logger from '../utils/logger.util.js';

const SIGNED_URL_EXPIRY_SECONDS = 3600;

export const b2Config = {
    region: env.b2Region || 'us-east-005',
    bucket: env.b2BucketName,
    credentials:
        env.b2KeyId && env.b2ApplicationKey
            ? {
                  accessKeyId: env.b2KeyId,
                  secretAccessKey: env.b2ApplicationKey
              }
            : null
};

export const isB2Configured = !!(b2Config.credentials && b2Config.bucket);

let s3Client: S3Client | null = null;

function getS3Client(): S3Client | null {
    if (!isB2Configured) return null;

    if (!s3Client) {
        s3Client = new S3Client({
            region: b2Config.region,
            endpoint: `https://s3.${b2Config.region}.backblazeb2.com`,
            credentials: b2Config.credentials!
        });
    }

    return s3Client;
}

export async function uploadToB2(
    key: string,
    body: Buffer | Uint8Array,
    contentType?: string
): Promise<{ success: boolean; url?: string; error?: string }> {
    if (!isB2Configured) {
        return { success: false, error: 'B2 not configured' };
    }

    try {
        const client = getS3Client();
        if (!client) {
            return { success: false, error: 'Failed to create S3 client' };
        }

        await client.send(
            new PutObjectCommand({
                Bucket: b2Config.bucket,
                Key: key,
                Body: body,
                ContentType: contentType
            })
        );

        logger.info({ key, bucket: b2Config.bucket }, 'File uploaded to B2');
        return { success: true };
    } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown error';
        logger.error({ err: error, key }, 'Failed to upload to B2');
        return { success: false, error };
    }
}

export async function getSignedDownloadUrl(
    key: string,
    expiresInSeconds: number = SIGNED_URL_EXPIRY_SECONDS
): Promise<{ success: boolean; url?: string; error?: string }> {
    if (!isB2Configured) {
        return { success: false, error: 'B2 not configured' };
    }

    try {
        const client = getS3Client();
        if (!client) {
            return { success: false, error: 'Failed to create S3 client' };
        }

        const url = await getSignedUrl(
            client,
            new GetObjectCommand({
                Bucket: b2Config.bucket,
                Key: key
            }),
            { expiresIn: expiresInSeconds }
        );

        return { success: true, url };
    } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown error';
        logger.error({ err: error, key }, 'Failed to generate signed URL');
        return { success: false, error };
    }
}

export async function getSignedUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds: number = 3600
): Promise<{ success: boolean; url?: string; error?: string }> {
    if (!isB2Configured) {
        return { success: false, error: 'B2 not configured' };
    }

    try {
        const client = getS3Client();
        if (!client) {
            return { success: false, error: 'Failed to create S3 client' };
        }

        const url = await getSignedUrl(
            client,
            new PutObjectCommand({
                Bucket: b2Config.bucket,
                Key: key,
                ContentType: contentType
            }),
            { expiresIn: expiresInSeconds }
        );

        return { success: true, url };
    } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown error';
        logger.error(
            { err: error, key },
            'Failed to generate signed upload URL'
        );
        return { success: false, error };
    }
}

export async function deleteFromB2(
    key: string
): Promise<{ success: boolean; error?: string }> {
    if (!isB2Configured) {
        return { success: false, error: 'B2 not configured' };
    }

    try {
        const client = getS3Client();
        if (!client) {
            return { success: false, error: 'Failed to create S3 client' };
        }

        await client.send(
            new DeleteObjectCommand({
                Bucket: b2Config.bucket,
                Key: key
            })
        );

        logger.info({ key }, 'File deleted from B2');
        return { success: true };
    } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown error';
        logger.error({ err: error, key }, 'Failed to delete from B2');
        return { success: false, error };
    }
}

export async function configureB2Cors(): Promise<void> {
    if (!isB2Configured) return;

    try {
        const client = getS3Client();
        if (!client) return;

        const allowedOrigins = process.env.CORS_ORIGIN
            ? process.env.CORS_ORIGIN.split(',')
            : ['http://localhost:5173', 'http://localhost:5174'];

        logger.info(
            { allowedOrigins },
            '[B2] Configuring CORS rules for bucket...'
        );

        await client.send(
            new PutBucketCorsCommand({
                Bucket: b2Config.bucket,
                CORSConfiguration: {
                    CORSRules: [
                        {
                            AllowedHeaders: ['*'],
                            AllowedMethods: [
                                'GET',
                                'PUT',
                                'POST',
                                'DELETE',
                                'HEAD'
                            ],
                            AllowedOrigins: allowedOrigins,
                            ExposeHeaders: [
                                'ETag',
                                'Content-Length',
                                'Content-Type'
                            ],
                            MaxAgeSeconds: 3600
                        }
                    ]
                }
            })
        );
        logger.info('[B2] CORS rules configured successfully');
    } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown error';
        logger.error({ err: error }, '[B2] Failed to configure CORS rules');
    }
}
