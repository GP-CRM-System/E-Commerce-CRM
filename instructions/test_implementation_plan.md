# Comprehensive Test Implementation Plan

This plan outlines the systematic improvement of the E-Commerce CRM testing suite to address critical gaps in response validation, input verification, and cross-tenant isolation.

## 1. Infrastructure Hardening

- [ ] **Auth Helpers**: Create `src/test/helpers/auth.ts` to centralize the `signUp` -> `createOrg` -> `setActiveOrg` -> `signIn` flow.
- [ ] **Teardown Standardization**: Implement consistent cleanup patterns to ensure a clean database state after every test run.
- [ ] **Dependency Management**: Replace outer `let` variables with explicit guards (e.g., `expect(id).toBeDefined()`) or independent setup per test suite.

## 2. Core API Testing Enhancements

### 2.1 Customer API (`customer.test.ts`)

- [ ] **Body Validation**: Verify the shape and exact values of response bodies, not just status codes.
- [ ] **Input Validation**: Add 400 error tests for missing required fields, invalid email formats, and out-of-range phone numbers.
- [ ] **Cross-Tenant Isolation**: Verify that User A cannot read or modify data belonging to User B's organization.
- [ ] **Cascading Deletes**: Implement and verify the `DELETE /api/customers/:id` flow, including related notes and events.

### 2.2 Analytics API (`analytics.test.ts`)

- [ ] **Value Assertions**: Verify that RFM scores, segments, and churn risks fall within expected ranges and match seeded data.
- [ ] **Idempotency**: Verify that multiple triggers of the analytics compute job do not produce duplicate jobs or errors.
- [ ] **Cross-Org Isolation**: Ensure analytics for a customer in Org A are inaccessible to users in Org B.

### 2.3 Lifecycle API (`lifecycle.test.ts`)

- [ ] **VIP Boundaries**: Test both promotion to and demotion from VIP status with exact threshold cases.
- [ ] **Transition Coverage**: Add tests for missing transitions (`ONE_TIME` -> `RETURNING`, `AT_RISK` -> `CHURNED`).
- [ ] **Event Emission**: Verify that a `CustomerEvent` record is created in the database after every successful lifecycle transition.

### 2.4 Roles API (`roles.test.ts`)

- [ ] **Remove Silent Skips**: Replace `if (!id) return` with explicit assertions to ensure setup failures are flagged.
- [ ] **Auth Coverage**: Add 401/403 tests for `PATCH` and `DELETE` endpoints.
- [ ] **Permission Schema**: Validate that creating roles with invalid permission keys or actions returns 400.

## 3. Global Quality Metrics

- [ ] **Pagination**: Verify `page`, `limit`, `total`, and `hasNextPage` logic across all list endpoints.
- [ ] **Rate Limiting**: Add integration tests that trigger and verify rate limit responses.
- [ ] **Error Contract**: Ensure all error responses follow the standard JSON structure defined in `structure.md`.
