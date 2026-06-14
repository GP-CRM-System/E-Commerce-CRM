/**
 * Segmentation Engine — K-Means clustering via ml-kmeans
 *
 * Replicates the Python K-Means segmentation from the Briefly AI server.
 * Uses ml-kmeans for the actual clustering, with LabelEncoder-style preprocessing.
 */
import { kmeans } from 'ml-kmeans';
import type { SegmentInput, SegmentResult } from './ai.types.js';
import { SEGMENT_NAMES } from './ai.types.js';
import logger from '../../utils/logger.util.js';

class LabelEncoder {
    private map = new Map<string, number>();
    private counter = 0;

    fitTransform(values: string[]): number[] {
        this.map.clear();
        this.counter = 0;
        return values.map((v) => {
            if (!this.map.has(v)) {
                this.map.set(v, this.counter++);
            }
            return this.map.get(v)!;
        });
    }
}

export function segmentCustomers(inputs: SegmentInput[]): SegmentResult[] {
    if (inputs.length === 0) return [];

    const nClusters = Math.min(3, inputs.length);

    const numericFeatures: (keyof SegmentInput)[] = [
        'age',
        'annualIncome',
        'spendingScore',
        'totalPurchases',
        'avgOrderValue',
        'websiteVisitsLastMonth',
        'daysSinceLastPurchase',
        'emailOpenRate',
        'returnRate',
        'loyaltyPoints'
    ];

    const genderEncoder = new LabelEncoder();
    const tierEncoder = new LabelEncoder();
    const regionEncoder = new LabelEncoder();
    const categoryEncoder = new LabelEncoder();

    const genders = genderEncoder.fitTransform(inputs.map((i) => i.gender));
    const tiers = tierEncoder.fitTransform(
        inputs.map((i) => i.subscriptionTier)
    );
    const regions = regionEncoder.fitTransform(inputs.map((i) => i.region));
    const categories = categoryEncoder.fitTransform(
        inputs.map((i) => i.preferredCategory)
    );

    const data: number[][] = inputs.map((input, idx) => {
        const row: number[] = [];
        for (const feat of numericFeatures) {
            row.push(input[feat] as number);
        }
        row.push(genders[idx]!, tiers[idx]!, regions[idx]!, categories[idx]!);
        return row;
    });

    const nFeatures = data[0]!.length;
    const means: number[] = [];
    const stds: number[] = [];

    for (let j = 0; j < nFeatures; j++) {
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            sum += data[i]![j]!;
        }
        means[j] = sum / data.length;

        let sqSum = 0;
        for (let i = 0; i < data.length; i++) {
            sqSum += (data[i]![j]! - means[j]!) ** 2;
        }
        stds[j] = Math.sqrt(sqSum / data.length) || 1;
    }

    const scaledData: number[][] = data.map((row) =>
        row.map((val, j) => (val - means[j]!) / stds[j]!)
    );

    let result;
    try {
        result = kmeans(scaledData, nClusters, {
            initialization: 'kmeans++',
            maxIterations: 100,
            seed: 42
        });
    } catch (err) {
        logger.error(`[SegmentEngine] K-Means failed: ${err}`);
        throw new Error('Segmentation computation failed', { cause: err });
    }

    const clusters: number[] = result.clusters ?? [];
    const centroids: number[][] = result.centroids ?? [];

    const distances: [number, number, number][] = scaledData.map((point) => {
        const dists: number[] = centroids.map((centroid) => {
            let sum = 0;
            for (let j = 0; j < point.length; j++) {
                sum += (point[j]! - (centroid[j] ?? 0)) ** 2;
            }
            return Math.sqrt(sum);
        });
        return [dists[0] ?? 0, dists[1] ?? 0, dists[2] ?? 0];
    });

    return inputs.map((input, idx) => {
        const dist = distances[idx] ?? [0, 0, 0];
        return {
            customerId: input.customerId,
            segment: clusters[idx] ?? 0,
            segmentName:
                SEGMENT_NAMES[clusters[idx] ?? 0] ??
                `Cluster ${clusters[idx] ?? 0}`,
            distances: [dist[0], dist[1], dist[2]] as [number, number, number]
        };
    });
}

export function getSegmentDistribution(results: SegmentResult[]): {
    segment: number;
    name: string;
    count: number;
    percentage: number;
}[] {
    const counts = [0, 0, 0];
    for (const r of results) {
        counts[r.segment]!++;
    }
    const total = results.length || 1;
    return counts.map((count, idx) => ({
        segment: idx,
        name: SEGMENT_NAMES[idx] ?? `Cluster ${idx}`,
        count,
        percentage: Math.round((count / total) * 10000) / 100
    }));
}
