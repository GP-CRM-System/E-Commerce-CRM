# Paymob Subscriptions & Payment Gateway Migration Plan

## Overview
This document outlines the implementation plan to migrate the system from Fawry to Paymob and consolidate payments under subscriptions by removing e-commerce order payments.

---

## Phase 1: Clean Up & Removal of E-Commerce Payments (`src/api/payments/`)
1. **Delete File System Directory:**
   - Remove `src/api/payments/` completely (including `fawry.service.ts`, `payment.controller.ts`, `payment.router.ts`, and `payment.test.ts`).
2. **Remove Route Registration:**
   - Modify `src/api/index.ts` to remove:
     - `import paymentRouter from './payments/payment.router.js';`
     - `router.use('/payments', paymentRouter);`
3. **Clean Up OpenAPI & References:**
   - Clean up payments routes from `src/openapi.json`.

---

## Phase 2: Database Schema Update & Generation
1. **Update `prisma/schema.prisma`:**
   - Replace the `fawryRefNo` column in `Subscription` model with `paymobSubscriptionId` and add `paymobPlanId` (for dynamic plans).
2. **Regenerate Prisma Client:**
   - Run `bun run generate` to apply schema changes to the generated Prisma client.

---

## Phase 3: Environment Configuration
Define the following variables in `src/config/env.config.ts` and `.env`:
* `PAYMOB_API_KEY`: API key for JWT generation.
* `PAYMOB_SECRET_KEY`: Secret key for Intention API.
* `PAYMOB_PUBLIC_KEY`: Public key for redirect checkout URLs.
* `PAYMOB_3DS_INTEGRATION_ID`: Card 3DS Integration ID.
* `PAYMOB_MOTO_INTEGRATION_ID`: MOTO Integration ID for renewals.
* `PAYMOB_BASE_URL`: Base API URL (e.g. `https://accept.paymob.com`).

---

## Phase 4: Migrate Subscriptions Service to Paymob
1. **Paymob Utility Client (`src/utils/paymob.util.ts`):**
   - Authentication token generator: `POST /api/auth/tokens`.
   - Subscription plan generator: `POST /api/acceptance/subscription-plans`.
2. **Subscriptions Service Update (`src/api/subscriptions/subscriptions.service.ts`):**
   - Map CRM plans to dynamic or static Paymob plans.
   - Update `activateSubscription()` to match `paymobSubscriptionId`.

---

## Phase 5: Update Checkout & Callback Endpoints
1. **Initialize Subscription Checkout:**
   - Use the **Intention API** (`POST /v1/intention/`) to create a subscription enrollment.
   - Redirect users to `https://accept.paymob.com/unifiedcheckout/?publicKey=<KEY>&clientSecret=<SECRET>`.
2. **Webhook Callback Handler:**
   - Handle callbacks on `/api/subscriptions/paymob/callback`.
   - Perform HMAC checksum validation to secure callback data.
   - Update database record on success.

---

## Phase 6: Testing & Quality Assurance
1. **Update Tests:**
   - Adapt `subscriptions.test.ts` to mock Paymob integration and check endpoint schemas.
2. **Verify Project Integration:**
   - Run ESLint, TSC, and all tests to confirm stability.
