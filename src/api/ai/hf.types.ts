export interface HfApiResponse {
    churn_results: HfChurnResult[];
    segmentation_results: HfSegmentResult[];
    ibcf_recommendations: HfRecommendation[];
    training_threshold: number;
}

export interface HfChurnResult {
    customer_id: string;
    churn_probability: number;
    risk_level: 'stable' | 'low' | 'high';
}

export interface HfSegmentResult {
    customer_id: string;
    segment: number;
    segment_name: string;
    distances: [number, number, number];
}

export interface HfRecommendation {
    product_id: string;
    recommendations: { item_id: string; similarity: number }[];
}

export interface CsvCustomerRow {
    customerId: string;
    age: number;
    gender: string;
    annualIncome: number;
    region: string;
    preferredCategory: string;
    subscriptionTier: string;
    loyaltyPoints: number;
    emailOpenRate: number;
    websiteVisitsLastMonth: number;
    spendingScore: number;
    totalPurchases: number;
    avgOrderValue: number;
    daysSinceLastPurchase: number;
    browsingFrequencyPerWeek: number;
    satisfactionScore: number;
    returnRate: number;
    engagementScore: number;
    cartAbandonmentRate: number;
    supportTicketsCount: number;
    priceSensitivityIndex: number;
    totalSpent: number;
    totalRefunded: number;
    lastSentimentScore: number;
    accountAgeMonths: number;
    isLoyaltyMember: boolean;
    avgDaysBetweenOrders: number;
    rfmRecency: number;
    rfmFrequency: number;
    rfmMonetary: number;
    lifecycleStage: string;
    churnRiskScore: number;
}

export interface CsvInteractionRow {
    userId: string;
    itemId: string;
    rating: number | null;
    interactionType: string;
    timestamp: string;
}
