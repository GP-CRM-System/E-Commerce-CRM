/**
 * Types for the AI Intelligence module (churn, segmentation, recommendations).
 */
export interface ChurnInput {
    customerId: string;
    loyaltyMember: boolean;
    daysSinceLastPurchase: number;
    browsingFrequencyPerWeek: number;
    satisfactionScore: number;
    totalPurchases: number;
    avgOrderValue: number;
    websiteVisitsLastMonth: number;
    emailOpenRate: number;
    returnRate: number;
}

export interface ChurnResult {
    customerId: string;
    churnProbability: number;
    riskLevel: 'stable' | 'low' | 'high';
}

export interface SegmentInput {
    customerId: string;
    age: number;
    gender: string;
    annualIncome: number;
    spendingScore: number;
    totalPurchases: number;
    avgOrderValue: number;
    websiteVisitsLastMonth: number;
    daysSinceLastPurchase: number;
    emailOpenRate: number;
    subscriptionTier: string;
    region: string;
    preferredCategory: string;
    returnRate: number;
    loyaltyPoints: number;
}

export interface SegmentResult {
    customerId: string;
    segment: number;
    segmentName: string;
    distances: [number, number, number];
}

export interface InteractionInput {
    userId: string;
    itemId: string;
    rating: number | null;
    interactionType: 'view' | 'add_to_cart' | 'purchase';
    timestamp: string;
}

export interface RecommendInput {
    interactions: InteractionInput[];
}

export interface SimilarItem {
    itemId: string;
    similarity: number;
}

export interface ProductRecommendation {
    productId: string;
    recommendations: SimilarItem[];
}

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
