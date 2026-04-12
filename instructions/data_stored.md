# Database Schema Documentation

This document describes the data stored in the E-Commerce CRM system.

---

## Authentication & Users

### User

Represents a user account in the system.

| Field           | Type     | Description                |
| :-------------- | :------- | :------------------------- |
| `id`            | String   | Unique identifier (nanoid) |
| `name`          | String   | User's full name           |
| `email`         | String   | User's email (unique)      |
| `emailVerified` | Boolean  | Whether email is verified  |
| `image`         | String?  | Avatar URL                 |
| `createdAt`     | DateTime | Account creation date      |
| `updatedAt`     | DateTime | Last update date           |

**Relations:**

- Sessions (one-to-many)
- Accounts (one-to-many) - OAuth providers
- Members (one-to-many) - Organization memberships
- Invitations (one-to-many) - Sent by user
- AuditLogs (one-to-many)
- Notes (one-to-many) - Author of customer notes

---

### Session

Active user sessions for authentication.

| Field                  | Type     | Description                 |
| :--------------------- | :------- | :-------------------------- |
| `id`                   | String   | Unique identifier           |
| `token`                | String   | Session token (unique)      |
| `expiresAt`            | DateTime | When session expires        |
| `userId`               | String   | Associated user             |
| `activeOrganizationId` | String?  | Current active organization |
| `ipAddress`            | String?  | Client IP                   |
| `userAgent`            | String?  | Client user agent           |

---

### Account

OAuth and password-based account credentials.

| Field                  | Type      | Description                            |
| :--------------------- | :-------- | :------------------------------------- |
| `id`                   | String    | Unique identifier                      |
| `accountId`            | String    | Provider's account ID                  |
| `providerId`           | String    | Provider name (google, facebook, etc.) |
| `userId`               | String    | Associated user                        |
| `accessToken`          | String?   | OAuth access token (encrypted)         |
| `refreshToken`         | String?   | OAuth refresh token (encrypted)        |
| `idToken`              | String?   | OAuth ID token                         |
| `accessTokenExpiresAt` | DateTime? | Token expiry                           |
| `password`             | String?   | Hashed password                        |
| `scope`                | String?   | OAuth scopes                           |

---

### Verification

Email/phone verification tokens.

| Field        | Type     | Description              |
| :----------- | :------- | :----------------------- |
| `id`         | String   | Unique identifier        |
| `identifier` | String   | Email or phone to verify |
| `value`      | String   | Verification code/token  |
| `expiresAt`  | DateTime | Expiry time              |

---

## Organizations & Membership

### Organization

A business/tenant in the multi-tenant system.

| Field       | Type     | Description                              |
| :---------- | :------- | :--------------------------------------- |
| `id`        | String   | Unique identifier                        |
| `name`      | String   | Organization name                        |
| `slug`      | String   | URL-friendly slug (unique)               |
| `logo`      | String?  | Logo URL                                 |
| `settings`  | JSON?    | { timezone, locale, currency, branding } |
| `createdAt` | DateTime | Creation date                            |

**Relations:**

- Members (one-to-many)
- Customers (one-to-many)
- Products (one-to-many)
- Orders (one-to-many)
- Segments (one-to-many)
- Campaigns (one-to-many)
- Tags (one-to-many)
- Integrations (one-to-many)
- SupportTickets (one-to-many)
- AuditLogs (one-to-many)
- Roles (one-to-many)

---

### Member

Links users to organizations with roles.

| Field            | Type     | Description                |
| :--------------- | :------- | :------------------------- |
| `id`             | String   | Unique identifier          |
| `organizationId` | String   | Organization               |
| `userId`         | String   | User                       |
| `role`           | String   | Role (root, admin, member) |
| `createdAt`      | DateTime | Join date                  |

**Unique constraint:** (userId, organizationId)

---

### OrganizationRole

