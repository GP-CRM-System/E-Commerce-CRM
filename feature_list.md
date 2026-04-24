# E-Commerce CRM Feature List

## Implemented Features

### 1. Authentication & Multi-Tenancy (Better Auth)

| Feature | Description | Status |
|---------|-------------|--------|
| Email/Password Sign-up | User registration with email verification | ✅ |
| Email/Password Sign-in | User login with session management | ✅ |
| Password Reset | Forgot password flow with email | ✅ |
| Email Verification | Verify email address before login | ✅ |
| Social Login | Google OAuth integration | ✅ |
| Bearer Tokens | API token authentication | ✅ |
| Organization Creation | Users can create organizations | ✅ |
| Organization Invitations | Invite members via email | ✅ |
| Member Management | List, remove, update members | ✅ |
| Role Assignment | root/admin/member roles | ✅ |
| Organization Deletion | With data export requirement | ✅ |

### API Endpoints
- `POST /api/auth/sign-up` - Register new user
- `POST /api/auth/sign-in` - Login
- `POST /api/auth/sign-out` - Logout
- `GET /api/auth/session` - Get current session
- `POST /api/auth/verify-email` - Verify email
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password
- `GET /api/auth/oauth/google` - Google OAuth
- `GET /api/auth/me` - Get current user

### Organization API Endpoints
- `GET /api/auth/org` - List organizations
- `POST /api/auth/org` - Create organization
- `GET /api/auth/org/:id` - Get organization
- `PATCH /api/auth/org/:id` - Update organization
- `GET /api/auth/org/:id/member` - List members
- `DELETE /api/auth/org/:id/member/:mid` - Remove member
- `PATCH /api/auth/org/:id/member/:mid` - Update member role
- `GET /api/auth/org/:id/invitation` - List invitations
- `POST /api/auth/org/:id/invitation` - Create invitation
- `DELETE /api/auth/org/:id/invitation/:iid` - Revoke invitation
- `POST /api/auth/invitation/accept` - Accept invitation

---

### 2. Custom RBAC (Roles System)

| Feature | Description | Status |
|---------|-------------|--------|
| Permission List | View all available permissions | ✅ |
| Custom Roles | Create/update/delete custom roles | ✅ |
| Role Permissions | Assign granular permissions | ✅ |
| Default Roles | root, admin, member | ✅ |
| Permission Validation | Strict resource:action validation | ✅ |

### Available Permissions
```
customers:read, customers:write, customers:delete
orders:read, orders:write, orders:delete
products:read, products:write, products:delete
imports:read, imports:write, imports:delete
exports:read, exports:write, exports:delete
segments:read, segments:write, segments:delete
templates:read, templates:write, templates:delete
campaigns:read, campaigns:write, campaigns:delete
notifications:read, notifications:write, notifications:delete
integrations:read, integrations:write, integrations:delete
supportTickets:read, supportTickets:write, supportTickets:delete
reports:read
ac:read, ac:create, ac:update, ac:delete
conversations:read, conversations:write
```

### API Endpoints
- `GET /api/roles/permissions` - List all permissions
- `GET /api/roles` - List roles in org
- `GET /api/roles/:id` - Get role details
- `POST /api/roles` - Create custom role
- `PATCH /api/roles/:id` - Update role
- `DELETE /api/roles/:id` - Delete custom role

---

### 3. Customers

| Feature | Description | Status |
|---------|-------------|--------|
| Customer CRUD | Create, read, update, delete customers | ✅ |
| Customer Search/Filter | Filter by source, lifecycle, tags | ✅ |
| Customer Notes | Add/edit/delete notes | ✅ |
| Customer Events | Track activities | ✅ |
| Timeline | Event timeline | ✅ |
| RFM Analytics | Recency, Frequency, Monetary | ✅ |
| Lifecycle Stages | PROSPECT, LEAD, ONE_TIME, RETURNING, LOYAL, VIP, AT_RISK, CHURNED, WINBACK | ✅ |
| Customer Source | WEBSITE, SOCIAL, REFERRAL, ORGANIC, EMAIL, CAMPAIGN, OTHER | ✅ |
| Tags | Tag customers | ✅ |

