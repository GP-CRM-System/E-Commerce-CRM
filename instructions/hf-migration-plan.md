# HF API Migration Plan

Replace local TypeScript AI engines (churn, segment, recommend) with a call to the Hugging Face model API at `https://mzidan1-brieflyai.hf.space/process`.

---

## Overview

| Current | Future |
|---------|--------|
| `churn.engine.ts` — local logistic regression via `models/churn_weights.json` | `hf.client.ts` — HTTP client to HF Spaces endpoint |
| `segment.engine.ts` — local K-Means via `ml-kmeans` | `csv.builder.ts` — builds master + catalog CSV from Prisma |
| `recommend.engine.ts` — local IBCF via `ml-distance` | Response mapped to existing DB schema |
| Engines called independently | Single HF API call returns all 3 result sets |

## HF API Contract

**Endpoint:** `POST https://mzidan1-brieflyai.hf.space/process`  
**Auth:** `Authorization: Bearer {HF_API_TOKEN}`  
**Body:** `multipart/form-data` with two CSV files:
- `master_file` — event-level interaction data (32 columns)
- `catalog_file` — product catalog (5 columns)

**Response:**
```json
{
  "training_threshold": 0.566,
  "churn_results": [{ "Customer_ID": "...", "Churn_Probability": 0.273 }],
  "segmentation_results": [{ "Customer_ID": "...", "Segment": 2, "Distance_to_Segment_0": 3.4, "Distance_to_Segment_1": 6.3, "Distance_to_Segment_2": 1.7 }],
  "ibcf_recommendations": { "item_0000": [{ "item_id": "...", "similarity": 0.49 }] }
}
```

## Phases

### Phase 1 — Prisma Schema Changes

**1a. New fields on `Customer` model** (fields the HF model expects that we lack):

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `age` | `Int?` | — | Customer age; filled during sync |
| `gender` | `String?` | — | 'male', 'female', or custom |
| `annualIncome` | `Float?` | — | Derived or synced |
| `region` | `String?` | — | Geographic region |
| `preferredCategory` | `String?` | — | Top product category |
| `subscriptionTier` | `String` | `"free"` | 'free', 'basic', 'premium' |
| `loyaltyPoints` | `Int` | `0` | Accumulated points |
| `emailOpenRate` | `Float?` | — | Rate 0-1 |
| `websiteVisitsLastMonth` | `Int?` | — | Visit count |
| `spendingScore` | `Float?` | — | 0-100 score |

**1b. New model `CustomerProductInteraction`** (tracks view/add_to_cart events):

```
model CustomerProductInteraction {
  id              String   @id @default(nanoid())
  customerId      String
  productId       String
  organizationId  String
  interactionType String   // 'view' | 'add_to_cart'
  rating          Float?
  device          String?
  sessionId       String?
  timeOfDay       String?
  createdAt       DateTime @default(now())

  customer     Customer     @relation(fields: [customerId], references: [id], onDelete: Cascade)
  product      Product      @relation(fields: [productId], references: [id], onDelete: Cascade)
  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([customerId])
  @@index([productId])
  @@index([organizationId])
  @@index([interactionType])
  @@index([createdAt])
  @@index([customerId, productId])
}
```

Purchase interactions come from `Order` + `OrderItem` (existing). The CSV builder UNIONs both sources.

### Phase 2 — Config & Env

- Add `HF_API_URL` and `HF_API_TOKEN` to `.env.example`, `.env`, `env.config.ts`
- Remove `churn_weights.json` path dependency

### Phase 3 — New Files

| File | Purpose |
|------|---------|
| `src/api/ai/hf.types.ts` | HF API request/response TypeScript types |
| `src/api/ai/hf.client.ts` | HTTP client — builds multipart, POSTs to HF, returns typed response |
| `src/api/ai/csv.builder.ts` | Builds master + catalog CSV strings from Prisma data |

`hf.client.ts`:
- `postToHfApi(masterCsv: string, catalogCsv: string): Promise<HfApiResponse>`
- Uses native `fetch`, constructs `FormData` with CSV blobs
- Error handling + timeout

