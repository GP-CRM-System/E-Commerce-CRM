import { env } from '../../config/env.config.js';
import type { HfApiResponse } from './hf.types.js';
import { AppError, HttpStatus, ErrorCode } from '../../utils/response.util.js';

export async function callHfApi(
    customerCsv: string,
    interactionCsv: string,
    orgId: string
): Promise<HfApiResponse> {
    const url = env.hfApiUrl;

    const formData = new FormData();
    formData.append(
        'customer_file',
        new Blob([customerCsv], { type: 'text/csv' }),
        'customer_data.csv'
    );
    formData.append(
        'interaction_file',
        new Blob([interactionCsv], { type: 'text/csv' }),
        'interaction_data.csv'
    );
    formData.append('org_id', orgId);

    const headers: Record<string, string> = {};
    if (env.hfApiToken) {
        headers['Authorization'] = `Bearer ${env.hfApiToken}`;
    }

    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData
    });

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new AppError(
            `HF API returned ${response.status}: ${body}`,
            HttpStatus.SERVICE_UNAVAILABLE,
            ErrorCode.SERVER_ERROR
        );
    }

    const data = (await response.json()) as HfApiResponse;
    return data;
}
