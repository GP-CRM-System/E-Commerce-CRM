# Project Structure and Architecture Guidelines

This document outlines the architectural patterns, folder structure, and rules for the E-Commerce CRM project. Follow these guidelines to ensure consistency and maintainability as the codebase grows.

## 🏗️ Architecture Overview

The project follows a **Feature-Based Modular Architecture**. Instead of grouping by type (all controllers together), we group by domain/feature (e.g., `customers`, `auth`).

### Core Stack

- **Runtime**: [Bun](https://bun.sh/)
- **Framework**: [Express](https://expressjs.com/) with TypeScript
- **ORM**: [Prisma](https://www.prisma.io/)
- **Auth**: [Better Auth](https://better-auth.com/)
- **Validation**: [Zod](https://zod.dev/)
- **Logging**: Winston

---

## 📂 Folder Structure

```text
src/
├── api/                # Feature-based API modules
│   ├── auth/           # Authentication logic (Better Auth)
│   ├── customers/      # Customer management feature
│   └── index.ts        # Main API router (combines all features)
├── config/             # Configuration files (env, database, roles)
├── generated/          # Auto-generated code (e.g., Prisma client)
├── middlewares/        # Global or shared Express middlewares
├── utils/              # Helper functions and utilities
├── app.ts              # Express application setup
├── scripts/            # Scripts for database seeding, etc.
├── openapi.json        # OpenAPI specification for the API
└── index.ts            # Entry point (server start)
```

### Feature Module Structure

Every new feature in `src/api/` should ideally contain:

- `feature.router.ts`: Route definitions and middleware attachment.
- `feature.controller.ts`: Handles HTTP requests, extracts data, and calls services.
- `feature.service.ts`: Business logic and database operations (Prisma).
- `feature.schemas.ts`: Zod validation schemas for requests.
- `feature.test.ts`: Tests for the feature using bun:test.

---

## 🔗 Import Structure

### ESM Extensions

This project uses **ES Modules (ESM)**. When importing local files, you **must** include the `.js` extension, even though the files are `.ts`.

- **Correct**: `import { something } from './utils/logger.util.js';`
- **Incorrect**: `import { something } from './utils/logger.util';`

### Alias Usage

(If applicable, though currently using relative paths)
Prefer relative paths starting with `../` or `./` to maintain clarity on module depth.

---

## 🛠️ Rules for Adding New Features

### 1. Route Definition

Check for existing patterns in `api/index.ts`. Add your new feature router to the main API router.

```typescript
// src/api/index.ts
router.use('/new-feature', newFeatureRouter);
```

### 2. Controller Pattern

Use the `asyncHandler` wrapper to handle async errors automatically.

```typescript
export const createItem = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        // 1. Extract data
        // 2. Call service
        // 3. Handle response via ResponseHandler
    }
);
```

### 3. Service Pattern

Services should be pure business logic. Avoid touching `res` or `req` objects directly in services. Return data or throw errors.

### 4. Validation

Always validate incoming data (`req.body`, `req.query`, `req.params`) using Zod schemas defined in `feature.schemas.ts`. Apply them using the `validate` middleware in the router.

### 5. Multi-Tenancy (Organization Scope)

Most entities are scoped to an `organizationId`.

- **Controller**: Ensure `req.session.activeOrganizationId` is present.
- **Service**: Always include `organizationId` in Prisma queries (`where: { organizationId }`).

---

## 🚦 Design Principles

1. **Don't Repeat Yourself (DRY)**: Use `src/utils/` for common operations like pagination or response formatting.
2. **Fail Fast**: Use Zod to validate input at the entry point (Middleware/Controller).
3. **Consistency**: Use the `ResponseHandler` for all JSON responses to maintain a uniform API contract.
4. **Thin Controllers, Rich Services**: keep controllers focused on HTTP mapping; put logic in services.

---

## 📝 Rules Summary

| Category       | Rule                                                          |
| :------------- | :------------------------------------------------------------ |
| **Imports**    | Always use `.js` extension for local imports.                 |
| **Errors**     | Wrap controllers in `asyncHandler`.                           |
| **Responses**  | Use `ResponseHandler.success` or `ResponseHandler.paginated`. |
| **Database**   | Always filter by `organizationId` for tenant-specific data.   |
| **Validation** | Every POST/PUT request must have a zod schema validation.     |
