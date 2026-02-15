# LLM Coding Agent Instructions

> Condensed rules for AI agents generating or modifying code in this project.

---

## Stack

- **Runtime:** Bun (NOT Node.js). All commands use `bun`, `bunx`. Never `npm`, `npx`, `node`.
- **Backend:** Elysia (Bun-native HTTP framework) on port 3001.
- **Frontend:** Next.js 16 (App Router) + React 19 on port 3000.
- **Database:** PostgreSQL via Drizzle ORM.
- **Styling:** Tailwind CSS v4 (PostCSS plugin, no tailwind.config.js).
- **Auth:** Lucia v3 (session-based, stored in PostgreSQL).
- **Type bridge:** Eden Treaty (frontend) ← `export type App = typeof app` (backend).
- **Validation:** TypeBox (`t` from Elysia / `@sinclair/typebox`).
- **IDs:** `@paralleldrive/cuid2` for all primary keys.
- **Icons:** `lucide-react`.
- **Class utils:** `clsx` + `tailwind-merge` via `cn()` helper.

---

## Project Layout

```
backend/src/           → Elysia app, routes, db schema, auth
frontend/src/app/      → Next.js App Router pages/layouts
frontend/src/lib/      → Shared utilities (api client, cn helper)
frontend/src/components/ → React components
docs/                  → Documentation
```

---

## Commands

```bash
cd backend && bun dev          # start backend (watch mode, port 3001)
cd frontend && bun dev         # start frontend (port 3000)
cd backend && bun test         # run tests
cd frontend && bun lint        # lint
bunx drizzle-kit generate      # generate migration
bunx drizzle-kit migrate       # apply migrations
bunx drizzle-kit push          # push schema (dev only)
```

---

## Backend Rules

### Elysia — ALWAYS chain methods

Type inference depends on method chaining. Breaking the chain loses types.

```typescript
// CORRECT
const app = new Elysia()
  .use(cors())
  .get("/foo", () => "bar")
  .post("/baz", ({ body }) => body, { body: t.Object({ name: t.String() }) })
  .listen(3001);

export type App = typeof app;
```

```typescript
// WRONG — types are lost
const app = new Elysia();
app.get("/foo", () => "bar");
```

### ALWAYS validate with TypeBox

Every route with body, params, or query MUST have a schema:

```typescript
.post("/users", ({ body }) => createUser(body), {
  body: t.Object({
    name: t.String({ minLength: 1 }),
    email: t.String({ format: "email" }),
  }),
})
.get("/users/:id", ({ params }) => getUser(params.id), {
  params: t.Object({ id: t.String() }),
})
```

### ALWAYS export the app type

Last meaningful line of `backend/src/index.ts`:

```typescript
export type App = typeof app;
```

### Modular routes — use Elysia plugins

```typescript
// backend/src/routes/characters.ts
export const characterRoutes = new Elysia({ prefix: "/characters" })
  .get("/", () => listCharacters())
  .get("/:id", ({ params }) => getCharacter(params.id), {
    params: t.Object({ id: t.String() }),
  });
```

```typescript
// backend/src/index.ts
const app = new Elysia().use(cors()).use(characterRoutes).listen(3001);

export type App = typeof app;
```

### Database schemas — Drizzle

```typescript
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

### Schema → validation bridge

```typescript
import { createInsertSchema, createSelectSchema } from "drizzle-typebox";
import { users } from "./db/schema";

