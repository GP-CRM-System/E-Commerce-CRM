## Phase 4: Email Campaigns

---

### 4.1 — Template Engine

- Create `EmailTemplate` model with `name`, `subject`, `htmlBody`, `variables String[]`
- Implement `template.service.ts` that resolves handlebars-style variables
  (`{{customer.name}}`, `{{order.total}}`) against a customer/order context at send time
- Full CRUD API for templates
- Store declared variables list so the UI can render a live preview

**Libraries:** `handlebars` or `mustache`

---

### 4.2 — Recipient Resolution

- When a campaign is created it targets a `Segment`
- On send (or schedule), resolve the segment's `filter` JSON into a list of customer IDs
- Write a `CampaignRecipient` row for each — snapshot it, don't keep it live
- This decouples the list from the segment so late-joining customers aren't
  accidentally included after the campaign starts
- Always filter out `acceptsMarketing = false` customers at this stage

---

### 4.3 — Send Pipeline with BullMQ

- Never send mass email inside a request cycle
- On trigger, enqueue one BullMQ job per recipient
- Worker renders the template, calls email provider, updates `CampaignRecipient.status`
- Set concurrency limit + rate limiter on the queue to stay within provider limits

**New files:** `campaign-send.queue.ts`, `campaign-send.worker.ts`  
**Libraries:** `bullmq`, `resend` (recommended) or `nodemailer`

---

### 4.4 — Open & Click Tracking

- Inject a 1×1 tracking pixel into every outgoing email:
  `<img src="/track/open/:recipientId" width="1" height="1"/>`
- Wrap all links with a redirect endpoint:
  `/track/click/:recipientId?url=...` → logs click → 302 to destination
- Both endpoints update `CampaignRecipient.openedAt` / `clickedAt`
- Keep it a simple Express router, no heavy dependencies needed

**New files:** `tracking.router.ts`

---

### 4.5 — Unsubscribe & Compliance

- Every email must include a one-click unsubscribe link hitting `/unsubscribe/:token`
- Token should be a signed JWT so it works without the customer being logged in
- On hit: set `Customer.acceptsMarketing = false`, update recipient row to `UNSUBSCRIBED`
- This is not optional — required by CAN-SPAM and GDPR

**New files:** `unsubscribe.router.ts`  
**Libraries:** `jsonwebtoken`

---

### 4.6 — Campaign Analytics

Expose `GET /campaigns/:id/stats` returning:

```ts
{
  totalRecipients: number
  delivered:       number
  deliveryRate:    number  // delivered / total
  opened:          number
  openRate:        number  // opened / delivered
  clicked:         number
  clickRate:       number  // clicked / delivered
  unsubscribed:    number
  failed:          number
}
```

Compute at query time with a Prisma `groupBy` — no materialized view needed at this scale.

---

### Schema Additions

**Expand `Campaign`:**

```prisma
status         CampaignStatus   @default(DRAFT)
type           CampaignType     @default(ONE_TIME)
segmentId      String?
templateId     String?
subject        String?
scheduledAt    DateTime?
sentAt         DateTime?
recipientCount Int              @default(0)
```

**New models:**

```prisma
model EmailTemplate {
  id             String       @id @default(nanoid())
  organizationId String
  name           String
  subject        String
  htmlBody       String
  variables      String[]     // ['customer.name', 'order.total']
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  organization   Organization @relation(...)
  campaigns      Campaign[]
}

model CampaignRecipient {
  id          String          @id @default(nanoid())
  campaignId  String
  customerId  String
  status      RecipientStatus @default(PENDING)
  sentAt      DateTime?
  openedAt    DateTime?
  clickedAt   DateTime?
  failReason  String?
  campaign    Campaign        @relation(...)
  customer    Customer        @relation(...)

  @@unique([campaignId, customerId])
  @@index([campaignId])
}
```

**New enums:**

```prisma
enum CampaignStatus {
  DRAFT
  SCHEDULED
  SENDING
  SENT
  CANCELLED
}

enum CampaignType {
  ONE_TIME
  AUTOMATED
  TRANSACTIONAL
}

enum RecipientStatus {
  PENDING
  SENT
  FAILED
  BOUNCED
  UNSUBSCRIBED
}
```

---

### Send Flow

```
Create campaign
  → attach template + segment
  → schedule or send now
  → resolve recipient snapshot
  → filter out unsubscribed
  → enqueue one BullMQ job per recipient
  → worker renders template + sends email
  → track opens and clicks
```

---

### File Structure

```
src/features/campaigns/
  campaign.router.ts
  campaign.controller.ts
  campaign.service.ts        ← CRUD + recipient resolution + stats
  campaign-send.queue.ts     ← BullMQ queue definition
  campaign-send.worker.ts    ← email rendering + sending
  tracking.router.ts         ← open pixel + click redirect
  unsubscribe.router.ts      ← one-click unsubscribe
src/features/templates/
  template.router.ts
  template.controller.ts
  template.service.ts        ← CRUD + variable rendering
```