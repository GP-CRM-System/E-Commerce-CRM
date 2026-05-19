<p align="center">
  <img src="public/logo.jpg" alt="Briefly Logo" width="120" height="120" />
</p>

# Briefly — An E-Commerce CRM

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=flat&logo=bun&logoColor=white)](https://bun.sh)
[![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=flat&logo=Prisma&logoColor=white)](https://prisma.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

Briefly is a high-performance, multi-tenant CRM backend engineered
specifically for e-commerce organizations. Powered by Bun, Express, Prisma, and
Better Auth, it provides a highly resilient, enterprise-grade core for customer
intelligence, automated Shopify synchronization, storefront event tracking, and
secure payment management.

<!-- prettier-ignore -->
> [!IMPORTANT]
> This is a headless backend repository. It exposes a fully documented,
> secure RESTful API, high-speed CSV/XLSX queues, and webhook receivers for
> third-party integrations.

---

## Features

### Multi-Tenant CRM Core
- **Enterprise Auth & RBAC**: Organization-level isolation, membership invite flows, custom roles, and fine-grained permissions powered by Better Auth.
- **Pre-Deletion Protection**: Organizations cannot be deleted without first exporting all tenant data, triggering automated admin notification emails.
- **Audit Logging**: Comprehensive internal ledger tracking critical security actions, data mutations, and export downloads.

### Real-Time Shopify Ecosystem
- **Custom OAuth Flow**: Secure app onboarding, access token encryption at rest, and automated API scope validation (`write_pixels` support built-in).
- **Auto-Syncing Pipeline**: REST API synchronization using link-header pagination, tracking syncing states (`pending` → `syncing` → `completed`/`failed`).
- **Resilient Webhook Receiver**: HMAC signature validation, 24-hour webhook deduplication (idempotency tracking), and BullMQ worker queue dispatch.
- **Storefront Web Pixels**: Storefront-based endpoint at `/api/integrations/shopify/pixel-ingest` for tracking events (`product_viewed`, `product_added_to_cart`, `checkout_started`, `page_viewed`) resolved via customer email.

### Customer Intelligence
- **RFM Analysis Engine**: Dynamic Recency, Frequency, and Monetary scoring running asynchronously on automated crons or manual endpoints.
- **Lifecycle Tracking & Churn Risk**: Automatic progression through customer lifecycle stages alongside real-time churn risk predictions.
- **Product-Level Analytics**: Rich endpoints analyzing best-selling products, category-wise revenue distribution, and specific customer category spend.

### Subscriptions & Payments
- **Paymob One-Time payments**: Subscription lifecycle managed via Paymob's Intention API, card checkout, and secure HMAC-SHA256 signature verification.
- **Automatic Status Management**: Sets subscriptions active, tracks expiration boundaries (30 or 365 days), and automatically applies plan limits.

### System Resiliency & Scale
- **BullMQ Queue System**: Heavy pipelines (imports, exports, Shopify sync, Shopify webhooks, RFM calculation) backed by persistent Redis queues.
- **Robust Failover Paths**: Automatic fallback gracefully routes critical processes to inline operations if Redis goes offline, backed by real-time Sentry alerting.
- **Backblaze B2 & Cloudflare Storage**: Seamless B2 storage integration for exports, producing signed download URLs, and triggering automated Cloudflare CDN cache purges.

---

## Tech Stack

| Component | Technology | Role |
| :--- | :--- | :--- |
| **Runtime** | [Bun](https://bun.sh) | High-speed JS/TS runtime & package manager |
| **Framework** | [Express](https://expressjs.com/) | RESTful API structure with strict TypeScript routing |
| **Database** | [PostgreSQL](https://www.postgresql.org/) & [Prisma](https://www.prisma.io/) | Relational storage and schema-first database client |
| **Auth** | [Better Auth](https://www.better-auth.com/) | Session, multi-tenant organizations, and Google OAuth |
| **Queuing** | [BullMQ](https://bullmq.io/) (Redis) | Concurrency-controlled, retry-backed background jobs |
| **Storage** | [Backblaze B2](https://www.backblaze.com/) & [Cloudflare](https://www.cloudflare.com/) | Secured export storage and asset CDN caching |
| **Payments** | [Paymob API](https://paymob.com/) | Intention-based subscription payment gateway |
| **Monitoring** | [Sentry](https://sentry.io/) | Operational exception monitoring and alerting |
| **Docs** | [Scalar](https://scalar.com/) | OpenAPI 3.1 rendering and technical writing guides |

---

## Getting Started

### Prerequisites

To run this backend, you must have the following runtimes and services running locally:
- **Bun** (v1.0.0 or higher)
- **PostgreSQL** (v14 or higher)
- **Redis** (v6 or higher, required for BullMQ queues)

### Installation

1. **Clone the Repository**
   ```bash
   git clone https://github.com/seifsheikhelarab/E-Commerce-CRM.git
   cd E-Commerce-CRM
   ```

2. **Install Dependencies**
   ```bash
   bun install
   ```

3. **Configure Environment Variables**
   Copy the template and fill in the required keys:
   ```bash
   cp .env.example .env
   ```
   Ensure you provide valid values for database URLs, Better Auth secrets, Paymob credentials, SMTP settings, Sentry DSNs, and B2 storage secrets.

4. **Prepare the Database**
   Generate the Prisma client, apply local migrations, and seed the default data:
   ```bash
   bun run generate
   bun run seed
   prisma migrate dev
   ```

---

## Script Reference

Manage the lifecycle of your CRM with the following predefined commands:

### Development & Verification
- `bun run dev`: Start the development server (hot-reload, requires Redis).
- `bun run lint`: Run ESLint to verify codebase code-style patterns.
- `bun run format`: Run Prettier formatting against the codebase.
- `bun test`: Run the full automated suite using Bun's native test runner.

### Production Execution
- `bun run build`: Prepares and compiles the application files.
- `bun run start`: Boots the production server.

---

## Project Structure

```text
src/
├── api/              # Route handlers and controller layers
│   ├── auth/         # Better Auth routers, adapters, and plugins
│   ├── customers/    # Customer CRUD, lifecycle updates, and RFM scores
│   ├── orders/       # E-Commerce order registers and mutations
│   ├── products/     # Product indexing and advanced analytics
│   ├── segments/     # Dynamic customer demographic segmentation
│   ├── imports/      # XLSX/CSV asynchronous queuing imports
│   ├── exports/      # XLSX/CSV asynchronous queuing exports
│   └── integrations/ # Shopify Web Pixel ingestion, REST sync, and webhooks
├── config/           # Centralized configuration (env, roles, prisma, limits)
├── generated/        # Auto-generated Prisma client classes
├── middlewares/      # Express authorization, validation, and error interceptors
├── queues/           # BullMQ queue creators and worker processes
├── scripts/          # Database seeding and migration utilities
└── utils/            # Helper utilities (B2, Cloudflare, Paymob, logger, email)
```
