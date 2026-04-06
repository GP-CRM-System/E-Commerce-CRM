FROM oven/bun:latest AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Build stage - generate Prisma client
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run generate

# Production runner
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

# Copy dependencies and built artifacts
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/src/generated/prisma ./src/generated/prisma
COPY package.json bun.lock* ./
COPY src ./src
COPY prisma ./prisma

EXPOSE 6892

CMD ["bun", "run", "start"]
