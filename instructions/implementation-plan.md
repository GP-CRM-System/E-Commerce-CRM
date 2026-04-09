# E-Commerce CRM Implementation Plan

## Project Overview

This plan outlines the phased implementation of an E-Commerce CRM system designed as a local competitor to Shopify for small businesses in Egypt. The system supports local payment methods and addresses the needs of small businesses migrating from Excel-based tracking.

### Technology Stack

- **Runtime**: Bun + Express + TypeScript
- **ORM**: Prisma with PostgreSQL
- **Auth**: Better Auth with organization plugin
- **Validation**: Zod
- **Logging**: Pino + pino-pretty + pino-http
- **Background Jobs**: BullMQ + Redis

---

## Implemented Features

| Feature                       | Status      | Location                                       |
| :---------------------------- | :---------- | :--------------------------------------------- |
| Multi-tenancy                 | ✅ Complete | `src/api/auth/auth.ts`, `prisma/schema.prisma` |
| Customers (CRUD)              | ✅ Complete | `src/api/customers/*`                          |
| Products (CRUD)               | ✅ Complete | Model exists                                   |
| Orders (CRUD)                 | ✅ Complete | Model exists                                   |
| Segments                      | ✅ Complete | Model with JSON filters                        |
| **Segments API**              | ✅ Complete | `src/api/segments/*` with advanced filters     |
| Tags                          | ✅ Complete | Model exists                                   |
| Support Tickets               | ✅ Complete | Basic model                                    |
| Shopify Integration           | ✅ Complete | `src/api/integrations/*`                       |
| Webhook Handling              | ✅ Complete | `webhook.service.ts`                           |
| **Webhook Idempotency**       | ✅ Complete | `WebhookIdempotencyKey` model + deduplication  |
| Sync Engine                   | ✅ Complete | `sync.service.ts`                              |
| Audit Logs                    | ✅ Complete | Model exists                                   |
| Google OAuth                  | ✅ Complete | `src/api/auth/auth.ts`                         |
| Email/Password Auth           | ✅ Complete | With email verification                        |
| RBAC (root, admin, member)    | ✅ Complete | `src/config/roles.config.ts`                   |
| Dynamic Access Control        | ✅ Complete | `OrganizationRole` model                       |
| **Excel Import/Export**       | ✅ Complete | `src/api/import/*`, `src/api/export/*`         |
| **RFM Analysis**              | ✅ Complete | `rfm.queue.ts`, `rfm.processor.ts`             |
| **Lifecycle Stages**          | ✅ Complete | `lifecycle.service.ts`                         |
| Customer fields for RFM/Churn | ✅ Complete | Schema has fields (logic pending)              |

---

## Roadmap & Phases

### Phase 1: Hardening & Excel Migration (CRITICAL)

**Goal**: Make the foundation reliable and enable business migration.

- **1.1 Hardening**:
    - Add pagination, filtering, and sorting to all list endpoints.
    - Add rate limiting (Redis store).
    - ✅ Add webhook idempotency table + deduplication logic. (WebhookIdempotencyKey model + content-based hash)
- **1.2 Import System**:
    - ✅ Create `src/utils/parser.util.ts` for Excel/CSV parsing.
    - ✅ Implement `src/api/import/import.service.ts` with batch processing and rollback support.
- **1.3 Export System**:
    - ✅ Implement `src/api/export/export.service.ts` with custom column selection.

### Phase 2: Customer Intelligence (RFM & Analytics)

**Goal**: Turn raw data into actionable insights.

- **2.1 RFM Analysis**:
    - ✅ Recency, Frequency, Monetary calculation via BullMQ.
    - ✅ Update customer `rfmScore` and `rfmSegment`.
- **2.2 Churn Risk**:
    - Rule-based churn risk scoring (Low/Medium/High).
- **2.3 Lifecycle Stages**:
    - ✅ Automatic transitions: PROSPECT → ONE_TIME → RETURNING → LOYAL → VIP.
- **2.4 Analytics API**:
    - `GET /customers/analytics/rfm` (distribution).
    - `GET /customers/:id/analytics` (individual breakdown).

### Phase 3: Actionable Segments

**Goal**: Group customers for targeted actions.

- **3.1 Segment Management**:
    - ✅ CRUD for segments with JSON filter blobs.
    - ✅ `GET /segments/:id/customers` (dynamic list).
- **3.2 Shorthand Filtering**:
    - ✅ `GET /customers?segmentId=...` integration.
- **3.3 Advanced Query Builder**:
    - ✅ Recursive AND/OR logic with field whitelist (30+ fields)
    - ✅ Operators: eq, neq, gt, gte, lt, lte, contains, startsWith, endsWith, in, notIn, isNull
- **3.4 Segment Actions**:
    - ✅ `GET /segments/:id/preview` (customer preview)
    - ✅ `GET /segments/:id/count` (customer count)
    - ✅ `POST /segments/:id/export` (export segment customers)

### Phase 4: Notifications & Live Updates

**Goal**: Make the system feel alive.

- **4.1 Notification Center**:
    - Internal table for alerts (import finished, churn risk spike, etc.).
- **4.2 Outbound Alerts**:
    - Email notifications via Resend for critical churn alerts.
- **4.3 Real-time**:
    - Emit events from BullMQ to the UI.

### Phase 5: Customer Timeline & Document Gen

**Goal**: Full 360-degree view and professional output.

- **5.1 Customer Timeline**:
    - `GET /customers/:id/timeline` pulling from audit logs, orders, and lifecycle events.
- **5.2 PDF Service**:
    - Multi-language (EN/AR) Invoice and Receipt generation via `pdfkit`.
- **5.3 Automated Export**:
    - BullMQ job for generating large CSV exports with download links.

### Phase 6: Unified Messaging Hub (Meta Integration)

**Goal**: The "Beeper" experience—unified FB, Instagram, and WhatsApp.

- **6.1 Messaging Schema**:
    - `Conversation` and `Message` models (Meta Official APIs).
- **6.2 Meta Webhook Gateway**:
    - Unified listener with signature validation and payload normalization.
- **6.3 Messaging API**:
    - `GET /conversations`, `POST /messages/send`, `GET /history`.
    - Support for WhatsApp Templates.
- **6.4 Real-time Inbox**:
    - SSE or WebSockets for live chat updates.

### Phase 7: External Services & Payments

**Goal**: Close the loop with payments and tracking.

- **7.1 Payment Gateway (Fawry)**:
    - Initialize payments, handle refunds, and process webhooks.
- **7.2 Marketing Integrations**:
    - GA4 and Meta Pixel tracking snippets.
    - Server-side conversion events.

### Phase 8: Support, Tasks & Reporting

**Goal**: Operational efficiency and management trust.

- **8.1 Enhanced Tickets & Tasks**:
    - SLA tracking, auto-assignment, and related entity links.
- **8.2 Audit Log API**:
    - `GET /audit-logs` for accountability (who deleted what).
- **8.3 Dashboard & Custom Reports**:
    - Revenue metrics, acquisition trends, and Excel/PDF report exports.

### Phase 9: Polish & Demo Prep

**Goal**: Ready for production/evaluation.

- Seed script with 500+ realistic records.
- Complete OpenAPI spec synchronization.
- Postman collection and walkthrough documentation.

---

## Technical Notes

- **Architecture**: Feature-based (`src/api/<feature>`).
- **Convention**: All imports must use `.js` extension (ESM).
- **Multi-tenancy**: Strict `organizationId` filtering on every query.
- **Validation**: Zod schemas for all request bodies.
- **Testing**: Integration tests required for every new API module.