### API Endpoints
- `GET /api/customers` - List customers (paginated, filtered)
- `POST /api/customers` - Create customer
- `GET /api/customers/:id` - Get customer
- `PATCH /api/customers/:id` - Update customer
- `DELETE /api/customers/:id` - Delete customer
- `GET /api/customers/:id/analytics` - Get RFM analytics
- `GET /api/customers/:id/timeline` - Get timeline
- `GET /api/customers/:id/notes` - List notes
- `POST /api/customers/:id/notes` - Create note
- `PATCH /api/customers/:id/notes/:noteId` - Update note
- `DELETE /api/customers/:id/notes/:noteId` - Delete note
- `GET /api/customers/:id/events` - List events
- `POST /api/customers/:id/events` - Create event
- `PATCH /api/customers/:id/events/:eventId` - Update event
- `DELETE /api/customers/:id/events/:eventId` - Delete event
- `GET /api/customers/analytics/compute` - Trigger RFM compute
- `GET /api/customers/analytics/rfm` - Get RFM stats

---

### 4. Products

| Feature | Description | Status |
|---------|-------------|--------|
| Product CRUD | Create, read, update, delete | ✅ |
| Product Variants | Size, color, etc. | ✅ |
| Inventory Tracking | Track stock levels | ✅ |
| SKU/Barcode | Product identification | ✅ |
| Category | Product categorization | ✅ |
| Shopify Sync | External ID sync | ✅ |

