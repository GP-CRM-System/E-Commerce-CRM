# Customer Lifecycle Configuration Guide

This guide explains how the customer lifecycle management system works and how to configure thresholds.

## Overview

The CRM automatically tracks customer lifecycle stages based on their behavior:

```
┌───────────┐     1st order     ┌───────────┐     2nd order     ┌───────────┐
│  PROSPECT │ ───────────────▶ │ ONE_TIME  │ ───────────────▶ │ RETURNING │
└───────────┘                  └───────────┘                  └───────────┘
                                                                    │
                                                                    │ 5+ orders
                                                                    ▼
┌───────────┐    No purchase     ┌───────────┐    No purchase     ┌───────────┐
│  CHURNED  │ ◀──────────────── │  AT_RISK  │ ◀──────────────── │   LOYAL   │
└───────────┘                  └───────────┘                  └───────────┘
     │                               │
     │ New purchase                 │ Churn risk ≥ 70%
     ▼                               ▼
┌───────────┐                  ┌───────────┐                  ┌───────────┐
│  WINBACK  │                  │  CHURNED  │                  │    VIP    │
└───────────┘                  └───────────┘                  │ (Top 5%)  │
                                                            └───────────┘
```

## Lifecycle Stages

| Stage       | Description                                              |
| ----------- | -------------------------------------------------------- |
| `PROSPECT`  | New customer, no orders yet                              |
| `ONE_TIME`  | Completed exactly 1 order                                |
| `RETURNING` | Completed 2-4 orders                                     |
| `LOYAL`     | Completed 5+ orders                                      |
| `VIP`       | Top 5% by total spending (LTV)                           |
| `AT_RISK`   | Churn risk score ≥ 70%                                   |
| `CHURNED`   | Exceeded 2x average days between orders without ordering |
| `WINBACK`   | Previously churned but made a new purchase               |

## How It Works

### Automatic Triggers

Lifecycle transitions are triggered automatically when:

1. **Order Created/Updated** (`src/api/orders/order.service.ts`):
    - Customer's order count and spending are updated
    - RFM scores are recalculated via BullMQ queue
    - Lifecycle stage is evaluated

2. **VIP Calculation**:
    - Runs after every order
    - Customers in top 5% by `totalSpent` are promoted to VIP
    - Current VIPs not in top 5% are demoted to LOYAL

### Threshold Values

The system uses these hardcoded thresholds (`src/api/customers/lifecycle.service.ts`):

```typescript
export const LIFECYCLE_RULES = {
    ONE_TIME_THRESHOLD: 1, // Orders to move from PROSPECT → ONE_TIME
    RETURNING_THRESHOLD: 2, // Orders to move from ONE_TIME → RETURNING
    LOYAL_THRESHOLD: 5, // Orders to move from RETURNING → LOYAL
    VIP_PERCENTILE: 0.05, // Top 5% by LTV → VIP
    AT_RISK_THRESHOLD: 0.7, // Churn risk ≥ 0.7 → AT_RISK
    CHURN_MULTIPLIER: 2 // 2x avg days → CHURNED
};
```

## Manual Triggers (Cron Endpoints)

You can manually trigger lifecycle recalculations via API:

### POST /api/cron/rfm

Recalculate RFM scores for all customers.

```bash
curl -X POST http://localhost:3000/api/cron/rfm \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"organizationId": "YOUR_ORG_ID"}'
```

### POST /api/cron/lifecycle

Recalculate lifecycle stages for all customers.

```bash
curl -X POST http://localhost:3000/api/cron/lifecycle \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"organizationId": "YOUR_ORG_ID"}'
```

### POST /api/cron/vip

Recalculate VIP status (top 5% by LTV).

```bash
curl -X POST http://localhost:3000/api/cron/vip \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"organizationId": "YOUR_ORG_ID"}'
```

## Configuring Thresholds

### Step 1: Locate the Configuration File

Open `src/api/customers/lifecycle.service.ts`:

