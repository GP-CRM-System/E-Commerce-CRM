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
| Support Tickets               | ✅ Complete | Enhanced with internal notes & assignments     |
| Shopify Integration           | ✅ Complete | `src/api/integrations/*`                       |
| Webhook Handling              | ✅ Complete | `webhook.service.ts`                           |
| **Webhook Idempotency**       | ✅ Complete | `WebhookIdempotencyKey` model + deduplication  |
| Sync Engine                   | ✅ Complete | `sync.service.ts`                              |
| Audit Logs                    | ✅ Complete | `src/api/audit/*` API implemented              |
| Google OAuth                  | ✅ Complete | `src/api/auth/auth.ts`                         |
| Email/Password Auth           | ✅ Complete | With email verification                        |
| OTP Verification              | ✅ Complete | Auth-04 requirement                            |
| Organization Switching        | ✅ Complete | Users with multiple orgs can switch            |
| RBAC (root, admin, member)    | ✅ Complete | `src/config/roles.config.ts`                   |
| Dynamic Access Control        | ✅ Complete | `OrganizationRole` model                       |
| **Excel Import/Export**       | ✅ Complete | `src/api/import/*`, `src/api/export/*` (async) |
| **RFM Analysis**              | ✅ Complete | `rfm.queue.ts`, `rfm.processor.ts`             |
| **Lifecycle Stages**          | ✅ Complete | `lifecycle.service.ts`                         |
| Customer fields for RFM/Churn | ✅ Complete | Schema has fields (logic implemented)          |

---

## Roadmap & Phases

### Phase 1: Hardening & Excel Migration (CRITICAL)

**Goal**: Make the foundation reliable and enable business migration.

- ✅ Hardening: Added pagination, filtering, sorting, Redis rate limiting.
- ✅ Webhook Idempotency: Content-based hash deduplication.
- ✅ Import System: Excel/CSV parsing, batch processing, rollback support, duplicate detection.
- ✅ Export System: Custom columns, segment/date filtering, Excel/CSV support.

### Phase 2: Customer Intelligence (RFM & Analytics)

**Goal**: Turn raw data into actionable insights.

- ✅ RFM Analysis: Recency, Frequency, Monetary calculation via BullMQ.
- ✅ Churn Risk: Rule-based scoring (Low/Medium/High).
- ✅ CLV: Track lifetime value, total spent, and AOV.
- ✅ Lifecycle Stages: Automatic transitions (PROSPECT → VIP).
- ✅ Analytics API: RFM distribution and individual customer breakdowns.

### Phase 3: Actionable Segments

**Goal**: Group customers for targeted actions.

- ✅ Segment Management: CRUD with JSON filter blobs.
- ✅ Advanced Query Builder: Recursive AND/OR logic with 30+ fields and 12 operators.
- ✅ Segment Actions: Preview, count, and export by segment.

### Phase 4: Email Campaigns & Notifications

**Goal**: Targeted communication and internal alerting.

- ✅ Notification Center: Internal table for alerts.
- ✅ Outbound Alerts: Email notifications for critical events.
- ✅ Email Template Engine: Handlebars variables, full CRUD, live preview.
- ✅ Campaign Management: CRUD with segment snapshots, send pipeline (BullMQ), open/click tracking.
- ✅ Unsubscribe & Compliance: Signed JWT unsubscribe links.

### Phase 5: Customer Timeline & Document Gen

**Goal**: Full 360-degree view and professional output.

- ✅ Customer Timeline: Aggregated view of orders, events, notes, campaigns, and audit logs.
- ✅ PDF Service: Professional invoice generation via `pdfkit-table`.
- ✅ Automated Export: BullMQ jobs for generating large exports with file storage.

### Phase 6: Unified Messaging Hub (Meta Integration)

**Goal**: The "Beeper" experience—unified FB, Instagram, and WhatsApp.

- ✅ Messaging Schema: `Conversation` and `Message` models.
- ✅ Meta Webhook Gateway: Unified listener for WhatsApp/FB/IG with verification.
- ✅ Messaging API: Conversation history, send/receive functionality, Meta token config.

### Phase 7: External Services & Payments

**Goal**: Close the loop with payments and tracking.

- ✅ Payment Gateway (Fawry): Initialization, signature generation, and callback verification.
- ✅ Transaction Tracking: `Transaction` model linking orders to payment providers.

### Phase 8: Support, Tasks & Reporting

**Goal**: Operational efficiency and management trust.

- ✅ Enhanced Tickets: Assignment, internal notes, SLA tracking (lastResponseAt).
- ✅ Audit Log API: Complete visibility into system changes.
- ✅ Dashboard Stats: Revenue trends, growth metrics, and acquisition charts.

### Phase 9: Polish & Demo Prep

**Goal**: Ready for production/evaluation.

- ✅ Seed script: 500+ realistic records across all models (Direct Prisma + Better Auth).
- ✅ Type Safety: Verified `tsc` clean build across all new modules.
- ✅ Testing: 300+ integration tests passing.
