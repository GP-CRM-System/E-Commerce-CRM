# E-Commerce CRM Data Schema Documentation

This document describes the input fields and data structures used in the E-Commerce CRM, based on the application's Zod schemas.

---

## Users & Authentication

Handled via Better Auth.

- **Name**: User's full name.
- **Email**: User's email address (verified).
- **Image**: Optional profile image URL.
- **Provider**: Supported login methods (Email/Password, Google).

---

## Organizations

The top-level entity representing a company or startup.

- **Name**: Organization's name.
- **Slug**: Unique identifier used in URLs (e.g., `my-company`).
- **Logo**: Optional organization logo URL.

---

## Custom Roles

Define granular access control for organization members.

- **Name**: Unique identifier (lowercase, numbers, and hyphens only).
- **Description**: Optional text describing the role's purpose (max 200 chars).
- **Permissions**: A record of resources and allowed actions:
    - **Resources**: `organization`, `member`, `invitation`, `team`, `customers`, `orders`, `products`, `segments`, `campaigns`, `tags`, etc.
    - **Actions**: `read`, `create`, `update`, `delete`, `write`.

---

## Customers

Detailed information about people who interact with the store.

- **Basic Information**:
    - **Name**: Full name (2-50 chars).
    - **Email**: Contact email address.
    - **Phone**: Contact phone number (11-13 digits).
    - **City**: Physical city.
    - **Address**: Full physical address.
- **CRM Fields**:
    - **Source**: Where the customer came from (`WEBSITE`, `SOCIAL`, `REFERRAL`, `ORGANIC`, `EMAIL`, `CAMPAIGN`, `OTHER`).
    - **Lifecycle Stage**: Current relationship status (`PROSPECT`, `ONE_TIME`, `RETURNING`, `LOYAL`, `VIP`, `AT_RISK`, `CHURNED`, `WINBACK`).
    - **External ID**: ID from external platforms (e.g., Shopify).
    - **Accepts Marketing**: Boolean flag for marketing consent.
- **Analytics Metrics** (Optional and can be calculated automatically):
    - **Total Orders**: Count of successful orders.
    - **Total Spent**: Sum of all order amounts.
    - **Total Refunded**: Sum of all refunds.
    - **Average Order Value (AOV)**: `Total Spent / Total Orders`.
    - **First/Last Order Date**: Timestamps of activity.
    - **RFM Metrics**: `rfmScore`, `rfmSegment` (e.g., "Champions", "About to Sleep").
    - **Churn Risk Score**: Probability of churn (0.0 to 1.0).
    - **Cohort Month**: The month the customer first made a purchase.

---

## Customer Notes

Internal annotations for specific customers.

- **Body**: The content of the note (non-empty).
- **Author**: Automatically assigned to the user who created the note.

---

## Customer Events

A history of significant customer actions.

- **Event Type**: `ORDER_PLACED`, `ORDER_SHIPPED`, `ORDER_DELIVERED`, `ORDER_CANCELLED`, `ORDER_REFUNDED`, `ORDER_RETURNED`.
- **Description**: Human-readable summary of what happened.
- **Source**: System or platform that triggered the event.
- **Metadata**: Additional JSON data related to the event.
- **Occurred At**: Timestamp of the event.

---

## Products

Items available for sale.

- **Name**: Product title (1-100 chars).
- **Price**: Base selling price.
- **Description**: Optional product details.
- **SKU**: Stock Keeping Unit.
- **Category**: Product category (e.g., "Electronics").
- **Image URL**: Public URL for the product image.
- **Barcode**: UPC/EAN/GTIN.
- **Weight & Unit**: Numeric weight and unit (`kg`, `g`, `lb`, `oz`).
- **Inventory**: Current stock level.
- **Status**: `active`, `draft`, `archived`.
- **External ID**: ID from external platforms.

---

## Product Variants

Specific versions of a product (e.g., Size: Large, Color: Red).

- **Name**: Variant name.
- **Price**: Variant-specific price.
- **SKU/Barcode/Weight**: Inherited or overridden from the main product.
- **Inventory**: Stock level for this specific variant.
- **Position**: Display order.
- **Options**: JSON data describing variant attributes (e.g., `{"Color": "Red", "Size": "L"}`).

---

## Orders

Transactions made by customers.

- **Statuses**:
    - **Shipping Status**: `PENDING`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELLED`.
    - **Payment Status**: `PENDING`, `PAID`, `FAILED`, `REFUNDED`.
    - **Fulfillment Status**: `unfulfilled`, `partial`, `fulfilled`.
- **Financials**:
    - **Subtotal**: Total before discounts/taxes.
    - **Discount Amount**: Value deducted from subtotal.
    - **Tax Amount**: Calculated tax.
    - **Shipping Amount**: Cost of delivery.
    - **Total Amount**: Final amount paid by customer.
    - **Refund Amount**: Amount returned to customer.
    - **Currency**: Currency code (e.g., `USD`, `EGP`).
- **Additional Data**:
    - **Note**: Customer or internal order note.
    - **Tags**: Comma-separated labels.
    - **Source**: Origin of the order (e.g., `web`, `pos`).
    - **Referring Site**: URL where the customer came from.
- **Order Items**:
    - **Product**: Reference to a Product.
    - **Quantity**: Number of units.
    - **Price**: Unit price at time of purchase.

---

## Segments

Dynamic groups of customers based on specific filters.

- **Name**: Segment title.
- **Description**: Optional summary of the segment's purpose.
- **Filter**: A complex set of conditions using:
    - **Fields**: Any Customer field or metric (e.g., `totalSpent`, `city`, `lastOrderAt`).
    - **Operators**: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `startsWith`, `endsWith`, `in`, `isNull`, etc.
    - **Logic**: `AND` / `OR` groups for complex filtering (max depth 5).

---

## Tags

Simple labels for categorization.

- **Name**: Tag label.
- **Color**: Visual indicator (hex code or name).

---

## Support Tickets

Customer inquiries and issues.

- **Subject**: Brief summary of the issue.
- **Description**: Full details of the inquiry.
- **Status**: `Open`, `Pending`, `Closed`.
- **Priority**: `low`, `medium`, `high`, `urgent`.
- **Customer/Order**: Links to the relevant customer and/or order.

---

## Audit Logs

Tracking system activity.

- **User**: The actor who performed the action.
- **Action**: What was done (e.g., `CREATE`, `UPDATE`, `DELETE`).
- **Target**: The resource affected (e.g., `Customer: 123`).
- **Time**: When the action occurred.
