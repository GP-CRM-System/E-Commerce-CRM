
# Implementation Plan — E-Commerce CRM

**Guiding principle:** Every phase should leave the app in a *demoable* state. Don't start phase 3 if phase 2 isn't working end-to-end.

---

## Phases

### Phase 1 — Hardening the Foundation (Week 1)

Before building new features, make what exists reliable.

- Add pagination, filtering, and sorting to all list endpoints (`/customers`, `/orders`, `/products`)
- Add rate limiting (`express-rate-limit` with Redis store)
- Add webhook idempotency table + deduplication logic
- Write `.env.example` if it doesn't exist
- Set up a basic test suite — at minimum happy-path integration tests for auth and customer CRUD

This phase isn't flashy but it's what separates a toy project from something that looks production-ready in a demo.

---

### Phase 2 — RFM & Analytics (Week 2)

This is the core value of a CRM. It needs to actually work and be visible.

- Implement RFM score computation (Recency, Frequency, Monetary) as a BullMQ job that runs on-demand or on a schedule
- Store computed scores on the `Customer` model with a `lastScoredAt` timestamp
- Add `GET /customers/analytics/rfm` returning score distribution
- Add `GET /customers/:id/analytics` returning that customer's RFM breakdown + lifecycle stage
- Add churn risk field (simple rule-based: customers who haven't ordered in X days and have high historical frequency)

---

### Phase 3 — Segments (Week 3)

Segments are what make RFM *actionable*, and they look great in a demo.

- `POST /segments` — create a named segment with a filter (e.g., RFM tier = "Champions", churn risk > 0.6)
- `GET /segments/:id/customers` — list customers in that segment (apply filter dynamically)
- Store segments in DB with a JSON filter blob per org
- Add `GET /customers?segmentId=...` shorthand

A demo flow of "create a Champions segment → see who's in it → export them" is very compelling to evaluators.

---

### Phase 4 — Notifications (Week 4)

Ties everything together and makes the system feel alive.

- `notifications` table: `(id, orgId, userId, type, message, read, createdAt)`
- Emit notifications from BullMQ jobs: import finished, RFM recalculated, churn risk spike detected
- `GET /notifications` + `PATCH /notifications/:id/read`
- Email notification for critical alerts via Resend (just churn risk is enough for the demo)

---

### Phase 5 — Customer Timeline & Export (Week 5)

Rounds out the customer profile and gives you a strong demo story per customer.

- Customer activity timeline: pull from audit log + orders + lifecycle changes, return as a sorted event list at `GET /customers/:id/timeline`
- `POST /segments/:id/export` — triggers a BullMQ job that generates a CSV of the segment and returns a download link
- `GET /jobs/:jobId/status` — poll endpoint for any async job (import or export)

---

### Phase 6 — Polish & Demo Prep (Week 6–7)

Don't skip this. A rough demo of a complete app beats a polished demo of half an app.

- Seed script with realistic data (at least 500 customers, varied order history) so RFM scores are meaningful on demo day
- OpenAPI docs fully updated to match all new endpoints
- Error messages cleaned up — no stack traces leaking, consistent error response shape
- Postman collection updated
- Record a short walkthrough video as backup in case of live demo issues

---

### What's intentionally excluded

- Shopify integration — list as future work
- Frontend — out of scope, Scalar docs + Postman is enough for a backend GP
- WooCommerce, email campaigns — future work

---

Want me to start with Phase 1 and give you the actual code for any of it?
