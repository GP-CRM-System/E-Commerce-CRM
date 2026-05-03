# Shopify Integration Implementation Plan

This document outlines the architecture and step-by-step phases to connect the SaaS CRM to Shopify. The integration is built to act as a **Public Shopify App** utilizing the **latest Admin GraphQL API**, enabling robust background syncing of Products, Customers, and Orders to power comprehensive tenant metrics.

## Architecture Overview
The integration leverages Shopify's Admin GraphQL API alongside BullMQ for reliable, non-blocking background processing. It uses the existing Prisma `Integration` model for tenant authorization and the `rfm.queue.ts` for Customer Metric calculation (Recency, Frequency, Monetary).

---

## Phase 1: App Setup & OAuth Flow
To operate as a SaaS capable of servicing any Shopify store, we must implement a standard Public App OAuth flow.

1. **Shopify Partner Dashboard:** 
   - Register the Public App.
   - Obtain `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET`.
   - Configure redirect URIs and necessary permissions.
2. **OAuth Routes:**
   - `GET /api/integrations/shopify/auth`: Initiates the OAuth flow, redirecting the merchant to Shopify's consent screen.
   - `GET /api/integrations/shopify/callback`: Handles the redirect and exchanges the authorization code for an **offline access token**.
3. **Token Storage:**
   - Securely encrypt the `accessToken` and store it alongside the `shopDomain` in the `Integration` table under the tenant's `orgId`.
4. **Required Scopes:**
   - `read_customers`, `read_orders`, `read_products`, `read_inventory` (Read-only scopes are used to pull data for metrics).

## Phase 2: Historical Data Ingestion (Initial Sync)
Upon connection, the app must import the merchant's existing catalog and history. This process must not block or overload the CRM.

1. **Initial Sync Queue:** 
   - Immediately following successful OAuth, enqueue a job to a new BullMQ worker (`shopify-sync.queue.ts`).
2. **GraphQL Bulk Operations API:** 
   - Utilize Shopify's `bulkOperationRunQuery` mutation. This offloads the query to Shopify, which generates a JSONL file of all Products, Customers, and Orders, avoiding standard pagination limits and timeouts.
3. **Data Mapping Strategy:**
   - **Products:** Map Shopify data to `Product` and `ProductVariant`, capturing `externalId` and `shopifyVariantId`.
   - **Customers:** Map to `Customer` with `source = "SHOPIFY"`.
   - **Orders:** Map to `Order` and `OrderItem` (maintaining relations to synced Products).
4. **Sync Tracking:**
   - Track progress using the `SyncLog` Prisma model so the frontend can display a sync status (e.g., "Syncing historical data...").

## Phase 3: Real-Time Sync (Webhooks)
To keep CRM metrics perfectly up-to-date, we will subscribe to real-time events.

1. **Webhook Registration:** 
   - Automatically register necessary webhooks via the GraphQL API during the initial OAuth callback.
2. **Required Topics:**
   - `customers/create`, `customers/update`, `customers/delete`
   - `orders/create`, `orders/updated`, `orders/cancelled`, `orders/fulfilled`
   - `products/create`, `products/update`, `products/delete`
   - `app/uninstalled` (Crucial: to deactivate the integration if the merchant removes the app).
3. **Webhook Ingestion:** 
   - Extend `/api/integrations/webhook` to handle Shopify's HMAC validation to ensure payloads are authentic.
4. **Decoupled Processing:** 
   - Immediately return a `200 OK` to Shopify and push the payload to a `shopify-webhook.queue.ts` queue. This avoids webhook timeouts.

## Phase 4: Metrics Calculation & Analytics
With a fully synced database, the CRM can generate powerful, real-time insights.

1. **Event Dispatching:** 
   - When an order is processed (either historically or via webhook), enqueue a job to `rfm.queue.ts`.
2. **RFM Metrics:** 
   - Calculate and update Recency, Frequency, and Monetary values natively.
3. **Product-Level Metrics:** 
   - Since products are synced alongside orders, calculate aggregated metrics like "Total spent by category" or "Best-selling products".
4. **Customer Timeline:** 
   - Map Shopify order events to the `CustomerEvent` table (e.g., `eventType: 'order_placed', source: 'shopify'`) to populate the unified customer timeline.

## Phase 5: Resiliency & Scale
1. **Rate Limiting & Backoff:** 
   - Use `@shopify/shopify-api`'s built-in GraphQL client to automatically handle rate-limit retries. 
   - Apply BullMQ's exponential backoff for background queue jobs.
2. **Idempotency:** 
   - Because webhooks can fire multiple times for a single event, ensure database updates use `prisma.upsert` mapped on the Shopify `externalId` to prevent data duplication.
3. **Job Isolation:** 
   - Tune BullMQ concurrency to guarantee that a massive sync for one tenant does not block the real-time webhooks of other tenants.
4. **Audit Logging:** 
   - Push all integration lifecycle events (installed, uninstalled, sync failed) to the `AuditLog` table for complete tenant visibility.

## Phase 6: Storefront Behavioral Analytics (Web Pixels)
To track real-time customer behavior before checkout (like adding items to the cart or viewing products), we will build a Shopify Web Pixel App Extension.

1. **Extension Generation:**
   - Use Shopify CLI (`shopify app generate extension --template web_pixel`) to create an App Pixel extension within the app codebase.
2. **Access Scopes:**
   - Add `write_pixels` and `read_customer_events` to the app's access scopes to allow the Pixel to run and collect data.
3. **Pixel Registration & Subscription:**
   - Write the pixel script using the `@shopify/web-pixels-extension` library.
   - Subscribe to standard behavioral events like `product_added_to_cart`, `product_viewed`, `checkout_started`, and `page_viewed`.
4. **Data Ingestion API:**
   - Create a fast, unauthenticated ingestion endpoint in our CRM (`POST /api/integrations/shopify/pixel-ingest`).
   - The pixel will use `fetch()` to send event payloads to this endpoint as they happen.
5. **Timeline Integration:**
   - The ingestion route will map these behavioral events into the `CustomerEvent` table, populating the CRM's customer timeline with "Added to Cart" or "Viewed Product" actions, enabling advanced metrics like Cart Abandonment Rate.