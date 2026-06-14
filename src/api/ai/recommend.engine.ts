/**
 * Recommendation Engine — Item-Based Collaborative Filtering (IBCF)
 *
 * Replicates the Python IBCF engine from the Briefly AI server.
 * Uses ml-distance for cosine similarity with time-decay weighting.
 */
import { similarity } from 'ml-distance';
import type { InteractionInput, SimilarItem } from './ai.types.js';
import { INTERACTION_WEIGHTS } from './ai.types.js';
import logger from '../../utils/logger.util.js';

class Encoder {
    private map = new Map<string, number>();
    private nextId = 0;

    encode(value: string): number {
        if (!this.map.has(value)) {
            this.map.set(value, this.nextId++);
        }
        return this.map.get(value)!;
    }

    decode(index: number): string | undefined {
        for (const [key, val] of this.map) {
            if (val === index) return key;
        }
        return undefined;
    }

    size(): number {
        return this.nextId;
    }
}

export function computeRecommendations(
    interactions: InteractionInput[],
    decayLambda: number = 0.005
): Map<string, SimilarItem[]> {
    if (interactions.length === 0) return new Map();

    const userEncoder = new Encoder();
    const itemEncoder = new Encoder();

    interface EncodedInteraction {
        userId: number;
        itemId: number;
        rating: number;
        weight: number;
        timestamp: number;
    }

    const encodedInteractions: EncodedInteraction[] = interactions.map(
        (int) => ({
            userId: userEncoder.encode(int.userId),
            itemId: itemEncoder.encode(int.itemId),
            rating: int.rating ?? 3.0,
            weight: INTERACTION_WEIGHTS[int.interactionType] ?? 1.0,
            timestamp: new Date(int.timestamp).getTime()
        })
    );

    const maxTimestamp = Math.max(
        ...encodedInteractions.map((i) => i.timestamp)
    );
    const nUsers = userEncoder.size();
    const nItems = itemEncoder.size();

    const scores = new Map<string, number>();

    for (const int of encodedInteractions) {
        const daysAgo = (maxTimestamp - int.timestamp) / 86400000;
        const timeWeight = Math.exp(-decayLambda * Math.max(0, daysAgo));
        const score = int.rating * int.weight * timeWeight;
        const key = `${int.userId}:${int.itemId}`;
        const existing = scores.get(key) ?? 0;
        scores.set(key, existing + score);
    }

    const uiMatrix: number[][] = Array.from({ length: nUsers }, () =>
        new Array(nItems).fill(0)
    );

    for (const [key, score] of scores) {
        const parts = key.split(':');
        const u = parseInt(parts[0] ?? '0', 10);
        const i = parseInt(parts[1] ?? '0', 10);
        if (u < nUsers && i < nItems) {
            uiMatrix[u]![i] = score;
        }
    }

    const userMeans: number[] = new Array(nUsers).fill(0);
    for (let u = 0; u < nUsers; u++) {
        let sum = 0;
        let count = 0;
        const row = uiMatrix[u]!;
        for (let i = 0; i < nItems; i++) {
            if (row[i]! !== 0) {
                sum += row[i]!;
                count++;
            }
        }
        userMeans[u] = count > 0 ? sum / count : 0;
    }

    const itemVectors: number[][] = Array.from({ length: nItems }, () =>
        new Array(nUsers).fill(0)
    );
    for (let u = 0; u < nUsers; u++) {
        const mean = userMeans[u]!;
        const row = uiMatrix[u]!;
        for (let i = 0; i < nItems; i++) {
            if (row[i]! !== 0) {
                itemVectors[i]![u] = row[i]! - mean;
            }
        }
    }

    const simMatrix: number[][] = Array.from({ length: nItems }, () =>
        new Array(nItems).fill(0)
    );

    for (let i = 0; i < nItems; i++) {
        const iv = itemVectors[i]!;
        for (let j = i + 1; j < nItems; j++) {
            const jv = itemVectors[j]!;
            const sim = similarity.cosine(iv, jv);
            const normalized = Math.max(0, (sim + 1) / 2);
            simMatrix[i]![j] = normalized;
            simMatrix[j]![i] = normalized;
        }
    }

    const recommendations = new Map<string, SimilarItem[]>();
    const topN = 10;

    for (let i = 0; i < nItems; i++) {
        const itemId = itemEncoder.decode(i);
        if (!itemId) continue;

        const sims: SimilarItem[] = [];
        const simRow = simMatrix[i]!;

        for (let j = 0; j < nItems; j++) {
            if (i !== j && simRow[j]! > 0) {
                const otherItemId = itemEncoder.decode(j);
                if (otherItemId) {
                    sims.push({
                        itemId: otherItemId,
                        similarity: Math.round(simRow[j]! * 10000) / 10000
                    });
                }
            }
        }

        sims.sort((a, b) => b.similarity - a.similarity);
        recommendations.set(itemId, sims.slice(0, topN));
    }

    logger.info(
        `[RecommendEngine] Computed recommendations for ${nItems} items, ${nUsers} users`
    );
    return recommendations;
}

export function getSimilarItems(
    targetItemId: string,
    recommendations: Map<string, SimilarItem[]>
): SimilarItem[] {
    return recommendations.get(targetItemId) ?? [];
}
