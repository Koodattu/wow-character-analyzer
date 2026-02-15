# Project Blueprint: Bun + Elysia + Eden + Next.js

## Stack Overview

| Layer                     | Technology                | Role                                                                    |
| ------------------------- | ------------------------- | ----------------------------------------------------------------------- |
| Runtime & Package Manager | **Bun**                   | Replaces Node.js + npm. Runs `.ts` natively.                            |
| Backend                   | **Elysia**                | Bun-native HTTP framework. Uses TypeBox for schema validation.          |
| Type Bridge               | **Eden Treaty**           | Type-safe client generated from Elysia's app type. No manual API types. |
| Frontend                  | **Next.js 16 + React 19** | App Router, Server Components, Tailwind CSS v4.                         |

## Project Structure

```
/wow-character-analyzer
├── backend/
│   ├── src/
│   │   └── index.ts          # Elysia app entry + `export type App`
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── app/              # Next.js App Router (layout, page, globals.css)
│   │   └── lib/
│   │       └── api.ts        # Eden Treaty client (create this)
│   └── package.json
├── docs/
│   └── README.md             # This file
└── package.json              # Root (holds shared deps like @elysiajs/eden)
```

## Setup & Commands

All commands use `bun`. Never use `npm` or `npx`.

```bash
# Install all dependencies (run from root)
cd backend && bun install
cd ../frontend && bun install

# Start backend (port 3001, watch mode)
cd backend
bun dev                        # runs: bun run --watch src/index.ts

# Start frontend (port 3000)
cd frontend
bun dev                        # runs: next dev

# Type check
cd backend && bun tsc --noEmit
cd frontend && bun tsc --noEmit

# Run tests (bun:test is built-in)
cd backend && bun test

# Add a dependency
cd backend && bun add <package>
cd frontend && bun add <package>
```

## Backend: Elysia

### Key Rules

1. **Always chain methods.** Elysia's type inference only works through method chaining. Calling methods on a stored variable loses type information.
2. **Always validate with `t`.** Use `t.Object()`, `t.String()`, `t.Number()` etc. from `elysia` for `body`, `query`, and `params`. This drives Eden's type inference.
3. **Always export the app type.** The last line of the main backend file must be: `export type App = typeof app;`

### Current Entry Point: `backend/src/index.ts`

```typescript
import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";

const app = new Elysia()
  .use(cors())
  .get("/", () => ({ message: "Hello from Bun + Elysia!" }))
  .post(
    "/user",
    ({ body }) => ({
      id: 1,
      name: body.name,
      status: "created",
    }),
    {
      body: t.Object({
        name: t.String(),
      }),
    },
  )
  .listen(3001);

console.log(`Elysia is running at ${app.server?.hostname}:${app.server?.port}`);

export type App = typeof app;
```

### Modular Routes with Plugins

Split routes into separate files using Elysia plugin instances with prefixes:

```typescript
// backend/src/routes/users.ts
import { Elysia, t } from "elysia";

export const userRoutes = new Elysia({ prefix: "/users" })
  .get("/", () => db.users.findAll())
  .get("/:id", ({ params: { id } }) => db.users.findById(id), {
    params: t.Object({ id: t.String() }),
  })
  .post("/", ({ body }) => db.users.create(body), {
    body: t.Object({
      name: t.String(),
      email: t.String(),
    }),
  });
```

```typescript
// backend/src/index.ts
import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { userRoutes } from "./routes/users";

const app = new Elysia().use(cors()).use(userRoutes).listen(3001);

export type App = typeof app;
```

### CORS Configuration

```typescript
import { cors } from "@elysiajs/cors";

.use(
  cors({
    origin: "http://localhost:3000",       // frontend URL
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  })
)
```

### Error Handling

```typescript
import { Elysia } from "elysia";

const app = new Elysia()
  .onError(({ error, code }) => {
    if (code === "VALIDATION") {
      return { error: "Validation failed", details: error.message };
    }
    return { error: "Internal server error" };
  })
  .get("/", () => "ok");
```

### Route-Level Guards (Lifecycle Hooks)

```typescript
.get("/admin", ({ cookie }) => getAdminData(), {
  beforeHandle({ cookie, error }) {
    if (!isAuthenticated(cookie)) throw error(401);
  },
})
```

## Eden Treaty: The Type Bridge

Eden Treaty creates a fully typed client from the Elysia app type. It maps routes to object paths and HTTP methods to function calls.

### Setup

```typescript
// frontend/src/lib/api.ts
import { treaty } from "@elysiajs/eden";
import type { App } from "../../../backend/src/index";

export const api = treaty<App>("http://localhost:3001");
```