Defines role permissions per organization (managed by Better Auth's dynamic access control).

| Field            | Type     | Description                                                      |
| :--------------- | :------- | :--------------------------------------------------------------- |
| `id`             | String   | Unique identifier                                                |
| `organizationId` | String   | Organization                                                     |
| `name`           | String   | Role name (owner, admin, member, custom)                         |
| `permissions`    | String[] | Array of permissions e.g., ['customers:read', 'customers:write'] |
| `createdAt`      | DateTime | Creation date                                                    |

**Unique constraint:** (organizationId, name)

---

### Invitation

Organization invitations sent to users.

| Field            | Type     | Description                |
| :--------------- | :------- | :------------------------- |
| `id`             | String   | Unique identifier          |
| `organizationId` | String   | Organization               |
| `email`          | String   | Invited email              |
| `role`           | String?  | Suggested role             |
| `status`         | String   | pending, accepted, expired |
| `expiresAt`      | DateTime | Invitation expiry          |
| `inviterId`      | String   | User who sent invite       |

---

## Customers

### Customer

Core customer entity with analytics fields.

| Field                  | Type      | Description                                                                 |
| :--------------------- | :-------- | :-------------------------------------------------------------------------- |
| `id`                   | String    | Unique identifier                                                           |
| `name`                 | String    | Customer name                                                               |
| `email`                | String?   | Email address                                                               |
| `phone`                | String?   | Phone number                                                                |
| `city`                 | String?   | City                                                                        |
| `address`              | String?   | Full address                                                                |
| `organizationId`       | String    | Owning organization                                                         |
| `source`               | Enum      | CustomerSource (WEBSITE, SOCIAL, REFERRAL, ORGANIC, EMAIL, CAMPAIGN, OTHER) |
| `lifecycleStage`       | Enum      | CustomerLifecycleStage                                                      |
| `externalId`           | String?   | External system ID (e.g., Shopify)                                          |
| `totalOrders`          | Int       | Total order count                                                           |
| `totalSpent`           | Decimal   | Total amount spent                                                          |
| `totalRefunded`        | Decimal   | Total refunded amount                                                       |
| `avgOrderValue`        | Decimal   | Average order value                                                         |
| `firstOrderAt`         | DateTime? | First order date                                                            |
| `lastOrderAt`          | DateTime? | Most recent order date                                                      |
| `avgDaysBetweenOrders` | Float?    | Average days between purchases                                              |
| `churnRiskScore`       | Float?    | 0-1 churn probability                                                       |
| `rfmScore`             | String?   | RFM composite score                                                         |
| `rfmSegment`           | String?   | RFM segment name                                                            |
| `cohortMonth`          | String?   | Cohort month (e.g., '2024-03')                                              |
| `acceptsMarketing`     | Boolean   | Opted into marketing                                                        |
| `lastSyncedAt`         | DateTime? | Last sync from external                                                     |
| `createdAt`            | DateTime  | Creation date                                                               |
| `updatedAt`            | DateTime  | Last update                                                                 |

**Relations:**

- Orders (one-to-many)
- Tags (many-to-many)
- Notes (one-to-many)
- CustomerEvents (one-to-many)
- SupportTickets (one-to-many)

---

### CustomerEvent

Tracks customer activities.

| Field         | Type     | Description                                               |
| :------------ | :------- | :-------------------------------------------------------- |
| `id`          | String   | Unique identifier                                         |
| `customerId`  | String   | Customer                                                  |
| `eventType`   | String   | Event type (order_placed, refund_issued, tag_added, etc.) |
| `description` | String   | Event description                                         |
| `metadata`    | JSON?    | Extra event data                                          |
| `source`      | String   | Source (shopify, manual, etc.)                            |
| `occurredAt`  | DateTime | When event occurred                                       |

---

### Note

Internal notes on customers.

| Field        | Type     | Description       |
| :----------- | :------- | :---------------- |
| `id`         | String   | Unique identifier |
| `customerId` | String   | Customer          |
| `authorId`   | String   | Author (User)     |
| `body`       | String   | Note content      |
| `createdAt`  | DateTime | Creation date     |
| `updatedAt`  | DateTime | Last update       |

---

### Tag

Customer tags for segmentation.

| Field            | Type   | Description         |
| :--------------- | :----- | :------------------ |
| `id`             | String | Unique identifier   |
| `name`           | String | Tag name            |
| `color`          | String | Hex color code      |
| `organizationId` | String | Owning organization |

**Unique constraint:** (organizationId, name)

---

### Segment

Customer segments with filter rules.

| Field            | Type     | Description                                                             |
| :--------------- | :------- | :---------------------------------------------------------------------- |
| `id`             | String   | Unique identifier                                                       |
| `name`           | String   | Segment name                                                            |
| `filter`         | JSON     | Filter rules (e.g., field: "totalSpent", operator: "gt", value: 1000)   |
| `description`    | String?  | Segment description                                                     |
| `organizationId` | String   | Owning organization                                                     |
| `createdAt`      | DateTime | Creation date                                                           |
| `updatedAt`      | DateTime | Last update                                                             |

**Unique constraint:** (organizationId, name)

---

## Products

### Product

E-commerce products.

| Field              | Type      | Description                 |
| :----------------- | :-------- | :-------------------------- |
| `id`               | String    | Unique identifier           |
| `name`             | String    | Product name                |
| `price`            | Decimal   | Base price                  |
| `description`      | String?   | Product description         |
| `organizationId`   | String    | Owning organization         |
| `externalId`       | String?   | External system ID          |
| `sku`              | String?   | Stock keeping unit          |
| `category`         | String?   | Product category            |
| `imageUrl`         | String?   | Main image URL              |
| `barcode`          | String?   | Barcode/UPC                 |
| `weight`           | Float?    | Product weight              |
| `weightUnit`       | String?   | Weight unit (kg, lb, oz, g) |
| `inventory`        | Int       | Stock quantity              |
| `status`           | String    | active, draft, archived     |
| `shopifyProductId` | String?   | Shopify product ID          |
| `shopifyCreatedAt` | DateTime? | Shopify creation date       |
| `shopifyUpdatedAt` | DateTime? | Shopify update date         |
| `createdAt`        | DateTime  | Creation date               |
| `updatedAt`        | DateTime  | Last update                 |

**Relations:**

- Variants (one-to-many)
- OrderItems (one-to-many)

---

### ProductVariant

Product variations (size, color, etc.).

| Field              | Type    | Description                                    |
| :----------------- | :------ | :--------------------------------------------- |
| `id`               | String  | Unique identifier                              |
| `productId`        | String  | Parent product                                 |
| `name`             | String  | Variant name (e.g., "Small / Blue")            |
| `sku`              | String? | Variant SKU                                    |
| `price`            | Decimal | Variant price                                  |
| `barcode`          | String? | Barcode                                        |
| `weight`           | Float?  | Weight                                         |
| `weightUnit`       | String? | Weight unit                                    |
| `inventory`        | Int     | Stock quantity                                 |
| `position`         | Int     | Display order                                  |
| `imageUrl`         | String? | Variant image                                  |
| `externalId`       | String? | External ID                                    |
| `options`          | JSON?   | Options (e.g., (size: "Small", color: "Blue")) |
| `shopifyVariantId` | String? | Shopify variant ID                             |

---

## Orders

### Order

Customer orders.

| Field               | Type      | Description                                                         |
| :------------------ | :-------- | :------------------------------------------------------------------ |
| `id`                | String    | Unique identifier                                                   |
| `organizationId`    | String    | Owning organization                                                 |
| `customerId`        | String    | Customer                                                            |
| `shippingStatus`    | Enum      | ShippingStatus (PENDING, PROCESSING, SHIPPED, DELIVERED, CANCELLED) |
| `paymentStatus`     | Enum      | PaymentStatus (PENDING, PAID, FAILED, REFUNDED)                     |
| `externalId`        | String?   | External order ID                                                   |
| `subtotal`          | Decimal?  | Before discounts                                                    |
| `discountAmount`    | Decimal   | Total discount                                                      |
| `taxAmount`         | Decimal   | Tax amount                                                          |
| `shippingAmount`    | Decimal?  | Shipping cost                                                       |
| `totalAmount`       | Decimal   | Final total                                                         |
| `currency`          | String    | Currency code (default: USD)                                        |
| `refundAmount`      | Decimal   | Total refunded                                                      |
| `fulfillmentStatus` | String?   | unfulfilled, partial, fulfilled                                     |
| `fulfillmentItems`  | JSON?     | Fulfillment details                                                 |
| `shopifyOrderId`    | String?   | Shopify order ID                                                    |
| `shopifyCreatedAt`  | DateTime? | Shopify creation date                                               |
| `shopifyUpdatedAt`  | DateTime? | Shopify update date                                                 |
| `tags`              | String?   | Comma-separated tags                                                |
| `note`              | String?   | Order note                                                          |
| `source`            | String?   | Order source (web, pos, etc.)                                       |
| `referringSite`     | String?   | Traffic source                                                      |
| `createdAt`         | DateTime  | Order date                                                          |
| `updatedAt`         | DateTime  | Last update                                                         |

**Relations:**

- OrderItems (one-to-many)
- SupportTickets (one-to-many)

---

### OrderItem

Line items in an order.

| Field       | Type     | Description                 |
| :---------- | :------- | :-------------------------- |
| `id`        | String   | Unique identifier           |
| `orderId`   | String   | Parent order                |
| `productId` | String   | Product                     |
| `quantity`  | Int      | Quantity ordered            |
| `price`     | Decimal  | Unit price at time of order |
| `createdAt` | DateTime | Creation date               |
| `updatedAt` | DateTime | Last update                 |

---

## Campaigns

### Campaign

Marketing campaigns.

| Field            | Type      | Description                                          |
| :--------------- | :-------- | :--------------------------------------------------- |
| `id`             | String    | Unique identifier                                    |
| `name`           | String    | Campaign name                                        |
| `description`    | String?   | Campaign description                                 |
| `organizationId` | String    | Owning organization                                  |
| `segmentId`      | String?   | Targeted segment ID                                  |
| `type`           | String    | Campaign type (email, sms)                           |
| `status`         | String    | Status (draft, scheduled, active, paused, completed) |
| `content`        | JSON?     | { subject, body, templateId }                        |
| `scheduledAt`    | DateTime? | Scheduled send time                                  |
| `sentAt`         | DateTime? | Actual send time                                     |
| `metrics`        | JSON?     | { sent, delivered, opened, clicked, converted }      |
| `createdAt`      | DateTime  | Creation date                                        |
| `updatedAt`      | DateTime  | Last update                                          |

---

## Support

### SupportTicket

Customer support tickets.

| Field            | Type     | Description                                       |
| :--------------- | :------- | :------------------------------------------------ |
| `id`             | String   | Unique identifier                                 |
| `organizationId` | String   | Owning organization                               |
| `customerId`     | String   | Related customer                                  |
| `orderId`        | String?  | Related order                                     |
| `subject`        | String   | Ticket subject                                    |
| `description`    | String   | Issue description                                 |
| `status`         | Enum     | SupportTicketStatus (OPEN, PENDING, CLOSED)       |
| `priority`       | Enum     | SupportTicketPriority (LOW, MEDIUM, HIGH, URGENT) |
| `createdAt`      | DateTime | Creation date                                     |
| `updatedAt`      | DateTime | Last update                                       |

---

## Integrations

### Integration

External service connections (Shopify, etc.).

| Field          | Type      | Description                     |
| :------------- | :-------- | :------------------------------ |
| `id`           | String    | Unique identifier               |
| `orgId`        | String    | Owning organization             |
| `provider`     | String    | Provider name (e.g., 'shopify') |
| `name`         | String?   | Display name                    |
| `shopDomain`   | String?   | Store domain                    |
| `accessToken`  | String    | API access token (encrypted)    |
| `refreshToken` | String?   | Refresh token (encrypted)       |
| `apiKey`       | String?   | API key (encrypted)             |
| `apiSecret`    | String?   | API secret (encrypted)          |
| `syncStatus`   | String    | pending, syncing, synced, error |
| `syncMode`     | String    | webhook, polling, manual        |
| `lastSyncedAt` | DateTime? | Last sync time                  |
| `isActive`     | Boolean   | Is connection active            |
| `metadata`     | JSON?     | Extra provider config           |
| `createdAt`    | DateTime  | Creation date                   |
| `updatedAt`    | DateTime  | Last update                     |

**Relations:**

- WebhookLogs (one-to-many)
- SyncLogs (one-to-many)

---

### WebhookLog

Log of incoming webhooks.

| Field           | Type      | Description                             |
| :-------------- | :-------- | :-------------------------------------- |
| `id`            | String    | Unique identifier                       |
| `integrationId` | String    | Integration                             |
| `topic`         | String    | Webhook topic (orders/create, etc.)     |
| `shopDomain`    | String    | Source store                            |
| `webhookId`     | String?   | Provider's webhook ID                   |
| `payload`       | JSON      | Webhook data                            |
| `headers`       | JSON?     | Request headers                         |
| `status`        | String    | received, processing, completed, failed |
| `errorMessage`  | String?   | Error if failed                         |
| `retryCount`    | Int       | Retry attempts                          |
| `processedAt`   | DateTime? | Processing completion                   |
| `createdAt`     | DateTime  | Received time                           |

---

### SyncLog

Log of sync operations.

| Field            | Type      | Description                 |
| :--------------- | :-------- | :-------------------------- |
| `id`             | String    | Unique identifier           |
| `integrationId`  | String    | Integration                 |
| `syncType`       | String    | full, incremental, manual   |
| `entityType`     | String    | customers, orders, products |
| `status`         | String    | started, completed, failed  |
| `itemsProcessed` | Int       | Total processed             |
| `itemsCreated`   | Int       | New items                   |
| `itemsUpdated`   | Int       | Updated items               |
| `itemsFailed`    | Int       | Failed items                |
| `errorMessage`   | String?   | Error if failed             |
| `startedAt`      | DateTime  | Start time                  |
| `completedAt`    | DateTime? | Completion time             |

---

## Audit & Logging

### AuditLog

Tracks user actions for compliance.

| Field            | Type     | Description               |
| :--------------- | :------- | :------------------------ |
| `id`             | String   | Unique identifier         |
| `organizationId` | String   | Organization              |
| `userId`         | String   | User who performed action |
| `action`         | String   | Action performed          |
| `targetId`       | String   | Target entity ID          |
| `targetType`     | String   | Target entity type        |
| `createdAt`      | DateTime | Action timestamp          |
| `updatedAt`      | DateTime | Last update               |

---

## Enums

### CustomerSource

- WEBSITE
- SOCIAL
- REFERRAL
- ORGANIC
- EMAIL
- CAMPAIGN
- OTHER

### CustomerLifecycleStage

- PROSPECT (No purchase yet)
- ONE_TIME (1 order)
- RETURNING (2-4 orders)
- LOYAL (5+ orders)
- VIP (Top 5% by LTV)
- AT_RISK (No purchase past expected)
- CHURNED (No purchase in 2x average)
- WINBACK (Reactivated churned)

### ShippingStatus

- PENDING
- PROCESSING
- SHIPPED
- DELIVERED
- CANCELLED

### PaymentStatus

- PENDING
- PAID
- FAILED
- REFUNDED

### SupportTicketStatus

- OPEN
- PENDING
- CLOSED

### SupportTicketPriority

- LOW
- MEDIUM
- HIGH
- URGENT

---

## Relationships Overview

```md
Organization
├── Members (User ↔ Organization)
├── Roles (OrganizationRole)
├── Customers
│   ├── Orders
│   │   └── OrderItems → Products
│   ├── Notes (User is author)
│   ├── Tags
│   └── CustomerEvents
├── Products
│   └── ProductVariants
├── Segments
├── Campaigns
├── Tags
├── Integrations
│   ├── WebhookLogs
│   └── SyncLogs
├── SupportTickets
└── AuditLogs (User is actor)
```

---

## Database Indexes

The schema includes indexes for common query patterns:

| Model          | Indexes                                                        |
| :------------- | :------------------------------------------------------------- |
| User           | email (unique)                                                 |
| Session        | token (unique), userId                                         |
| Account        | userId                                                         |
| Verification   | identifier                                                     |
| Member         | userId, organizationId, (userId, organizationId) unique        |
| Invitation     | organizationId, email                                          |
| Customer       | organizationId, email, lifecycleStage, rfmSegment, lastOrderAt |
| CustomerEvent  | customerId, eventType, occurredAt                              |
| Tag            | organizationId, (organizationId, name) unique                  |
| Segment        | organizationId, (organizationId, name) unique                  |
| Product        | organizationId, externalId, shopifyProductId                   |
| ProductVariant | productId                                                      |
| Order          | organizationId, customerId, externalId, shopifyOrderId         |
| Campaign       | organizationId, status                                         |
| Integration    | orgId, provider                                                |
| WebhookLog     | integrationId, topic, status, createdAt                        |
| SyncLog        | integrationId, syncType, status                                |
| SupportTicket  | organizationId                                                 |
| AuditLog       | organizationId, userId                                         |

---

## Pending Models

These models are planned but not yet in the schema:

### Payment (Planned)

For Fawry payment gateway integration:

| Field           | Type     | Description                          |
| :-------------- | :------- | :----------------------------------- |
| `id`            | String   | Unique identifier                    |
| `orderId`       | String   | Related order                        |
| `amount`        | Decimal  | Payment amount                       |
| `currency`      | String   | Currency (default: EGP)              |
| `status`        | String   | pending, completed, failed, refunded |
| `method`        | String   | fawry, card, wallet                  |
| `transactionId` | String?  | Provider's transaction ID            |
| `webhookData`   | JSON?    | Callback data                        |
| `createdAt`     | DateTime | Payment initiation time              |
| `updatedAt`     | DateTime | Last update                          |
