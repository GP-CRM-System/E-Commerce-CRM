# E-Commerce CRM Implementation Plan

## Project Overview

This plan outlines the phased implementation of new features for the E-Commerce CRM system. The project uses:

- **Runtime**: Bun + Express + TypeScript
- **ORM**: Prisma with PostgreSQL
- **Auth**: Better Auth with organization plugin
- **Validation**: Zod

---

## Phase 1: Shopify Integration & Data Foundation (CRITICAL)

Shopify is the foundation - everything else (RFM, churn, segmentation) depends on having real order data.

### 1.1 Shopify Store Connection

- Create `Integration` model already exists in schema - expand with Shopify-specific fields
- Implement `shopify.service.ts`:
    - Store URL validation
    - API credentials storage (encrypted)
    - Connection testing
- Create OAuth-based Shopify app installation flow
- Add `integration.router.ts` and `integration.controller.ts`

### 1.2 Shopify Webhook Handling

- Implement `webhook.service.ts` with webhook signature verification
- Handle critical Shopify webhooks:
    - `orders/create` → Create/update Order, update Customer metrics
    - `orders/updated` → Sync order changes
    - `orders/paid` → Update payment status, trigger workflows
    - `customers/create` → Create Customer record
    - `customers/update` → Sync customer data
    - `customers/disable` → Mark customer as churned
    - `refunds/create` → Update refund totals
- Add webhook retry queue for failed processing
- Implement webhook event logging

### 1.3 Data Sync Engine

- Create `sync.service.ts`:
    - Full sync (initial bulk import)
    - Incremental sync (webhook-based real-time)
    - Manual sync trigger
- Sync customer data: contact info, addresses, order history
- Sync product catalog: variants, inventory, images
- Sync order data: line items, shipping, fulfillments

---

## Phase 2: Customer Intelligence & Scoring

### 2.1 RFM Analysis Engine

- Implement `rfm.service.ts`:
    - Recency: Days since last order
    - Frequency: Order count in period
    - Monetary: Total spent in period
    - Segment customers into RFM groups (Champions, Loyal, At Risk, etc.)
- Update customer fields: `rfmScore`, `rfmSegment`
- Add RFM-based segmentation triggers

### 2.2 Churn Risk Scoring

- Implement `churn.service.ts`:
    - Calculate avg days between orders
    - Compare last order date to expected next order
    - Score: Low/Medium/High risk
    - Trigger alerts for high-risk customers
- Update `churnRiskScore` field on Customer

### 2.3 Lifecycle Stage Management

- Implement `lifecycle.service.ts`:
    - PROSPECT: No purchase yet
    - ONE_TIME: 1 order
    - RETURNING: 2-4 orders
    - LOYAL: 5+ orders
    - VIP: Top 5% by LTV
    - AT_RISK: No purchase past expected
    - CHURNED: No purchase in 2x avg days
    - WINBACK: Reactivated churned customer
- Automatic stage transitions based on order events

### 2.4 Lead Scoring (Public Data Enrichment)

- Add `lead-score.service.ts`:
    - Combine RFM score + churn risk + engagement
    - Web scraping for public company data (LinkedIn, website)
    - Social proof indicators
- Score weighting system

---

## Phase 3: Market Segmentation

### 3.1 Dynamic Segment Engine

- Expand `Segment` model capabilities
- Implement `segment.service.ts`:
    - Rule-based segment definitions (JSON filter format)
    - Operators: equals, contains, greaterThan, between, etc.
    - Compound conditions with AND/OR
- Auto-populate segments on customer/order changes

### 3.2 Pre-built Segments

- High-Value Customers (LTV > threshold)
- At-Risk Customers
- New Customers (first order < 30 days)
- Inactive Customers (no order > X days)
- Campaign-responsive customers
- Power users (frequent buyers)

### 3.3 Segment Analytics

- Segment overlap analysis
- Segment size trends over time
- Revenue attribution per segment

---

## Phase 4: Data Import & Export

### 4.1 Excel/CSV Import System

