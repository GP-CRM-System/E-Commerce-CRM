/**
 * Churn Prediction Engine — Pure TypeScript implementation
 *
 * Uses the pre-trained LogisticRegression weights extracted from the Python model.
 * No ONNX or Python dependency at runtime.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ChurnInput, ChurnResult } from './ai.types.js';
import { AppError, HttpStatus, ErrorCode } from '../../utils/response.util.js';

interface ChurnWeights {
    coefficients: number[][];
    intercept: number[];
    classes: number[];
    columns: string[];
    threshold: number;
    median_days: number;
    median_browsing: number;
    scaled_features: string[];
    model_type: string;
}

let weights: ChurnWeights | null = null;

function getModelPath(): string {
    return resolve(process.cwd(), 'models', 'churn_weights.json');
}

function loadWeights(): ChurnWeights {
    if (weights) return weights;

    const modelPath = getModelPath();
    if (!existsSync(modelPath)) {
        throw new AppError(
            `Churn model weights not found at ${modelPath}`,
            HttpStatus.SERVICE_UNAVAILABLE,
            ErrorCode.SERVER_ERROR
        );
    }

    const raw = readFileSync(modelPath, 'utf-8');
    weights = JSON.parse(raw) as ChurnWeights;
    return weights;
}

function sigmoid(z: number): number {
    return 1 / (1 + Math.exp(-z));
}

function percentileRank(value: number, sortedValues: number[]): number {
    let count = 0;
    for (let i = 0; i < sortedValues.length; i++) {
        if (sortedValues[i]! <= value) count++;
    }
    return sortedValues.length > 0 ? count / sortedValues.length : 0;
}

interface BatchStats {
    browsingValues: number[];
    satisfactionValues: number[];
    purchaseValues: number[];
    avgOrderValues: number[];
    visitValues: number[];
    emailValues: number[];
    returnValues: number[];
}

function buildBatchStats(inputs: ChurnInput[]): BatchStats {
    return {
        browsingValues: [...inputs.map((i) => i.browsingFrequencyPerWeek)].sort(
            (a, b) => a - b
        ),
        satisfactionValues: [...inputs.map((i) => i.satisfactionScore)].sort(
            (a, b) => a - b
        ),
        purchaseValues: [...inputs.map((i) => i.totalPurchases)].sort(
            (a, b) => a - b
        ),
        avgOrderValues: [...inputs.map((i) => i.avgOrderValue)].sort(
            (a, b) => a - b
        ),
        visitValues: [...inputs.map((i) => i.websiteVisitsLastMonth)].sort(
            (a, b) => a - b
        ),
        emailValues: [...inputs.map((i) => i.emailOpenRate)].sort(
            (a, b) => a - b
        ),
        returnValues: [...inputs.map((i) => i.returnRate)].sort((a, b) => a - b)
    };
}

export function predictChurn(inputs: ChurnInput[]): ChurnResult[] {
    const wt = loadWeights();
    const batchStats = buildBatchStats(inputs);
    const coef = wt.coefficients[0]!;
    const intercept = wt.intercept[0]!;
    const threshold = wt.threshold;
    const md = wt.median_days;
    const mb = wt.median_browsing;
    const cols = wt.columns;

    const results: ChurnResult[] = [];

    for (const input of inputs) {
        const features: number[] = [];

        for (const col of cols) {
            switch (col) {
                case 'loyalty_member':
                    features.push(input.loyaltyMember ? 1 : 0);
                    break;
                case 'is_recently_active':
                    features.push(input.daysSinceLastPurchase <= md ? 1 : 0);
                    break;
                case 'is_slipping_away':
                    features.push(
                        input.daysSinceLastPurchase > md &&
                            input.daysSinceLastPurchase <= md * 2
                            ? 1
                            : 0
                    );
                    break;
                case 'is_happy_lurker':
                    features.push(
                        input.daysSinceLastPurchase > md &&
                            input.browsingFrequencyPerWeek > mb &&
                            input.satisfactionScore >= 8
                            ? 1
                            : 0
                    );
                    break;
                case 'browsing_frequency_per_week_percentile':
                    features.push(
                        percentileRank(
                            input.browsingFrequencyPerWeek,
                            batchStats.browsingValues
                        )
                    );
                    break;
                case 'satisfaction_score_percentile':
                    features.push(
                        percentileRank(
                            input.satisfactionScore,
                            batchStats.satisfactionValues
                        )
                    );
                    break;
                case 'total_purchases_percentile':
                    features.push(
                        percentileRank(
                            input.totalPurchases,
                            batchStats.purchaseValues
                        )
                    );
                    break;
                case 'avg_order_value_percentile':
                    features.push(
                        percentileRank(
                            input.avgOrderValue,
                            batchStats.avgOrderValues
                        )
                    );
                    break;
                case 'website_visits_last_month_percentile':
                    features.push(
                        percentileRank(
                            input.websiteVisitsLastMonth,
                            batchStats.visitValues
                        )
                    );
                    break;
                case 'email_open_rate_percentile':
                    features.push(
                        percentileRank(
                            input.emailOpenRate,
                            batchStats.emailValues
                        )
                    );
                    break;
                case 'return_rate_percentile':
                    features.push(
                        percentileRank(
                            input.returnRate,
                            batchStats.returnValues
                        )
                    );
                    break;
                default:
                    features.push(0);
            }
        }

        let z = intercept;
        for (let i = 0; i < features.length && i < coef.length; i++) {
            z += coef[i]! * features[i]!;
        }

        const probability = sigmoid(z);
        const riskLevel: ChurnResult['riskLevel'] =
            probability < threshold
                ? 'stable'
                : probability < 0.8
                  ? 'low'
                  : 'high';

        results.push({
            customerId: input.customerId,
            churnProbability: Math.round(probability * 10000) / 10000,
            riskLevel
        });
    }

    return results;
}

export function isChurnModelReady(): boolean {
    try {
        loadWeights();
        return true;
    } catch {
        return false;
    }
}

export function getChurnModelInfo(): {
    features: number;
    threshold: number;
    columns: string[];
} {
    const wt = loadWeights();
    return {
        features: wt.columns.length,
        threshold: wt.threshold,
        columns: wt.columns
    };
}
