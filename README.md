# Briefly - An E-Commerce CRM

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=flat&logo=bun&logoColor=white)](https://bun.sh)
[![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=flat&logo=Prisma&logoColor=white)](https://prisma.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

A high-performance, multi-tenant CRM backend designed specifically for e-commerce businesses. Built with **Bun**, **Express**, **Prisma**, and **Better Auth**, it provides a robust foundation for customer lifecycle management, RFM analysis, and data migration.

> [!IMPORTANT]
> This is a backend repository. It provides a RESTful API for customer management, order tracking, and e-commerce integrations.

## Features

- **Multi-Tenant Architecture**: Robust organization and team management powered by [Better Auth](https://www.better-auth.com/).
- **E-Commerce Intelligence**: Built-in support for RFM scoring, churn risk analysis, and customer lifecycle tracking.
- **Flexible Data Operations**: High-speed import/export for CSV and XLSX files with customizable field mapping.
- **Shopify Integration**: Sync customers, products, and orders via webhooks and REST API.
- **Enterprise-Grade Auth**: OAuth support (Google), role-based access control (RBAC), and secure session management.
- **Audit Logging**: Track critical actions across the system for security and compliance.
- **Asynchronous Processing**: Background jobs for heavy tasks like large-scale data imports using [BullMQ](https://bullmq.io/).

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **Framework**: [Express.js](https://expressjs.com/)
- **Database**: [PostgreSQL](https://www.postgresql.org/) with [Prisma ORM](https://www.prisma.io/)
- **Authentication**: [Better Auth](https://www.better-auth.com/)
- **Background Jobs**: [BullMQ](https://bullmq.io/) (Redis)
- **Documentation**: OpenAPI 3.1 (Scalar), Mintlify
- **Monitoring**: [Sentry](https://sentry.io/)

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (v1.0.0 or higher)
- [PostgreSQL](https://www.postgresql.org/)
- [Redis](https://redis.io/) (for background jobs)

### Installation

1. Clone the repository:

    ```bash
    git clone https://github.com/seifsheikhelarab/E-Commerce-CRM.git
    cd E-Commerce-CRM
    ```

2. Install dependencies:

    ```bash
    bun install
    ```

3. Set up environment variables:

    ```bash
    cp .env.example .env
    # Edit .env with your database and auth credentials
    ```

4. Initialize the database:

    ```bash
    bun run generate
    prisma migrate dev
    bun run seed
    ```

### Development

Start the development server with hot-reload:

```bash
bun run dev
```

The API will be available at `http://localhost:3000`. You can access the API documentation at `http://localhost:3000/reference`.

## Documentation

- **API Reference**: `/reference` (Scalar - interactive OpenAPI docs, `src/openapi.json`)
- **Full Docs**: `/docs` (Mintlify - guides and tutorials; deploy via [mintlify.com/start](https://mintlify.com/start))

## Testing

Run the test suite using Bun's built-in test runner:

```bash
bun test
```

## Code Quality

Keep the codebase clean and consistent:

```bash
bun run lint    # Check for linting issues
bun run format  # Auto-fix formatting with Prettier
```

## Project Structure

```text
src/
├── api/             # Route handlers and controllers
│   ├── auth/        # Authentication (Better Auth)
│   ├── customers/   # Customer CRUD & Analytics
│   ├── orders/      # Order management
│   ├── products/    # Product management
│   ├── segments/    # Customer segmentation
│   ├── imports/     # CSV/XLSX import jobs
│   ├── exports/     # CSV/XLSX export jobs
│   ├── cron/        # Manual triggers for RFM/lifecycle
│   └── integrations/# Shopify/CRM integrations
├── config/          # Configuration (env, prisma, roles)
├── generated/       # Auto-generated Prisma client
├── middlewares/     # Auth, validation, and error handling
├── queues/          # BullMQ background workers
├── scripts/         # Seeding and utility scripts
└── utils/           # Shared utilities (logger, parser)
```

> [!TIP]
> For detailed architectural decisions and phase goals, check the `instructions/` directory.

---

## Future Phases (Out of Scope for v1.0)

The following features are planned for future releases but are **not included** in the current version:

### Phase 2-3: Customer Intelligence

- Advanced analytics dashboard with revenue metrics
- Custom report builder with Excel/PDF export
- Enhanced churn risk scoring rules

### Phase 4: Notifications & Real-time

- Internal notification center for alerts
- Email notifications via Resend/SMTP
- SSE/WebSocket for live updates

### Phase 5: Document Generation

- PDF invoice and receipt generation (PDFKit)
- Multi-language support (English/Arabic RTL)
- Customizable templates with organization branding

### Phase 6: Unified Messaging Hub

- Meta integration (Facebook, Instagram, WhatsApp)
- Conversation and message models
- Real-time chat inbox with templates

### Phase 7: Payments & Tracking

- Fawry payment gateway integration
- Google Analytics 4 server-side tracking
- Meta Pixel conversion events

### Phase 8: Support & Tasks

- SLA tracking for tickets
- Auto-assignment rules
- Enhanced audit log API

### Out of Scope (Permanently)

- E-commerce storefront (CRM manages customers only)
- Inventory management
- Shipping logistics
- Multi-currency support (EGP only)
- Mobile app (web-only in v1)
- White-label/reseller functionality
