# Things to Keep in Mind

## Redis Health & Alerting

### Issue: Silent Fallback to Synchronous Processing

The import/export system has a fallback mechanism where if Redis (BullMQ) fails, jobs run synchronously. Currently:

- `isRedisAvailable` only checks if env vars exist, not actual connectivity (`src/config/redis.config.ts:8`)
- No health check before adding jobs to queue
- No logging when falling back to sync
- No alerting when Redis is unavailable

**Risk:** Large imports run synchronously → Vercel timeout without any notification.

**Required Fix:**

1. Add Redis connection test on startup (not just env var check)
2. Periodic health check with configurable interval
3. Warning logs when fallback occurs
4. Sentry alert or webhook notification when Redis is unavailable
5. `/health` endpoint exposing Redis status

**Files to modify:**

- `src/config/redis.config.ts` - Add actual connection test
- `src/api/imports/imports.service.ts` - Log fallback with severity
- `src/app.ts` - Add health check endpoint
- Consider: Add BullMQ error handlers that catch connection failures

---

## Export File Storage & Cleanup

### Issue: Local Filesystem Not Suitable for Production

Current state in `src/api/exports/exports.controller.ts`:

- Files stored in local `./temp/` directory (line 212-214)
- No cleanup - files persist forever
- Won't work on ephemeral filesystems (Vercel, Heroku)

**Required Fix:**

1. **Storage**: Use Backblaze B2 for file storage (S3-compatible, 10GB free)
2. **CDN + Signed URLs**: Use Cloudflare (free) for CDN and presigned URLs
3. **Upload**: After generating buffer, upload to B2 instead of `fs.writeFileSync`
4. **Download**: Generate Cloudflare signed URL for secure, time-limited downloads
5. **Cleanup**: Delete from B2 when job is deleted or expired

**Why B2 + Cloudflare:**

- 10GB free storage (Backblaze B2)
- Free Cloudflare CDN for fast downloads
- No egress fees between Cloudflare and B2
- S3-compatible API (use `@aws-sdk/client-s3`)
- Very reliable and truly free for small-medium use

**Files to modify:**

- `src/config/` - Add B2 config (env vars: B2_ACCESS_KEY, B2_SECRET_KEY, B2_BUCKET, B2_REGION, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN)
- `src/api/exports/exports.controller.ts` - Replace `fs.writeFileSync` with B2 upload
- `src/api/exports/exports.controller.ts` - Add B2 delete on cleanup
- Consider: scheduled cleanup for orphaned exports (e.g., older than 24 hours)

**Setup:**

1. Create Backblaze B2 bucket (public or with application key)
2. Create Cloudflare R2 bucket binding (or use Workers for presigned URLs)
3. Configure lifecycle rules on B2 to auto-delete old files

**Example upload pattern:**

```typescript
import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.dev`,
    credentials: {
        accessKeyId: process.env.B2_ACCESS_KEY,
        secretAccessKey: process.env.B2_SECRET_KEY
    }
});

// Upload
await s3.send(
    new PutObjectCommand({
        Bucket: 'exports',
        Key: `export-${jobId}.csv`,
        Body: buffer
    })
);

// Get signed URL (Cloudflare R2 style)
const url = await getSignedUrl(
    s3,
    new GetObjectCommand({
        Bucket: 'exports',
        Key: `export-${jobId}.csv`
    }),
    { expiresIn: 3600 }
); // 1 hour
```

**Security Model: Org-Member-Only Access**

Use S3 wrapper + Cloudflare Worker for per-request org membership validation:

```
User → GET /download/:id → API (validates session + org membership)
                              ↓
                         Generate signed URL (15 min expiry) + short-lived token
                              ↓
                         User → Cloudflare Worker → Validates token + org membership → Serves from B2
