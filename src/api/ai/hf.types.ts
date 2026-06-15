export interface HfApiResponse {
    churn_results: HfChurnResult[];
    segmentation_results: HfSegmentResult[];
    ibcf_recommendations: Record<
        string,
        { item_id: string; similarity: number }[]
    >;
    training_threshold: number;
}

export interface HfChurnResult {
    Customer_ID: string;
    Churn_Probability: number;
}

export interface HfSegmentResult {
    Customer_ID: string;
    Segment: number;
}

export interface MasterCsvRow {
    customer_id: string;
    item_id: string;
    item_category: string;
    price: number;
    brand: string;
    tags: string;
    rating: number | '';
    interaction_type: string;
    timestamp: string;
    device: string;
    session_id: string;
    time_of_day: string;
    age: number;
    gender: string;
    annual_income: number;
    spending_score: number;
    total_purchases: number;
    avg_order_value: number;
    website_visits_last_month: number;
    days_since_last_purchase: number;
    email_open_rate: number;
    subscription_tier: string;
    region: string;
    preferred_category: string;
    return_rate: number;
    loyalty_points: number;
    loyalty_member: string;
    browsing_frequency_per_week: number;
    satisfaction_score: number;
    engagement_score: number;
    age_group: string;
    location: string;
}

export interface CatalogCsvRow {
    item_id: string;
    item_category: string;
    brand: string;
    price: number;
    tags: string;
}