- Create `src/utils/parser.util.ts` for Excel/CSV parsing (xlsx, csv-parse)
- Implement `import.service.ts`:
    - File upload handling with size limits
    - Column mapping interface
    - Data validation per entity type
    - Batch processing with progress tracking
    - Duplicate detection (by email, phone, external ID)
    - Error reporting per row with line numbers
    - Import history logging
- Importable entities: Customers, Products, Orders
- Support for mapping legacy fields to schema

### 4.2 PDF Generation

- Add `pdfkit` dependency
- Create `pdf.service.ts`:
    - Receipt PDF generation
    - Offer/Quote PDF with branding
    - Invoice PDF generation
    - Order packing slip
- Include company logo and styling

---

## Phase 5: Authentication Enhancements

### 5.1 OAuth Provider Expansion

- Add Microsoft OAuth alongside existing Google
- Add GitHub OAuth for developer-friendly auth
- Update `auth.ts` with social providers
- Update `.env` with new OAuth credentials

### 5.2 OTP-based Account Verification

- Implement OTP generation/validation service
- Add OTP model to Prisma schema
- Create verification endpoints (phone/email OTP)
- Rate limiting for OTP requests
- OTP expiry and retry logic

---

## Phase 6: Marketing & Campaigns

### 6.1 Campaign Management

- Expand `Campaign` model in Prisma schema:
    - Campaign type: email, sms, push
    - Status: draft, scheduled, active, paused, completed
    - Segment targeting
- Implement `campaign.service.ts`:
    - Campaign CRUD with templates
    - Schedule management
    - A/B testing support
    - Campaign analytics (sent, delivered, opened, clicked, converted)

### 6.2 Email/SMS Campaign Sending

- Create `email-campaign.service.ts`:
    - Template engine with variables
    - Mass sending with throttling (respect provider limits)
    - Unsubscribe list management
    - Bounce handling