### API Endpoints
- `GET /api/products` - List products
- `POST /api/products` - Create product
- `GET /api/products/:id` - Get product
- `PATCH /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product
- `POST /api/products/:id/variants` - Add variant
- `PATCH /api/products/:id/variants/:variantId` - Update variant
- `DELETE /api/products/:id/variants/:variantId` - Delete variant

---

### 5. Orders

| Feature | Description | Status |
|---------|-------------|--------|
| Order CRUD | Create, read, update, delete | ✅ |
| Order Items | Link products to orders | ✅ |
| Payment Status | PENDING, PAID, FAILED, REFUNDED | ✅ |
| Shipping Status | PENDING, PROCESSING, SHIPPED, DELIVERED, CANCELLED | ✅ |
| Order Totals | Subtotal, tax, shipping, discount | ✅ |
| Invoice Generation | PDF invoice generation | ✅ |
| Shopify Sync | External order sync | ✅ |

### API Endpoints
- `GET /api/orders` - List orders
- `POST /api/orders` - Create order
- `GET /api/orders/:id` - Get order
- `PATCH /api/orders/:id` - Update order
- `DELETE /api/orders/:id` - Delete order
- `GET /api/orders/:id/invoice` - Generate invoice PDF

---

### 6. Imports (CSV/XLSX)

| Feature | Description | Status |
|---------|-------------|--------|
| File Upload | CSV and XLSX support | ✅ |
| Column Mapping | Map columns to DB fields | ✅ |
| Duplicate Handling | Create-only or upsert | ✅ |
| Batch Processing | Async via BullMQ | ✅ |
| Error Handling | Track row errors | ✅ |
| Rollback | Undo imports | ✅ |

### API Endpoints
- `GET /api/imports` - List import jobs
- `POST /api/imports` - Create import job
- `GET /api/imports/:id` - Get import status
- `GET /api/imports/:id/errors` - List errors
- `POST /api/imports/:id/rollback` - Rollback import

---

### 7. Exports

| Feature | Description | Status |
|---------|-------------|--------|
| Export Jobs | Async generation | ✅ |
| Column Selection | Choose columns | ✅ |
| Filters | Filter data | ✅ |
| CSV/XLSX | Output formats | ✅ |
| Download | Download files | ✅ |

### API Endpoints
- `GET /api/exports` - List export jobs
- `POST /api/exports` - Create export job
- `GET /api/exports/:id` - Get export status
- `GET /api/exports/:id/download` - Download file

---

### 8. Audit Logging

| Feature | Description | Status |
|---------|-------------|--------|
| Action Logging | Track CRUD operations | ✅ |
| User Attribution | Link to users | ✅ |
| Organization Scope | Per-org logs | ✅ |
| Target Tracking | Affected resources | ✅ |

### API Endpoints
- `GET /api/audit-logs` - List audit logs

---

### 9. Segments

| Feature | Description | Status |
|---------|-------------|--------|
| Dynamic Segments | Filter-based segments | ✅ |
| Segment Preview | Preview size | ✅ |
| Segment Count | Customer count | ✅ |
| Export Segment | Export to file | ✅ |

### API Endpoints
- `POST /api/segments` - Create segment
- `GET /api/segments` - List segments
- `GET /api/segments/:id` - Get segment
- `PATCH /api/segments/:id` - Update segment
- `DELETE /api/segments/:id` - Delete segment
- `GET /api/segments/:id/customers` - List segment customers
- `GET /api/segments/:id/count` - Get count
- `GET /api/segments/:id/preview` - Preview
- `POST /api/segments/:id/export` - Export

---

### 10. Email Templates

| Feature | Description | Status |
|---------|-------------|--------|
| Template CRUD | Create, read, update, delete | ✅ |
| HTML Templates | Handlebars variables | ✅ |
| Preview | Render preview | ✅ |

### API Endpoints
- `GET /api/templates` - List templates
- `POST /api/templates` - Create template
- `GET /api/templates/:id` - Get template
- `PATCH /api/templates/:id` - Update template
- `DELETE /api/templates/:id` - Delete template
- `GET /api/templates/:id/preview` - Preview

---

### 11. Campaigns

| Feature | Description | Status |
|---------|-------------|--------|
| Campaign CRUD | Create email campaigns | ✅ |
| Scheduling | Schedule send time | ✅ |
| Segment Targeting | Send to segment | ✅ |
| Send Now | Immediate send | ✅ |
| Metrics | Sent, opened, clicked | ✅ |
| Unsubscribe | One-click unsubscribe | ✅ |
| Open Tracking | 1x1 pixel | ✅ |
| Click Tracking | Redirect tracking | ✅ |

### API Endpoints
- `GET /api/campaigns` - List campaigns
- `POST /api/campaigns` - Create campaign
- `GET /api/campaigns/:id` - Get campaign
- `PATCH /api/campaigns/:id` - Update campaign
- `DELETE /api/campaigns/:id` - Delete campaign
- `POST /api/campaigns/:id/send` - Send
- `GET /api/campaigns/:id/stats` - Stats

### Tracking Endpoints
- `GET /api/track/open/:recipientId` - Track open
- `GET /api/track/click/:recipientId?url=...` - Track click
- `GET /api/unsubscribe/:token` - Unsubscribe

---

### 12. Messaging (WhatsApp/Facebook/Instagram)

| Feature | Description | Status |
|---------|-------------|--------|
| Conversations | Active conversations | ✅ |
| Messages | Send/receive | ✅ |
| Meta Webhooks | Handle incoming | ✅ |

### API Endpoints
- `GET /api/messaging/conversations` - List
- `GET /api/messaging/conversations/:id/messages` - Get messages
- `POST /api/messaging/conversations/:id/messages` - Send

### Webhook
- `POST /api/messaging/webhook` - Meta webhook

---

### 13. Integrations (Shopify)

| Feature | Description | Status |
|---------|-------------|--------|
| Shopify Connect | OAuth connection | ✅ |
| Webhook Registration | Register webhooks | ✅ |
| Webhook Handling | Process webhooks | ✅ |
| Full Sync | Full data sync | ✅ |
| Sync Logs | History tracking | ✅ |
| Test Connection | Verify connection | ✅ |

### API Endpoints
- `POST /api/integrations/shopify/connect` - Connect
- `GET /api/integrations` - List
- `GET /api/integrations/:id` - Get
- `PATCH /api/integrations/:id` - Update
- `DELETE /api/integrations/:id` - Delete
- `POST /api/integrations/:id/test-connection` - Test
- `POST /api/integrations/:id/webhooks/register` - Register

### Webhook Endpoints
- `POST /api/webhooks/shopify/:integrationId` - Shopify webhook
- `GET /api/webhooks/:integrationId/logs` - Logs

### Sync Endpoints
- `POST /api/integrations/:integrationId/sync/full` - Full sync
- `GET /api/integrations/:integrationId/sync/logs` - Logs

---

### 14. Support Tickets

| Feature | Description | Status |
|---------|-------------|--------|
| Ticket CRUD | Create, read, update | ✅ |
| Ticket Status | OPEN, PENDING, CLOSED | ✅ |
| Priority | LOW, MEDIUM, HIGH, URGENT | ✅ |
| Assignment | Assign to members | ✅ |
| Ticket Notes | Internal notes | ✅ |
| Customer Link | Link to customer | ✅ |
| Order Link | Link to order | ✅ |

### API Endpoints
- `GET /api/tickets` - List tickets
- `POST /api/tickets` - Create ticket
- `GET /api/tickets/:id` - Get ticket
- `PATCH /api/tickets/:id` - Update ticket
- `POST /api/tickets/:id/notes` - Add note

---

### 15. Payments

| Feature | Description | Status |
|---------|-------------|--------|
| Payment Init | Initialize (Fawry) | ✅ |
| Webhook Callback | Payment callback | ✅ |

### API Endpoints
- `POST /api/payments/initialize/:orderId` - Initialize
- `POST /api/payments/fawry/callback` - Callback

---

### 16. Notifications

| Feature | Description | Status |
|---------|-------------|--------|
| In-app Notifications | User notifications | ✅ |
| Read/Unread | Mark as read | ✅ |
| Mark All Read | Bulk mark | ✅ |

### API Endpoints
- `GET /api/notifications` - List
- `GET /api/notifications/unread-count` - Count
- `GET /api/notifications/:id` - Get
- `PATCH /api/notifications/:id/read` - Mark read
- `POST /api/notifications/mark-all-read` - Mark all
- `DELETE /api/notifications/:id` - Delete

---

### 17. Reports

| Feature | Description | Status |
|---------|-------------|--------|
| Dashboard Stats | Overview statistics | ✅ |

### API Endpoints
- `GET /api/reports/dashboard` - Dashboard

---

### 18. Cron Jobs

| Feature | Description | Status |
|---------|-------------|--------|
| RFM Compute | Compute scores | ✅ |
| Lifecycle Update | Update lifecycle | ✅ |
| VIP Detection | Identify VIPs | ✅ |
| Cleanup | Idempotency keys | ✅ |

### API Endpoints
- `POST /api/cron/rfm` - RFM job
- `POST /api/cron/lifecycle` - Lifecycle
- `POST /api/cron/vip` - VIP
- `POST /api/cron/cleanup/idempotency` - Cleanup

---

### 19. Health & Monitoring

| Feature | Description | Status |
|---------|-------------|--------|
| Health Check | Redis + PostgreSQL | ✅ |
| Sentry Integration | Error tracking | ✅ |

### API Endpoints
- `GET /api/health` - Health check

---

### 20. Documentation

| Feature | Description | Status |
|---------|-------------|--------|
| Scalar API Docs | Interactive at `/reference` | ✅ |
| OpenAPI Spec | Customer API spec | ✅ |
| Auth Docs | Better Auth docs | ✅ |

---

## Features To Be Implemented

### 1. Frontend Pages (Web UI)

| Feature | Description | Priority |
|---------|-------------|----------|
| Dashboard | Main dashboard with stats | High |
| Customers List | Paginated customer table | High |
| Customer Detail | Single customer view | High |
| Customer Create/Edit | Form for customer | High |
| Orders List | Paginated orders table | High |
| Order Detail | Single order view | High |
| Order Create/Edit | Form for order | High |
| Products List | Paginated products table | High |
| Product Detail | Single product view | High |
| Products Create/Edit | Form for product | High |
| Imports UI | Upload and map imports | Medium |
| Exports UI | Configure exports | Medium |
| Segments UI | Create/manage segments | Medium |
| Templates UI | Email template editor | Medium |
| Campaigns UI | Campaign manager | Medium |
| Reports/Dashboard | Analytics dashboard | Medium |
| Settings | Organization settings | Medium |
| Team Members | Member management | High |
| Roles Manager | Custom role editor | Medium |
| Integrations UI | Shopify setup | Medium |
| Tickets UI | Support ticket list | Low |

### 2. Additional Backend Features

| Feature | Description | Priority |
|---------|-------------|----------|
| Webhooks Management | UI for webhooks | Low |
| Analytics API | Advanced analytics | Medium |
| Bulk Operations | Bulk delete/update | Low |
| Data Import Templates | Pre-built templates | Low |
| SMS Notifications | Twilio integration | Low |
| Slack Integration | Slack notifications | Low |
| Recurring Orders | Subscription orders | Low |
| Price Lists | Multiple price lists | Low |
| Discount Codes | Promo codes | Low |
| Gift Cards | Gift card support | Low |
| Customer Groups | Group customers | Low |
| Product Categories | Category tree | Low |
| Inventory Alerts | Low stock alerts | Low |
| Multi-Warehouse | Warehouse tracking | Low |

### 3. Advanced Features

| Feature | Description | Priority |
|---------|-------------|----------|
| AI Suggestions | Customer AI recommendations | Low |
| Predictive Analytics | Churn prediction | Low |
| Marketing Automation | Workflow automation | Low |
| A/B Testing | Campaign testing | Low |
| Customer Portal | Self-service portal | Low |
| Live Chat | Real-time chat | Low |
| Knowledge Base | Help center | Low |

---

## Database Models Summary

### Implemented
- User, Session, Account, Verification
- Organization, Member, Invitation, OrganizationRole
- Customer, Note, Tag, Segment
- CustomerEvent, CustomerMetric, Interaction
- Product, ProductVariant
- Order, OrderItem, Transaction
- SupportTicket, TicketNote
- ImportJob, ImportJobError, ExportJob
- Integration, WebhookLog, SyncLog
- Campaign, EmailTemplate, CampaignRecipient
- Conversation, Message
- AuditLog, Notification