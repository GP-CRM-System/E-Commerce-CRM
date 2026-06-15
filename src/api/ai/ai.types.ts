export interface AiHealthStatus {
    churnModel: { available: boolean; features: number };
    segmentation: { available: boolean };
    recommendations: { available: boolean };
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