- Add SMS integration stub (Twilio/Africa's Talking)
- Track campaign metrics

### 6.3 Social Media Analytics Integration

- Add social provider connection models
- Create `social-analytics.service.ts`:
    - Platform OAuth connections
    - Basic metrics: followers, engagement, reach
    - Post performance data import
    - Social proof scoring

---

## Phase 7: Support & Task Automation

### 7.1 Enhanced Ticket System

- Expand `SupportTicket` model:
    - Categories and subcategories
    - Internal notes
    - Time tracking
    - Resolution SLA tracking
- Implement `ticket.service.ts`:
    - Auto-assignment rules:
        - By ticket category
        - By priority level
        - By employee workload (round-robin or load-balanced)
    - Escalation workflows
    - Ticket templates
- Add customer self-service portal endpoints

### 7.2 Task Automation System

- Create `Task` model in Prisma schema:
    - Title, description, due date
    - Assigned user, priority
    - Status: todo, in_progress, completed
    - Related entity (customer, order, ticket)
- Implement `task.service.ts`:
    - Auto-task creation rules:
        - New customer → onboarding task
        - High-value order → thank you task
        - Churned customer → winback task
        - Overdue support ticket → escalation task
    - Task assignment algorithms (score-based, workload-balanced)
    - Task templates library
    - Due date reminders

---

## Phase 8: Payments

### 8.1 Payment Provider Integration

- Add `Payment` model to schema
- Implement `payment.service.ts`:
    - Provider abstraction (Stripe, Paystack)
    - Payment processing
    - Refund handling
    - Payment webhook handlers
- Add payment method management

### 8.2 Transaction History

- Expand Order model with payment details
- Payment timeline per order
- Revenue reporting endpoints

---

## Phase 9: Organization & Admin

### 9.1 Organization Settings

- Add organization settings model
- Organization profile management API
- Branding: logo, colors, email templates

### 9.2 Audit Logging System

- Implement `audit-log.service.ts`
- Create audit log API:
    - Filter by user, action, target type, date range
    - Export capability
- Log critical actions:
    - Customer operations
    - Order status changes
    - Support ticket updates
    - Member management
    - Integration changes

### 9.3 Role & Permission Refinements

- Expand RBAC with custom role creation
- Permission categories per feature
- Role-based feature flags

---

## Cron Jobs & Scheduled Tasks

These are NOT automatic side effects - they must be explicitly implemented and scheduled.

### Nightly Processing (2 AM UTC)

```
┌─────────────────────────────────────────────────────────────┐
│  nightly-recalculate.sh                                     │
├─────────────────────────────────────────────────────────────┤
│  1. Lifecycle Stage Recalculation                          │
│     - For all customers, recalculate lifecycle stage        │
│     - Handle stage transitions                             │
│                                                             │
│  2. Churn Risk Scoring                                     │
│     - Update avgDaysBetweenOrders                          │
│     - Recalculate churnRiskScore for all customers         │
│     - Flag AT_RISK and CHURNED customers                   │
│                                                             │
│  3. RFM Score Updates                                      │
│     - Recalculate RFM scores (30/60/90 day windows)        │
│     - Update rfmSegment assignments                        │
│     - Identify segment changes                             │
│                                                             │
│  4. VIP Recalculation                                      │
│     - Identify top 5% by LTV                              │
│     - Update VIP status                                    │
│                                                             │
│  5. Cohort Analysis Update                                 │
│     - Assign cohortMonth to new customers                   │
│     - Update cohort retention metrics                       │
│                                                             │
│  6. Segment Membership Refresh                             │
│     - Re-evaluate all dynamic segments                      │
│     - Add/remove customers from segments                    │
└─────────────────────────────────────────────────────────────┘
```

### Weekly Processing (Sunday 3 AM UTC)

- Customer engagement scoring
- Campaign performance summary
- Support ticket SLA report
- Integration health check

### Monthly Processing (1st of month, 4 AM UTC)

- Cohort retention analysis
- Revenue attribution report
- Customer lifetime value recalculation

---

## Implementation Order Summary

| Phase | Focus                   | Features                                    | Priority     |
| ----- | ----------------------- | ------------------------------------------- | ------------ |
| **1** | **Shopify Integration** | Store connection, **Webhooks**, Data sync   | **CRITICAL** |
| **2** | Customer Intelligence   | RFM, Churn scoring, Lifecycle, Lead scoring | **High**     |
| **3** | Segmentation            | Dynamic segments, Pre-built, Analytics      | **High**     |
| **4** | Import/Export           | Excel/CSV import, PDF generation            | **Medium**   |
| **5** | Auth & Verification     | OAuth expansion, OTP                        | **Medium**   |
| **6** | Marketing               | Campaigns, Email/SMS, Social analytics      | **Medium**   |
| **7** | Support & Tasks         | Enhanced tickets, Task automation           | **Medium**   |
| **8** | Payments                | Provider integration, Transactions          | **Low**      |
| **9** | Admin                   | Organization settings, Audit logs, RBAC     | **Low**      |

**Parallel Track**: Cron jobs implemented alongside all phases, starting Phase 2.

---

## Critical Dependencies

```
Shopify Integration (Phase 1)
        │
        ▼
┌───────────────────┐
│   Order Data      │◄──── Webhooks (Phase 1)
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  Customer Metrics │◄──── Sync Engine (Phase 1)
│  - totalOrders    │
│  - totalSpent     │
│  - avgOrderValue  │
└───────────────────┘
        │
        ▼
┌───────────────────┐     ┌──────────────────┐
│  RFM Analysis     │────►│  Segmentation    │
│  (Phase 2)        │     │  (Phase 3)       │
└───────────────────┘     └──────────────────┘
        │
        ▼
┌───────────────────┐
│  Churn Scoring   │
│  (Phase 2)        │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  Lifecycle Stage │
│  (Phase 2)        │
└───────────────────┘
```

---

## Technical Notes

- Follow feature-based architecture from `instructions/structure.md`
- All imports must use `.js` extension (ESM)
- Use `asyncHandler` wrapper for controllers
- Validate all inputs with Zod schemas
- Filter all queries by `organizationId` for multi-tenancy
- Use `ResponseHandler` for consistent API responses
- Add OpenAPI specs for all new endpoints
- Shopify webhooks require HTTPS endpoint (use ngrok for dev)
- Cron jobs implemented as Bun scripts scheduled via cron or task scheduler