```

**Key security properties:**

- Short expiry (15 min) limits exposure window if URL is shared/cached
- Worker validates current org membership on every request (not just token)
- Former team members cannot download even with cached signed URL
- B2 bucket remains private (no public access)

**Implementation:**

1. `/download/:id` endpoint:
    - Validates session
    - Checks `organizationId` matches job's org
    - Generates signed URL with 15-min expiry
    - Returns URL + token

2. Cloudflare Worker (or API endpoint proxy):
    - Validates token signature
    - Re-checks org membership from DB/session
    - Serves file from B2 if authorized

**Fallback if B2/Cloudflare down:** Return error with clear message. Exports cannot gracefully degrade.

---

## Org Deletion & Data Retention

### Current State

Everything is hard deleted on org cancellation. No data retention.

### Risk

Hard delete without any safety net creates legal and business risks:

- Legal: Subpoenas, tax audits, contract disputes require historical data
- Business continuity: Accidental deletion, customer disputes, chargebacks
- GDPR: Right to deletion ✅ handled, but Right to portability ❌ missing

### Recommended Fix: Pre-Deletion Export Requirement

Before an org can be deleted, require data export:

1. Generate full export (customers, orders, products as CSV/JSON)
2. Email download link to org owner
3. Require confirmation before hard delete

**Workflow:**

```
Admin initiates deletion → System generates export → Email link to owner →
→ 7-day download window → Confirmed deletion → Hard delete
```

**Optional enhancements (Phase 2):**

- 30-day soft delete grace period with restore option
- Legal hold flag to block deletion for flagged orgs
- Audit log retention (metadata only, no PII)

**Files to modify:**

- `src/api/organizations/organization.service.ts` or similar
- Add `DELETE /organizations/:id` flow with pre-check export
- Email service for sending export download link
- Consider adding `deletedAt` field to Organization model for soft delete

---

## Deployment: Oracle Cloud Always Free

### Why Oracle Cloud

Free forever. No credit card required for the Always Free tier. Genuine cost zero for a graduation project with real persistence — no cold starts, no function timeouts, BullMQ workers stay alive.

**What you get (Always Free):**

- 1x ARM64 VM ( Ampere A1, 1GB RAM, 4 OCPUs burst) — never expires
- 200GB Block Storage
- 50GB Object Storage
- 1x Load Balancer
- Always-Free PostgreSQL (2 databases, 25GB each) OR self-host on the VM

### Setup Steps

**1. Create Account**

- Go to oracle.com/cloud/free
- Sign up (no credit card for Always Free)
- Wait for account activation (email confirmation)

**2. Create a Virtual Cloud Network (VCN)**

- Networking → Virtual Cloud Networks → Create VCN
- Name: `crm-vcn`
- Select your region (choose one close to you)
- CIDR Block: `10.0.0.0/16`

**3. Create Subnet**

- Within your VCN → Subnets → Create Subnet
- Name: `crm-subnet`
- CIDR: `10.0.0.0/24`
- Route Table: default
- Subnet Access: Public Subnet

**4. Create Security List (CRITICAL)**

- Within your VCN → Security Lists → Default Security List
- Add Ingress Rules:
    - Source: `0.0.0.0/0`, Port: `22` (SSH)
    - Source: `0.0.0.0/0`, Port: `80` (HTTP)
    - Source: `0.0.0.0/0`, Port: `443` (HTTPS)
    - Source: `0.0.0.0/0`, Port: `3000` (App)
    - Source: `0.0.0.0/0`, Port: `6379` (Redis — restrict to VM only)

**5. Create the VM**

- Compute → Instances → Create Instance
- Name: `crm-server`
- Image: Ubuntu 22.04 LTS (or Oracle Linux)
- Shape: Ampere (ARM64) — shows "Always Free eligible"
- Shape Resources: 1GB RAM, 4 OCPUs
- Networking: Select your VCN + Subnet
- Add SSH Key: Download the private key (`crm-key.pem`)

**6. Connect & Setup**

```bash
# SSH into the VM
ssh -i crm-key.pem ubuntu@<VM_PUBLIC_IP>

# Install Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# Install Redis
sudo apt update
sudo apt install redis-server
sudo systemctl enable redis
sudo systemctl start redis

# Clone and setup
git clone <your-repo>
cd E-Commerce-CRM
bun install

# Run (use PM2 for persistence)
bun add -g pm2
pm2 start src/index.ts --name crm
pm2 startup  # Follow instructions to auto-restart on reboot
```

**7. Connect Database**

Option A — Use Oracle's Always Free PostgreSQL:

- Go to Oracle Cloud → Database → Create Database
- Choose "Always Free"
- Copy the connection string into `DATABASE_URL`

Option B — Self-host on VM:

```bash
sudo apt install postgresql postgresql-contrib
sudo -u postgres psql
# Create user + database
```

**8. Environment Variables on VM**

```bash
# Create .env
sudo nano /opt/crm/.env
# Add all required vars: DATABASE_URL, BETTER_AUTH_SECRET, REDIS_URL, SMTP_*, B2_*, etc.