const insertUserSchema = createInsertSchema(users);
// Use directly in Elysia: body: insertUserSchema
```

### IDs

```typescript
import { createId } from "@paralleldrive/cuid2";
const id = createId();
```

### Auth

Lucia v3 with `@lucia-auth/adapter-drizzle`. Sessions in PostgreSQL. HTTP-only cookies. No JWTs.

---

## Frontend Rules

### NEVER use raw fetch for backend calls

Always use the Eden Treaty client:

```typescript
// frontend/src/lib/api.ts
import { treaty } from "@elysiajs/eden";
import type { App } from "../../../backend/src/index";
export const api = treaty<App>("http://localhost:3001");
```

```typescript
const { data, error } = await api.users.post({ name: "Alice" });
const { data } = await api.characters["abc123"].get();
```

### NEVER manually define API types

Eden infers all request/response types from the backend. Do not write `interface ApiResponse { ... }` for backend data.

### Server Components by default

All `app/` components are Server Components. They can be `async`:

```tsx
export default async function Page() {
  const { data } = await api.characters.get();
  return (
    <div>
      {data?.map((c) => (
        <p key={c.id}>{c.name}</p>
      ))}
    </div>
  );
}
```

### Client Components only when needed

Add `"use client"` ONLY when the component uses `useState`, `useEffect`, event handlers, or browser APIs:

```tsx
"use client";
import { useState } from "react";
export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount((c) => c + 1)}>{count}</button>;
}
```

### Imports — use `@/` alias

```typescript
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
```

### Class names — use cn()

```typescript
import { cn } from "@/lib/utils";

<div className={cn("p-4 rounded-lg", isActive && "bg-primary", className)} />
```

### Icons

```tsx
import { Search, User } from "lucide-react";
<Search className="h-4 w-4" />;
```

### Tailwind v4

- No `tailwind.config.js`. Configuration in CSS via `@theme` in `globals.css`.
- PostCSS plugin: `@tailwindcss/postcss`.
- Entry point: `@import "tailwindcss"` in `globals.css`.

---

## Security Rules

1. **No secrets in code.** Use environment variables (`process.env.DATABASE_URL`, etc.).
2. **Validate all input.** Every route body/params/query must have a TypeBox schema.
3. **Session-based auth.** Use Lucia. No JWTs. HTTP-only, Secure, SameSite cookies.
4. **CORS restricted.** Only allow the frontend origin.
5. **No raw SQL.** Always use Drizzle ORM queries.
6. **IDs are opaque.** Use cuid2. Never expose auto-increment IDs.
7. **Rate limiting.** Add rate limiting to auth endpoints.
8. **Error responses.** Never leak stack traces or internal details to clients.

---

## Architecture Constraints

1. **One source of truth for types.** Drizzle schema → drizzle-typebox → Elysia validation → Eden Treaty → React. Never duplicate type definitions.
2. **Backend routes must be chainable.** Breaking Elysia method chains breaks the entire type pipeline.
3. **No workspace orchestrator.** `backend/` and `frontend/` are independent Bun projects. Install dependencies separately.
4. **Backend: relative imports.** Frontend: `@/` alias imports.
5. **Flat, explicit code.** No clever abstractions, no deep inheritance, no metaprogramming.
6. **Small functions, linear control flow.** Avoid deeply nested logic.
7. **Structured logging at boundaries.** Log incoming requests, outgoing responses, errors, auth events.
8. **Deterministic, testable behavior.** Use `bun:test`. Pass dependencies explicitly.

---

## Error Handling Pattern

### Backend

```typescript
.onError(({ error, code }) => {
  if (code === "VALIDATION") {
    return { error: "Validation failed", details: error.message };
  }
  console.error("Unhandled error:", error);
  return { error: "Internal server error" };
})
```

### Frontend (Eden)

```typescript
const { data, error } = await api.users.post({ name });
if (error) {
  switch (error.status) {
    case 400:
      handleBadRequest(error.value);
      break;
    case 422:
      handleValidation(error.value);
      break;
    default:
      handleUnknown(error.status);
      break;
  }
  return;
}
// data is non-null here
```

---

## Do NOT

- Use `npm`, `npx`, `yarn`, `pnpm`, or `node`
- Use raw `fetch()` for backend API calls
- Write manual TypeScript interfaces for API shapes
- Use JWTs for auth
- Use `tailwind.config.js` (Tailwind v4 uses CSS config)
- Store an Elysia instance and call methods on it separately
- Use auto-increment integer IDs
- Leak error details to clients
- Skip TypeBox validation on any route
- Put `"use client"` on components that don't need it