### Usage

```typescript
// GET request - fully typed response
const { data, error } = await api.index.get();
// data type: { message: string }

// POST with typed body - autocomplete on body fields
const { data, error } = await api.user.post({
  name: "Alice",
});
// data type: { id: number, name: string, status: string }

// Dynamic route params
const { data } = await api.users["123"].get();

// Query parameters
const { data } = await api.search.get({
  query: { q: "term", page: 1 },
});
```

### Error Handling

```typescript
const { data, error } = await api.user.post({ name: "Alice" });

if (error) {
  switch (error.status) {
    case 400:
      console.log("Bad request:", error.value);
      break;
    case 422:
      console.log("Validation error:", error.value);
      break;
    default:
      console.log("Error:", error.status);
  }
} else {
  console.log("Created:", data);
}
```

### Configuration (Auth Headers, etc.)

```typescript
const api = treaty<App>("http://localhost:3001", {
  headers: {
    Authorization: "Bearer <token>",
  },
  fetch: {
    credentials: "include",
  },
  onResponse: async (response) => {
    if (response.status === 401) {
      // handle token refresh
    }
  },
});
```

### Testing Without HTTP (Direct Instance)

```typescript
import { treaty } from "@elysiajs/eden";
import { describe, it, expect } from "bun:test";

describe("API", () => {
  it("returns greeting", async () => {
    const app = createApp(); // factory that returns Elysia instance
    const client = treaty<typeof app>(app); // pass instance directly, no HTTP

    const { data, error } = await client.index.get();
    expect(error).toBeNull();
    expect(data?.message).toBe("Hello from Bun + Elysia!");
  });
});
```

## Frontend: Next.js 16 + React 19

### App Router Conventions

| File            | Purpose                                              |
| --------------- | ---------------------------------------------------- |
| `layout.tsx`    | Shared UI wrapper. Does not re-render on navigation. |
| `page.tsx`      | Route entry point. Unique per URL segment.           |
| `loading.tsx`   | Suspense fallback shown while page loads.            |
| `error.tsx`     | Error boundary for the route segment.                |
| `not-found.tsx` | 404 page for the route segment.                      |

### Server Components (Default)

All components in the `app/` directory are Server Components by default. They can be `async` and fetch data directly:

```tsx
// frontend/src/app/page.tsx
import { api } from "@/lib/api";

export default async function Home() {
  const { data } = await api.index.get();

  return (
    <main>
      <h1>{data?.message}</h1>
    </main>
  );
}
```

### Client Components

Add `"use client"` at the top of files that need interactivity (state, effects, event handlers):

```tsx
"use client";

import { useState } from "react";
import { api } from "@/lib/api";

export function CreateUserForm() {
  const [name, setName] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { data, error } = await api.user.post({ name });
    if (error) {
      console.error(error.value);
      return;
    }
    console.log("Created:", data);
  }

  return (
    <form onSubmit={handleSubmit}>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <button type="submit">Create</button>
    </form>
  );
}
```

### Path Aliases

The frontend uses `@/*` mapped to `./src/*` (configured in `tsconfig.json`):

```typescript
import { api } from "@/lib/api"; // resolves to frontend/src/lib/api.ts
```

### Styling

Tailwind CSS v4 via PostCSS. Entry point: `src/app/globals.css` with `@import "tailwindcss"`.

## Testing with bun:test

```typescript
import { describe, it, expect, beforeAll, afterEach, mock } from "bun:test";

describe("feature", () => {
  it("works", () => {
    expect(1 + 1).toBe(2);
  });

  it("async works", async () => {
    const result = await someAsyncFn();
    expect(result).toEqual({ ok: true });
  });
});
```

```bash
bun test                  # run all tests
bun test --watch          # re-run on file change
bun test --coverage       # with coverage report
bun test -t "pattern"     # filter by test name
```

## AI Code Generation Rules

When generating code for this project:

1. **Backend routes:** Always chain on the Elysia instance. Always include a `t.Object()` validation schema for `body`, `query`, and `params`.
2. **Frontend data fetching:** Always use the `api` treaty client from `@/lib/api`. Never use raw `fetch` with string URLs for backend calls.
3. **Type safety:** Never write manual TypeScript interfaces for API request/response shapes. Eden infers them from the backend.
4. **Imports:** Use `@/` path alias in frontend code. Use relative paths in backend code.
5. **Runtime:** Use `bun` for all commands. Use `bun:test` for testing. Use `bun run --watch` for development.
6. **Components:** Default to Server Components. Only add `"use client"` when the component needs state, effects, or browser APIs.