# Restart app
pm2 restart crm
```

### Architecture on Oracle Cloud

```
Internet → Load Balancer (port 443/80) → VM:3000 (Bun server)
                                       → Redis:6379 (VM internal only)
                                       → PostgreSQL (Oracle Cloud or local)
```

### Useful Commands (SSH)

```bash
# Check app status
pm2 status

# View logs
pm2 logs crm --lines 100

# Restart
pm2 restart crm

# Check Redis
redis-cli ping

# Update and redeploy
git pull && bun install && pm2 restart crm
```

### Troubleshooting

**Can't SSH?**

- Check Security List has port 22 open
- Ensure you're using the correct private key: `ssh -i crm-key.pem`
- Oracle Cloud sometimes takes 5-10 min to provision the VM fully

**App won't start?**

- Check `bun run dev` works locally first
- Verify all env vars are set: `pm2 env 0` to see current env
- Check logs: `pm2 logs crm --err --lines 50`

**Database connection fails?**

- Oracle Cloud PostgreSQL: Ensure "Allowlist IP" includes your VM's IP
- Local PostgreSQL: Check `pg_hba.conf` allows connections

### Alternative: Oracle Cloud PostgreSQL Only

If you prefer Railway/Koyeb for the app server but want free DB:

- Create Always Free PostgreSQL on Oracle Cloud
- Use connection string in `DATABASE_URL`
- No VM needed, just deploy app to Railway/Koyeb

### Cost Summary

| Component      | Option                         | Monthly Cost  |
| -------------- | ------------------------------ | ------------- |
| VM             | Oracle Cloud Always Free       | $0            |
| PostgreSQL     | Oracle Cloud Always Free       | $0            |
| Redis          | Self-host on VM                | $0            |
| Object Storage | Oracle Cloud (50GB free)       | $0            |
| Domain + SSL   | Cloudflare (free) + own domain | ~$10/yr       |
| **Total**      |                                | **~$0–10/mo** |

---

## Cold Starts & Durable Execution

### Issue: BullMQ Workers on Vercel

Vercel functions sleep after inactivity. When a worker wakes from a cold start:

- First invocation takes longer (100ms–2s initialization overhead)
- BullMQ worker can miss job processing or cause duplicate processing
- Large imports fail mid-execution with no retry, no notification

### Current State

- BullMQ configured with Redis as primary queue
- Synchronous fallback if Redis is unavailable
- No persistent worker process (relies on Vercel function invocation)

### Required Fix (Phase 1 — Survival Mode)

1. **Upstash Redis** as durable queue backend (Serverless-compatible, HTTP-based)
2. **Vercel Background Functions** or separate worker process for job processing
3. **Graceful failure**: If worker cold-starts mid-import, job should be re-queued, not silently dropped
4. **Job visibility**: Track job state (pending → processing → completed/failed) in DB, not just BullMQ

**Pattern:**

```
User uploads CSV → Job created in DB (status: pending) + added to Upstash queue
                 → Vercel Background Function picks up job
                 → Worker processes rows, updates DB progress
                 → On completion: status = completed, notify user
                 → On failure: status = failed, allow retry
```

**Files to modify:**

- `src/queues/` — Worker must be deployable as separate process or Background Function
- `src/api/imports/imports.service.ts` — Dual-write to DB job state + Upstash queue
- `src/config/redis.config.ts` — Swap BullMQ for Upstash SDK (`@upstash/redis`)
- `src/api/jobs/` — Job status polling endpoint for frontend

**Upstash Redis SDK pattern:**

```typescript
import { Redis } from '@upstash/redis';

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN
});

// Add job
await redis.lpush(
    'jobs:import',
    JSON.stringify({ jobId, orgId, type: 'import' })
);

// Worker (separate process or Background Function)
const job = await redis.rpop('jobs:import');
if (job) {
    const { jobId, orgId, type } = JSON.parse(job);
    // Process with DB state tracking
}
```

**Note:** If Redis health checks fail (see section above), the sync fallback still exists as last resort — but imports over ~5MB will still risk Vercel timeout. Prioritize fixing Redis availability first.