```typescript
export const LIFECYCLE_RULES = {
    ONE_TIME_THRESHOLD: 1,
    RETURNING_THRESHOLD: 2,
    LOYAL_THRESHOLD: 5,
    VIP_PERCENTILE: 0.05,
    AT_RISK_THRESHOLD: 0.7,
    CHURN_MULTIPLIER: 2
} as const;
```

### Step 2: Modify Values

Change the values to match your business requirements:

| Threshold             | Default | Example Change                       |
| --------------------- | ------- | ------------------------------------ |
| `ONE_TIME_THRESHOLD`  | 1       | 1 (no change)                        |
| `RETURNING_THRESHOLD` | 2       | 3 (need 3 orders for RETURNING)      |
| `LOYAL_THRESHOLD`     | 5       | 10 (need 10 orders for LOYAL)        |
| `VIP_PERCENTILE`      | 0.05    | 0.10 (top 10% for VIP)               |
| `AT_RISK_THRESHOLD`   | 0.7     | 0.5 (sooner identification)          |
| `CHURN_MULTIPLIER`    | 2       | 3 (allow 3x avg days before churned) |

### Step 3: Save and Restart

After modifying the file:

```bash
# Restart the server
bun run dev
```

### Step 4: Trigger Recalculation

Run the cron endpoints or wait for the next order to trigger automatic recalculation.

## Setting Up Nightly Cron Jobs

For automated nightly recalculations, set up a cron job on your server:

```bash
# Add to crontab (crontab -e)
# Run at 2 AM UTC daily
0 2 * * * curl -X POST http://localhost:3000/api/cron/rfm -H "Authorization: Bearer YOUR_ADMIN_TOKEN" -d '{"organizationId": "YOUR_ORG_ID"}'

# Run VIP recalculation daily
5 2 * * * curl -X POST http://localhost:3000/api/cron/vip -H "Authorization: Bearer YOUR_ADMIN_TOKEN" -d '{"organizationId": "YOUR_ORG_ID"}'
```

Or use a task scheduler like:

- **node-cron** for in-app scheduling
- **GitHub Actions** for external triggers
- **External services** like cron-job.org

## Testing Your Changes

### Unit Tests

```bash
bun test src/api/customers/lifecycle.service.test.ts
```

### Manual Verification

1. Create a test customer
2. Create orders and watch lifecycle transitions
3. Check customer data:

```bash
curl http://localhost:3000/api/customers/TEST_CUSTOMER_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Look for `lifecycleStage`, `churnRiskScore`, and `rfmSegment` fields.

## RFM Segmentation

RFM (Recency, Frequency, Monetary) scoring works alongside lifecycle:

| RFM Segment           | Description                   |
| --------------------- | ----------------------------- |
| `CHAMPIONS`           | Best customers (score ≥ 13)   |
| `LOYAL_CUSTOMERS`     | Recent, frequent buyers       |
| `POTENTIAL_LOYALISTS` | Recent, good monetary value   |
| `NEW_CUSTOMERS`       | Recent, but infrequent        |
| `AT_RISK`             | Low recency, high frequency   |
| `CANT_LOSE_THEM`      | Low recency, low frequency    |
| `LOST`                | Very low overall score        |
| `NEEDS_ATTENTION`     | Average across all dimensions |

## Customer Analytics

Get a customer's full analytics profile:

```bash
curl http://localhost:3000/api/customers/TEST_CUSTOMER_ID/analytics \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Returns:

- RFM score and segment
- Churn risk level (LOW/MEDIUM/HIGH)
- Total orders, spent, average order value
- Current lifecycle stage

## Troubleshooting

### Lifecycle not updating

1. Check Redis is running (required for BullMQ)
2. Check logs for RFM queue errors
3. Manually trigger `/api/cron/lifecycle`

### VIP not changing

1. Ensure orders are updating `totalSpent` correctly
2. Run `/api/cron/vip` manually
3. Check customer is not PROSPECT/LEAD (they cannot be VIP)

### Churn risk always null

1. Customer needs at least one order with `lastOrderAt`
2. RFM calculation requires `lastOrderAt` to be set
