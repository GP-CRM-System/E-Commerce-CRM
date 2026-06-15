export interface AiHealthStatus {
    churnModel: { available: boolean; features: number };
    segmentation: { available: boolean };
    recommendations: { available: boolean };
}

export interface ChurnResult {
    customer_id: string;
    churn_probability: number;
    risk_level: 'stable' | 'low' | 'high';
}

export interface SegmentResult {
    customer_id: string;
    segment: number;
    segment_name: string;
    distances: [number, number, number];
}

export const SEGMENT_NAMES = [
    'Browsers',
    'Bargain/Casual',
    'Premium Loyal'
] as const;

export const INTERACTION_WEIGHTS: Record<string, number> = {
    view: 1.0,
    add_to_cart: 3.0,
    purchase: 5.0
};
