# Project Structure and Architecture Guidelines

This document outlines the architectural patterns, folder structure, and rules for the E-Commerce CRM project. Follow these guidelines to ensure consistency and maintainability as the codebase grows.

## IMPORTANT

The project requires some attention to details, so please read the instructions carefully and follow them strictly. if you are not sure about something, please ask for clarification. and if manual input is needed(like enviroment variables, api keys, external APIs, etc) please ask for it in the input.md file. do NOT implement stub or mock or dummy data. implement the actual code.

## 🏗️ Architecture Overview

The project follows a **Feature-Based Modular Architecture**. Instead of grouping by type (all controllers together), we group by domain/feature (e.g., `customers`, `integrations`).

### Core Stack

- **Runtime**: [Bun](https://bun.sh/)
- **Framework**: [Express](https://expressjs.com/) with TypeScript
- **ORM**: [Prisma](https://www.prisma.io/)
- **Auth**: [Better Auth](https://better-auth.com/)
- **Validation**: [Zod](https://zod.dev/)
- **Logging**: [Pino](https://getpino.io/) + pino-pretty
- **Testing**: [bun:test](https://bun.sh/docs/test) + [supertest](https://github.com/visionmedia/supertest)
- **Documentation**: [Postman](https://www.postman.com/), [OpenAPI](https://swagger.io/specification/)

---

## 📂 Folder Structure

```text
src/
├── api/                   # Feature-based API modules
│   ├── auth/              # Better Auth handler (exception - minimal structure)
│   ├── customers/         # Customer management feature
│   ├── integrations/      # Webhooks and sync features
│   ├── ...                # Other feature modules
│   └── index.ts           # Main API router (combines all features)
├── config/                # Configuration files (env, database, roles)
├── constants/             # Enums and project constants
├── errors/                # Custom error classes
├── generated/             # Auto-generated code (e.g., Prisma client)
├── middlewares/           # Global or shared Express middlewares
├── types/                 # Shared TypeScript interfaces and types
├── utils/                 # Helper functions and utilities
├── app.ts                 # Express application setup
├── scripts/                # Scripts for database seeding, etc.
├── openapi.json           # OpenAPI specification for the API
└── index.ts               # Entry point (server start)
```

### Feature Module Structure

Every new feature in `src/api/` should contain:

- `feature.router.ts`: Route definitions and middleware attachment.
- `feature.controller.ts`: Handles HTTP requests, extracts data, and calls services.
- `feature.service.ts`: Business logic and database operations (Prisma).
- `feature.schemas.ts`: Zod validation schemas for requests.
- `feature.test.ts`: Tests for the feature using bun:test.

### Auth Exception

The `auth/` folder is handled by Better Auth and does **not** follow the standard feature structure. Only add files here if absolutely necessary for custom auth logic.

---

## 🔗 Import Structure

### ESM Extensions

This project uses **ES Modules (ESM)**. When importing local files, you **must** include the `.js` extension, even though the files are `.ts`.

- **Correct**: `import { something } from './utils/logger.util.js';`
- **Incorrect**: `import { something } from './utils/logger.util';`

### Alias Usage

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

## 🗄️ Using Prisma

### Importing the Client

Always import the Prisma client from the config file:

```typescript
import prisma from '../config/prisma.config.js';
```

### Generated Prisma Types

Prefer Prisma-generated types over hand-written TypeScript shapes when working with database code.

```typescript
import prisma from '../config/prisma.config.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { CustomerUncheckedCreateInput } from '../generated/prisma/models/Customer.js';
```

- Use model input types from `src/generated/prisma/models/*` for create/update payloads.
- Use `PrismaClient` from `src/generated/prisma/client.js` when a function needs a Prisma client type.
- Do not create custom structural database types when a Prisma-generated type already exists.
- If Prisma interactive transaction typing is awkward in a specific flow, prefer simplifying the flow to direct Prisma writes unless atomic rollback is actually required.

### Query Patterns

```typescript
// Basic query with organization scope
const customers = await prisma.customer.findMany({
    where: { organizationId }
});

// With pagination
const [data, total] = await Promise.all([
    prisma.customer.findMany({
        where: { organizationId },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' }
    }),
    prisma.customer.count({ where: { organizationId } })
]);
```

### Transactions

Use transactions only for atomic operations that must succeed or fail together:

```typescript
await prisma.$transaction([
    prisma.order.update({ ... }),
    prisma.customer.update({ ... }),
]);
```

For interactive transactions, follow Prisma's native pattern:

```typescript
await prisma.$transaction(async (tx) => {
    const sender = await tx.account.update({ ... });

    if (sender.balance < 0) {
        throw new Error('Insufficient funds');
    }

    await tx.account.update({ ... });
});
```

- Do not add `$transaction` just to batch unrelated per-row processing when partial success and per-row error logging are required.
- For import/export style flows that intentionally continue after row-level failures, use normal Prisma writes and log row errors explicitly.
- Prefer Prisma-generated input types for transaction payloads instead of `Parameters<typeof tx.model.create>[0]['data']` when a generated model input type is available.

---

## 🌍 Environment Variables

Create a `.env` file in the root directory. Use `.env.example` as reference.

```env
# Database
DATABASE_URL="file:./dev.db"

# Auth (Better Auth)
BETTER_AUTH_SECRET="your-secret-key-min-32-chars"
BETTER_AUTH_URL="http://localhost:3000"

# External Services
STRIPE_SECRET_KEY="sk_test_..."
WEBHOOK_SECRET="whsec_..."

# App
NODE_ENV="development"
PORT="3000"
```

### Adding New Environment Variables

1. Add the variable to `.env.example`
2. Add validation in `src/config/env.config.ts`
3. Document the variable in this section

---

## 🔐 Roles and Permissions

Permissions are defined in `src/config/roles.config.ts`. The system uses Better Auth's permission system with the format `resource:action`.

### Permission Format

Permissions follow the pattern `resource:action`:

| Permission           | Description                 |
| :------------------- | :-------------------------- |
| `customers:read`     | View customers              |
| `customers:write`    | Create and update customers |
| `customers:delete`   | Delete customers            |
| `integrations:read`  | View integrations           |
| `integrations:write` | Manage integrations         |
| `reports:read`       | View reports                |

### Adding a New Resource

When adding a new feature, extend the roles config to include the new resource:

```typescript
// src/config/roles.config.ts

export type RolePermissions = {
    // ... existing resources
    newResource: ('read' | 'write' | 'delete')[];
};

// Update DEFAULT_ROLES
export const DEFAULT_ROLES = {
    root: {
        newResource: ['read', 'write', 'delete']
    },
    admin: {
        newResource: ['read', 'write']
    },
    member: {
        newResource: ['read']
    }
} as const;
```

### Using Permissions in Routes

Use the `requirePermission` middleware to protect routes:

```typescript
import { requirePermission } from '../../middlewares/auth.middleware.js';
import { customerController } from './customer.controller.js';

const router = Router();

router.get('/', requirePermission('customers:read'), customerController.list);

router.post(
    '/',
    requirePermission('customers:write'),
    customerController.create
);

router.delete(
    '/:id',
    requirePermission('customers:delete'),
    customerController.delete
);
```

The middleware automatically checks the user's role permissions via Better Auth.

---

## ⚠️ Error Handling

### Custom Error Classes

Use custom error classes from `src/errors/` for structured error handling:

```typescript
import {
    AppError,
    NotFoundError,
    ErrorCode,
    HttpStatus
} from '../errors/index.js';

throw new AppError(
    'Customer not found',
    HttpStatus.NOT_FOUND,
    ErrorCode.RESOURCE_NOT_FOUND
);

// Or use specific error types
throw new NotFoundError('Customer not found');
```

### Error Categories

| Error Type          | HTTP Status  | Use Case                   |
| :------------------ | :----------- | :------------------------- |
| `AppError`          | Configurable | General application errors |
| `ValidationError`   | 400          | Invalid input data         |
| `UnauthorizedError` | 401          | Missing/invalid auth       |
| `ForbiddenError`    | 403          | Insufficient permissions   |
| `NotFoundError`     | 404          | Resource not found         |
| `ConflictError`     | 409          | Duplicate/invalid state    |

### Global Error Middleware

All errors are handled by `src/middlewares/error.middleware.ts`. It:

- Logs errors using Pino
- Returns appropriate JSON response
- Sanitizes stack traces in production

---

## 📝 Logging

We use **Pino** with **pino-pretty** for logging.
Logging is used for debugging and monitoring purposes.
Use logging to log important events and errors like responses, requests, etc.

### Usage

```typescript
import { logger } from '../utils/logger.util.js';

logger.info('Server started', { port: 3000 });
logger.error('Database connection failed', { error: err });
```

### Log Levels

| Level   | Usage                |
| :------ | :------------------- |
| `fatal` | Unrecoverable errors |
| `error` | Handled errors       |
| `warn`  | Warning conditions   |
| `info`  | General information  |
| `debug` | Debugging details    |

### Development vs Production

- **Development**: Logs are pretty-printed with colors
- **Production**: Logs are JSON for easy parsing

---

## 🧪 Testing

Tests are written using **bun:test** with **supertest** for HTTP assertions.

### Test File Structure

Place tests alongside the feature files:

```text
src/api/customers/
├── customer.controller.ts
├── customer.service.ts
├── customer.schemas.ts
├── customers.router.ts
└── customer.test.ts      # Tests for all customer features
```

### Writing Tests

```typescript
import { describe, it, expect, beforeAll } from 'bun:test';
import request from 'supertest';
import { app } from '../../app.js';
import { prisma } from '../../config/prisma.config.js';

describe('Customer API', () => {
    let authToken: string;

    beforeAll(async () => {
        // Setup - create test data, get auth token, etc.
    });

    it('should create a customer', async () => {
        const response = await request(app)
            .post('/api/customers')
            .set('Authorization', `Bearer ${authToken}`)
            .send({ name: 'Test', email: 'test@example.com' });

        expect(response.status).toBe(201);
        expect(response.body.data).toMatchObject({
            name: 'Test',
            email: 'test@example.com'
        });
    });

    it('should list customers with pagination', async () => {
        const response = await request(app)
            .get('/api/customers?page=1&limit=10')
            .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data).toBeArray();
        expect(response.body.pagination).toBeDefined();
    });
});
```

### Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test src/api/customers/customer.test.ts

# Run tests with coverage
bun test --coverage
```

### Test Database

Tests use a separate database or are wrapped in transactions that roll back:

```typescript
// In test setup
await prisma.$transaction(async () => {
    // test code here - will rollback automatically
});
```

---

## 📘 OpenAPI Maintenance

The OpenAPI specification is stored in `src/openapi.json`. Keep it updated whenever you add or modify API endpoints.
The postman collection is stored in `src/postman/E-Commerce-CRM.postman_collection.json`. Keep it updated whenever you add or modify API endpoints.

### Adding New Endpoints

After adding a new route, update the OpenAPI spec manually or using an annotation library. Include:

```json
{
    "/api/customers": {
        "post": {
            "summary": "Create a customer",
            "tags": ["Customers"],
            "requestBody": {
                "content": {
                    "application/json": {
                        "schema": {
                            "$ref": "#/components/schemas/CreateCustomer"
                        }
                    }
                }
            },
            "responses": {
                "201": {
                    "description": "Customer created",
                    "content": {
                        "application/json": {
                            "schema": {
                                "$ref": "#/components/schemas/Customer"
                            }
                        }
                    }
                }
            }
        }
    }
}
```

### Components Schema

Add reusable schemas in `components/schemas`:

```json
"Customer": {
  "type": "object",
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "name": { "type": "string" },
    "email": { "type": "string", "format": "email" }
  }
}
```

---

## 📁 Shared Types

Place shared TypeScript interfaces and types in `src/types/`:

```typescript
// src/types/customer.types.ts
export interface Customer {
    id: string;
    name: string;
    email: string;
    organizationId: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateCustomerDto {
    name: string;
    email: string;
    phone?: string;
}
```

Import types in feature files:

```typescript
import type { Customer, CreateCustomerDto } from '../types/customer.types.js';
```

---

## 📁 Constants

Place enums and project constants in `src/constants/`:

```typescript
// src/constants/customer.constants.ts
export const CUSTOMER_STATUS = {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    ARCHIVED: 'archived'
} as const;

export const PAGINATION_DEFAULTS = {
    PAGE: 1,
    LIMIT: 20,
    MAX_LIMIT: 100
} as const;
```

---

## 🚦 Design Principles

1. **Don't Repeat Yourself (DRY)**: Use `src/utils/` for common operations like pagination or response formatting.
2. **Fail Fast**: Use Zod to validate input at the entry point (Middleware/Controller).
3. **Consistency**: Use the `ResponseHandler` for all JSON responses to maintain a uniform API contract.
4. **Thin Controllers, Rich Services**: keep controllers focused on HTTP mapping; put logic in services.
5. **Single Source of Truth**: Define types in `src/types/`, constants in `src/constants/`.

---

## 📝 Rules Summary

| Category       | Rule                                                             |
| :------------- | :--------------------------------------------------------------- |
| **Imports**    | Always use `.js` extension for local imports.                    |
| **Errors**     | Use custom error classes, wrap controllers in `asyncHandler`.    |
| **Responses**  | Use `ResponseHandler.success` or `ResponseHandler.paginated`.    |
| **Database**   | Always filter by `organizationId` for tenant-specific data.      |
| **Validation** | Every POST/PUT request must have a zod schema validation.        |
| **Testing**    | Use bun:test with supertest for HTTP tests.                      |
| **Logging**    | Use Pino logger from `src/utils/logger.util.js`.                 |
| **Types**      | Put shared types in `src/types/`.                                |
| **Constants**  | Put enums in `src/constants/`.                                   |
| **Roles**      | Add new resources to `RolePermissions` type and `DEFAULT_ROLES`. |
