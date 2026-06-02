# AGENTS.md

## Verify Before Commit (matches pre-commit hook order)

```bash
bun format          # Prettier auto-fix (src/ only)
bun run lint        # ESLint (ignores src/generated, .agents/skills, shopify-web-pixel)
bun run typecheck   # tsc --noEmit, strict mode, verbatimModuleSyntax
bun test            # Bun test runner, needs DATABASE_URL + Redis in CI
```

## Project Structure

```
src/
├── api/               # ~20 route modules under /api/*
│   ├── auth/          # Better Auth server (src/api/auth/auth.ts), router, roles
│   ├── customers|orders|products|imports|exports|segments|subscriptions
│   ├── campaigns|messaging|notifications|templates|tickets
│   ├── audits|analytics|reports|dashboard|cron|uploads|integrations
│   └── index.ts       # Aggregates all routers
├── config/            # env, prisma, redis, ratelimit, roles, b2
├── middlewares/       # auth (protect + requirePermission), error, validation, subscription
├── queues/            # BullMQ: import, rfm, shopify-sync, shopify-webhook
├── errors/            # Re-exports AppError, AuthenticationError, AuthorizationError, NotFoundError, BadRequestError
├── utils/             # response, logger (pino), email, encryption, parser, pdf, paymob, cloudflare, cloudinary, pagination, org-export
├── constants/|types/  # Import-related only
├── test/              # Test helpers
├── instrument.ts      # Sentry init (preloaded by bunfig.toml)
├── app.ts             # Express setup, worker init, graceful shutdown (SIGTERM/SIGINT)
└── index.ts           # Entry: imports dotenv, calls startServer()
prisma/schema.prisma   # 927 lines, model-driven, Prisma v7 client generated to src/generated/prisma
docs/                  # Mintlify documentation (MDX)
shopify-web-pixel/     # Shopify web pixel extension code
```

## Key Facts

- **Runtime**: Bun (≥1.1.0), TypeScript strict, `verbatimModuleSyntax` (use `.js` in imports), `nodenext` module resolution
- **Auth**: Better Auth with Prisma adapter, bearer + organization + openAPI plugins. Routes at `/api/auth/*` via `toNodeHandler`. Protect with `protect` middleware, RBAC with `requirePermission('resource:action')`
- **Prisma v7**: Generator `prisma-client` outputs to `src/generated/prisma/`. Use `bun run generate` after schema changes. `prisma.config.ts` reads `DATABASE_URL` from env
- **BullMQ Queues**: Require Redis (`redis://localhost:6379`). Workers start after DB connection. Fallback to inline sync if Redis unavailable, with Sentry alerting. Graceful shutdown closes all workers
- **Redis Health Monitor**: 60s interval, Sentry warning on state changes
- **Express v5**: JSON body limit 10mb, raw body capture for webhook HMAC verification. CORS origin from comma-separated `CORS_ORIGIN` env var
- **Scalar API Docs**: Auto-generated at `/reference` (combines `src/openapi.json` + Better Auth's OpenAPI schema)
- **Docker**: `docker-compose.yml` for Postgres + Redis, app in Dockerfile
- **Pre-deletion protection**: `beforeDeleteOrganization` hook exports org data to B2, emails owner, aborts on export failure

## Zod v4 Quirks

- No `.default()` on schemas; use `.default(value)` on fields directly
- `z.record(keySchema, valueSchema)` requires two args
- Use `z.nativeEnum` for enum validation

## Testing

- `bun test` — Bun native runner, `*.test.ts` co-located with source, supertest for HTTP
- Tests require `DATABASE_URL` and at least `BETTER_AUTH_SECRET` env vars
- CI spins up Postgres + Redis services, runs `prisma db push` for migrations

## MCP / Skills

- `opencode.json` configures MCP: better-auth, Postgres (local), Sentry, Prisma, Shopify dev
- Skills in `.agents/skills/` and `.claude/skills/` — use the skill tool for Better Auth, Prisma, Sentry, Shopify domains