`csv.builder.ts`:
- `buildMasterCsv(orgId)` — queries `OrderItem` (as purchase) + `CustomerProductInteraction` (view/add_to_cart) + joins `Customer` fields → CSV string
- `buildCatalogCsv(orgId)` — queries `Product` → CSV string
- Fills defaults for missing customer fields

### Phase 4 — Rewrite Existing Files

**`ai.service.ts`:**
- New `computeAllForOrganization(orgId)` replaces 3 independent engine calls:
  1. Build CSVs via `csv.builder.ts`
  2. Call HF API via `hf.client.ts`
  3. Persist:
     - Churn → upsert `CustomerMetric.churnProbability`, update `Customer.churnRiskScore` + `lifecycleStage`
     - Segmentation → store on `CustomerMetric` (new segment fields) or a new model
     - Recommendations → upsert `AiRecommendation`
- `computeChurnForOrganization()`, `computeSegmentsForOrganization()`, `computeRecommendationsForOrganization()` all delegate to `computeAllForOrganization()` and return appropriate subsets

**`ai.types.ts`:**
- Add HF response types
- Keep public-facing types unchanged (controller/test compatibility)

**`ai.controller.ts`** — No changes (same endpoints, same shapes)  
**`ai.router.ts`** — No changes  

**`ai.test.ts`:**
- Mock `hf.client.ts` instead of loading local weights
- Test CSV building
- Test response-to-DB mapping

### Phase 5 — Remove Old Files

| Delete |
|--------|
| `src/api/ai/churn.engine.ts` |
| `src/api/ai/segment.engine.ts` |
| `src/api/ai/recommend.engine.ts` |
| `models/churn_weights.json` |
| `ml-kmeans` and `ml-distance` from `package.json` deps |

### Phase 6 — Verification

```
bun format
bun run lint
bun run typecheck
bun test
```

Check `/api/ai/health` reports HF API availability.

## Data Mapping: Master CSV Columns

| CSV Column | Source | Default if missing |
|------------|--------|-------------------|
| `customer_id` | `Customer.id` | — |
| `item_id` | `Product.id` (for purchases: `OrderItem.productId`) | — |
| `item_category` | `Product.category` | `'general'` |
| `price` | `Product.price` / `OrderItem.price` | `0` |
| `brand` | `Product` (future field) | `'unknown'` |
| `tags` | `Product` (future field) | `''` |
| `rating` | `CustomerProductInteraction.rating` | empty |
| `interaction_type` | `'purchase'` from OrderItem, actual from CustomerProductInteraction | `'purchase'` |
| `timestamp` | `OrderItem.createdAt` / `CustomerProductInteraction.createdAt` | now |
| `device` | `CustomerProductInteraction.device` | `'desktop'` |
| `session_id` | `CustomerProductInteraction.sessionId` | `''` |
| `time_of_day` | derived from timestamp | random |
| `age` | `Customer.age` | `30` |
| `gender` | `Customer.gender` | `'unknown'` |
| `annual_income` | `Customer.annualIncome` | `totalSpent * 2` |
| `spending_score` | `Customer.spendingScore` or `Customer.engagementScore` | `50` |
| `total_purchases` | `Customer.totalOrders` | `0` |
| `avg_order_value` | `Customer.avgOrderValue` | `0` |
| `website_visits_last_month` | `Customer.websiteVisitsLastMonth` | `10` |
| `days_since_last_purchase` | computed from `Customer.lastOrderAt` | `999` |
| `email_open_rate` | `Customer.emailOpenRate` | `0.3` |
| `subscription_tier` | `Customer.subscriptionTier` | `'free'` |
| `region` | `Customer.region` | `'unknown'` |
| `preferred_category` | `Customer.preferredCategory` | `'general'` |
| `return_rate` | `Customer.cartAbandonmentRate` | `0` |
| `loyalty_points` | `Customer.loyaltyPoints` | `0` |
| `loyalty_member` | `Customer.isLoyaltyMember` | `'No'` |
| `browsing_frequency_per_week` | `Customer.browsingFrequency` | `0` |
| `satisfaction_score` | `Customer.satisfactionScore` | `5` |
| `engagement_score` | `Customer.engagementScore` | `50` |
| `age_group` | derived from `Customer.age` | `'unknown'` |
| `location` | `Customer.city` | `'unknown'` |
