import { env } from '../config/env.config.js';
import logger from './logger.util.js';

export const isCloudflareConfigured = !!(
    env.cloudflareApiToken && env.cloudflareZoneId
);

export async function purgeCloudflareCache(
    paths: string[]
): Promise<{ success: boolean; error?: string }> {
    if (!isCloudflareConfigured) {
        return { success: false, error: 'Cloudflare not configured' };
    }

    try {
        const response = await fetch(
            `https://api.cloudflare.com/client/v4/zones/${env.cloudflareZoneId}/purge_cache`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${env.cloudflareApiToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    files: paths
                })
            }
        );

        const result = (await response.json()) as unknown as {
            success: boolean;
            errors?: Array<{ message: string }>;
        };

        if (!result.success) {
            const error =
                result.errors?.[0]?.message || 'Unknown Cloudflare error';
            logger.error(
                { errors: result.errors, paths },
                'Cloudflare cache purge failed'
            );
            return { success: false, error };
        }

        logger.info({ paths }, 'Cloudflare cache purged');
        return { success: true };
    } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown error';
        logger.error({ err: error, paths }, 'Cloudflare cache purge error');
        return { success: false, error };
    }
}

export function getCloudflarePublicUrl(b2Key: string): string | null {
    if (!env.cloudflarePublicDomain) return null;
    const base = env.cloudflarePublicDomain.replace(/\/+$/, '');
    return `${base}/${b2Key}`;
}
