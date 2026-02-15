# WoW Character Analyzer — Technical Stack Reference

A comprehensive, library-by-library breakdown of the technologies powering this application.

---

## Table of Contents

- [Runtime: Bun](#runtime-bun)
- [Backend Framework: Elysia](#backend-framework-elysia)
- [Schema Validation: TypeBox](#schema-validation-typebox)
- [API Documentation: Elysia Swagger](#api-documentation-elysia-swagger)
- [CORS: @elysiajs/cors](#cors-elysiacors)
- [Type Bridge: Eden Treaty](#type-bridge-eden-treaty)
- [Database: PostgreSQL](#database-postgresql)
- [ORM: Drizzle ORM](#orm-drizzle-orm)
- [Schema-to-Validation Bridge: drizzle-typebox](#schema-to-validation-bridge-drizzle-typebox)
- [Migrations: Drizzle Kit](#migrations-drizzle-kit)
- [Authentication: Lucia v3](#authentication-lucia-v3)
- [Auth Adapter: @lucia-auth/adapter-drizzle](#auth-adapter-lucia-authadapter-drizzle)
- [ID Generation: cuid2](#id-generation-cuid2)
- [Frontend Framework: Next.js 16](#frontend-framework-nextjs-16)
- [UI Library: React 19](#ui-library-react-19)
- [CSS Framework: Tailwind CSS v4](#css-framework-tailwind-css-v4)
- [Class Utilities: clsx + tailwind-merge](#class-utilities-clsx--tailwind-merge)
- [Icons: Lucide React](#icons-lucide-react)
- [TypeScript Configuration](#typescript-configuration)
- [Linting: ESLint 9](#linting-eslint-9)
- [Full Dependency Manifest](#full-dependency-manifest)

---

## Runtime: Bun

| Property | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Role     | Runtime, package manager, bundler, test runner, transpiler |
| Replaces | Node.js, npm/yarn/pnpm, ts-node, Jest, esbuild             |
| Website  | [bun.sh](https://bun.sh)                                   |

Bun is a high-performance JavaScript/TypeScript runtime written in Zig with a JavaScriptCore engine (Safari's JS engine, not V8). It executes `.ts` files natively — no compile step, no `ts-node`, no `tsx`.

### Why Bun over Node.js

- **Native TypeScript execution.** No transpilation pipeline. `bun run file.ts` just works.
- **Faster startup.** Bun starts ~4x faster than Node.js, which matters for development iteration speed and serverless cold starts.
- **Faster package installs.** Bun's package manager uses hardlinks and a global module cache. Install times are typically 10-25x faster than npm.
- **Built-in test runner.** `bun:test` provides a Jest-compatible API (`describe`, `it`, `expect`, `mock`, `spyOn`) without installing Jest, ts-jest, or any test configuration.
- **Built-in bundler.** `bun build` can bundle for browser or server targets without webpack/esbuild/rollup.
- **Single binary.** One install replaces multiple tools from the Node ecosystem.

### Key Commands

```bash
bun install            # install dependencies (reads package.json)
bun add <pkg>          # add a dependency
bun add -D <pkg>       # add a dev dependency
bun run <script>       # run a package.json script
bun run --watch file.ts  # run with file watcher (auto-restart)
bun test               # run tests
bun test --watch       # watch mode
bun test --coverage    # with coverage
bunx <command>         # equivalent to npx (run bin from node_modules)
```

### Important Notes

- Bun uses `package.json` and `node_modules/` — it is npm-compatible.
- Lock file is `bun.lockb` (binary format) or `bun.lock` (text format).
- The `bun-types` package provides TypeScript definitions for Bun-specific APIs (`Bun.serve`, `Bun.file`, `bun:test`, etc.).

---

## Backend Framework: Elysia

| Property     | Value                                                 |
| ------------ | ----------------------------------------------------- |
| Package      | `elysia` ^1.4.25                                      |
| Role         | HTTP framework (routing, validation, lifecycle hooks) |
| Designed for | Bun runtime specifically                              |

Elysia is a Bun-native web framework that achieves high performance by building directly on `Bun.serve()`. It uses TypeBox schemas for validation and leverages TypeScript's type inference through method chaining to provide end-to-end type safety.

### Core Architecture

Elysia's type system works through **method chaining**. Each `.get()`, `.post()`, `.use()` call returns a new type that includes the route's schema. This is what allows Eden Treaty to infer types on the frontend.

```typescript
import { Elysia, t } from "elysia";

const app = new Elysia()
  .get("/health", () => ({ status: "ok" }))
  .post("/users", ({ body }) => createUser(body), {
    body: t.Object({
      name: t.String(),
      email: t.String({ format: "email" }),
    }),
  })
  .listen(3001);

// This type export is what makes Eden Treaty work
export type App = typeof app;
```

### Critical Rule: Always Chain

Storing an Elysia instance in a variable and calling methods on it later **breaks type inference**:

```typescript
// BAD — types are lost
const app = new Elysia();
app.get("/a", () => "a");
app.get("/b", () => "b");

// GOOD — types are preserved
const app = new Elysia().get("/a", () => "a").get("/b", () => "b");
```

### Plugin System (Modular Routes)

Routes are split into separate files using Elysia plugin instances with a `prefix`:

```typescript
// backend/src/routes/characters.ts
import { Elysia, t } from "elysia";

export const characterRoutes = new Elysia({ prefix: "/characters" })
  .get("/", () => listCharacters())
  .get("/:id", ({ params }) => getCharacter(params.id), {
    params: t.Object({ id: t.String() }),
  })
  .post("/", ({ body }) => createCharacter(body), {
    body: t.Object({
      name: t.String(),
      realm: t.String(),
    }),
  });
```

```typescript
// backend/src/index.ts
import { Elysia } from "elysia";
import { characterRoutes } from "./routes/characters";

const app = new Elysia().use(cors()).use(characterRoutes).listen(3001);

export type App = typeof app;
```

### Lifecycle Hooks

Elysia provides lifecycle hooks for cross-cutting concerns:

```typescript
const app = new Elysia()
  // Global error handler
  .onError(({ error, code }) => {
    if (code === "VALIDATION") {
      return { error: "Validation failed", details: error.message };
    }
    return { error: "Internal server error" };
  })
  // Route-level guard
  .get("/admin", () => getAdminData(), {
    beforeHandle({ cookie, error }) {
      if (!isAuthenticated(cookie)) throw error(401);
    },
  });
```

### Validation

All request validation uses TypeBox schemas via Elysia's `t` export (re-exported from `@sinclair/typebox`):

```typescript
.post("/users", ({ body }) => createUser(body), {
  body: t.Object({
    name: t.String({ minLength: 1, maxLength: 100 }),
    email: t.String({ format: "email" }),
    age: t.Optional(t.Number({ minimum: 0 })),
  }),
  query: t.Object({
    notify: t.Optional(t.Boolean()),
  }),
  params: t.Object({
    /* for path params */
  }),
})
```

Validation errors return a structured 422 response automatically.

---

## Schema Validation: TypeBox

| Property | Value                                                        |
| -------- | ------------------------------------------------------------ |
| Package  | `@sinclair/typebox` ^0.34.48                                 |
| Role     | Runtime + compile-time schema validation                     |
| Used by  | Both backend (Elysia validation) and frontend (shared types) |

TypeBox creates JSON Schema-compatible type definitions that simultaneously serve as:

1. **TypeScript types** (compile-time)
2. **Runtime validators** (request validation)
3. **OpenAPI schema** (Swagger documentation)

```typescript
import { t } from "elysia"; // re-exports TypeBox

const UserSchema = t.Object({
  id: t.String(),
  name: t.String(),
  email: t.String({ format: "email" }),
  createdAt: t.String({ format: "date-time" }),
});

// TypeScript type is automatically inferred:
// { id: string; name: string; email: string; createdAt: string }
type User = typeof UserSchema.static;
```

TypeBox is shared between backend and frontend (`@sinclair/typebox` appears in both `package.json` files) to ensure schema definitions can be reused across the stack.

---

## API Documentation: Elysia Swagger

| Property | Value                                        |
| -------- | -------------------------------------------- |
| Package  | `@elysiajs/swagger` ^1.3.1                   |
| Role     | Auto-generated OpenAPI/Swagger documentation |
| Endpoint | `/swagger` (default)                         |

Installed as an Elysia plugin, it introspects all registered routes and their TypeBox schemas to produce a live OpenAPI spec with an interactive Swagger UI.

```typescript
import { swagger } from "@elysiajs/swagger";

const app = new Elysia().use(swagger());
// ... routes
```

Every route with a `body`, `query`, `params`, or `response` schema is automatically documented. No manual OpenAPI annotations required.

---

## CORS: @elysiajs/cors

| Property | Value                                    |
| -------- | ---------------------------------------- |
| Package  | `@elysiajs/cors` ^1.4.1                  |
| Role     | Cross-Origin Resource Sharing middleware |

```typescript
import { cors } from "@elysiajs/cors";

const app = new Elysia().use(
  cors({
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
```

Required because the frontend (port 3000) and backend (port 3001) run on different origins in development.

---

## Type Bridge: Eden Treaty

| Property | Value                           |
| -------- | ------------------------------- |
| Package  | `@elysiajs/eden` ^1.4.8         |
| Role     | End-to-end type-safe API client |
| Location | Frontend only                   |

Eden Treaty generates a fully typed RPC-style client from the Elysia backend's exported `App` type. No code generation step — types are inferred at compile time via TypeScript's type system.

### How It Works

1. Backend exports `type App = typeof app`
2. Frontend imports this type
3. Eden Treaty maps route paths to object properties and HTTP methods to function calls

```typescript
// frontend/src/lib/api.ts
import { treaty } from "@elysiajs/eden";
import type { App } from "../../../backend/src/index";

export const api = treaty<App>("http://localhost:3001");
```

### Usage Patterns

```typescript
// GET /
const { data, error } = await api.index.get();

// POST /users — body is fully typed
const { data, error } = await api.users.post({
  name: "Alice",
  email: "alice@example.com",
});

// GET /characters/:id — path params via bracket notation
const { data } = await api.characters["abc123"].get();

// GET /search?q=term&page=1 — query params
const { data } = await api.search.get({
  query: { q: "term", page: 1 },
});
```

### Error Handling

```typescript
const { data, error } = await api.users.post({ name: "Alice" });

if (error) {
  // error.status is typed as a union of possible error codes
  // error.value is typed per status code
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
// data is guaranteed non-null here
console.log(data);
```

### Configuration

```typescript
const api = treaty<App>("http://localhost:3001", {
  headers: {
    Authorization: "Bearer <token>",
  },
  fetch: {
    credentials: "include", // send cookies cross-origin
  },
});
```

### Testing Without Network

Eden can accept an Elysia instance directly instead of a URL, enabling in-process testing:

```typescript
import { treaty } from "@elysiajs/eden";

const app = new Elysia().get("/", () => "ok");
const client = treaty(app); // no HTTP, direct function call
const { data } = await client.index.get();
```

---

## Database: PostgreSQL

| Property     | Value                         |
| ------------ | ----------------------------- |
| Role         | Primary relational data store |
| Accessed via | Drizzle ORM                   |

PostgreSQL was chosen for:

- **Rich querying:** Complex joins, window functions, CTEs, full-text search. Essential for character analysis features.
- **JSONB columns:** Flexible semi-structured data storage for API responses and metadata.
- **Proven reliability:** Battle-tested with decades of production use.
- **Immediate session revocation:** Sessions stored in PostgreSQL can be invalidated instantly (unlike JWTs).

### Connection

The backend connects to PostgreSQL via a Drizzle ORM client configured with a connection string:

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client);
```

---

## ORM: Drizzle ORM

| Property | Value                            |
| -------- | -------------------------------- |
| Package  | `drizzle-orm` ^0.45.1            |
| Role     | Type-safe database queries       |
| Driver   | `postgres` (postgres.js) or `pg` |

Drizzle ORM provides a SQL-like TypeScript API. Unlike Prisma, it has **no query engine binary** — it generates SQL strings and sends them directly to the database driver. This results in:

- Smaller deployment size (no 5-15MB engine binary)
- Faster queries (no IPC between Node/Bun process and engine)
- More predictable SQL output

### Schema Definition

Schemas are defined in TypeScript using Drizzle's table builders:

```typescript
// backend/src/db/schema.ts
import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const characters = pgTable("characters", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  realm: text("realm").notNull(),
  region: text("region").notNull(),
  level: integer("level").notNull(),
  class: text("class").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

### Query API

```typescript
import { db } from "./db";
import { users, characters } from "./db/schema";
import { eq } from "drizzle-orm";

// Select
const allUsers = await db.select().from(users);
const user = await db.select().from(users).where(eq(users.id, "abc123"));

// Insert
await db.insert(users).values({ id: createId(), username: "alice", email: "alice@example.com" });

// Join
const result = await db.select().from(characters).leftJoin(users, eq(characters.userId, users.id)).where(eq(users.username, "alice"));
```

### Relational Query API

Drizzle also supports a higher-level relational API for cleaner nested queries:

```typescript
const userWithCharacters = await db.query.users.findFirst({
  where: eq(users.id, userId),
  with: {
    characters: true,
  },
});
```

---

## Schema-to-Validation Bridge: drizzle-typebox

| Property | Value                                                   |
| -------- | ------------------------------------------------------- |
| Package  | `drizzle-typebox` ^0.3.3                                |
| Role     | Generate TypeBox schemas from Drizzle table definitions |

This is the critical bridge between the database schema and Elysia's validation layer. It generates TypeBox schemas (`t.Object`, `t.String`, etc.) directly from Drizzle table definitions, creating a single source of truth:

```
Drizzle Table → drizzle-typebox → TypeBox Schema → Elysia Validation → Eden Types
```

```typescript
import { createInsertSchema, createSelectSchema } from "drizzle-typebox";
import { users } from "./db/schema";

// TypeBox schema for inserting a user (excludes auto-generated fields)
export const insertUserSchema = createInsertSchema(users);

// TypeBox schema for selecting a user (all fields)
export const selectUserSchema = createSelectSchema(users);

// Use in Elysia routes
app.post("/users", ({ body }) => createUser(body), {
  body: insertUserSchema,
});
```

This eliminates manual type duplication. Change the database schema → validation and client types update automatically.

---

## Migrations: Drizzle Kit

| Property | Value                                  |
| -------- | -------------------------------------- |
| Package  | `drizzle-kit` ^0.31.9 (dev dependency) |
| Role     | Database migrations Tooling            |

Drizzle Kit reads Drizzle schema files and manages database migrations:

```bash
bunx drizzle-kit generate   # generate SQL migration from schema changes
bunx drizzle-kit migrate    # apply pending migrations
bunx drizzle-kit push       # push schema directly (dev only, no migration files)
bunx drizzle-kit pull       # introspect existing database into schema files
bunx drizzle-kit studio     # open Drizzle Studio (visual database browser)
```

Configuration via `drizzle.config.ts`:

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

---

## Authentication: Lucia v3

| Property | Value                                     |
| -------- | ----------------------------------------- |
| Package  | `lucia` ^3.2.2                            |
| Role     | Session-based authentication              |
| Approach | Server-side sessions stored in PostgreSQL |

Lucia v3 is a modern auth library that handles session creation, validation, and invalidation. Key design decisions:

- **No JWTs.** Sessions are stored in PostgreSQL. Revocation is instant (delete the row).
- **HTTP-only cookies.** Session tokens are stored as HTTP-only, secure, SameSite cookies — not accessible from client JavaScript.
- **Framework-agnostic.** Works with any backend; we use it through Elysia lifecycle hooks.

### Session Flow

1. User authenticates (e.g., login form, OAuth callback)
2. Lucia creates a session in PostgreSQL, returns a session cookie
3. Every subsequent request includes the cookie
4. Elysia middleware validates the session via Lucia
5. On logout, the session row is deleted → immediate revocation

---

## Auth Adapter: @lucia-auth/adapter-drizzle

| Property | Value                                                  |
| -------- | ------------------------------------------------------ |
| Package  | `@lucia-auth/adapter-drizzle` ^1.1.0                   |
| Role     | Connects Lucia to Drizzle ORM for session/user storage |

This adapter tells Lucia how to read/write sessions and users using Drizzle queries. It requires specific table schemas for `users` and `sessions`:

```typescript
import { DrizzlePostgreSQLAdapter } from "@lucia-auth/adapter-drizzle";
import { db } from "./db";
import { users, sessions } from "./db/schema";

const adapter = new DrizzlePostgreSQLAdapter(db, sessions, users);
```

---

## ID Generation: cuid2

| Property | Value                                    |
| -------- | ---------------------------------------- |
| Package  | `@paralleldrive/cuid2` ^3.3.0            |
| Role     | Generate unique, collision-resistant IDs |

cuid2 generates URL-safe, globally unique IDs without a central coordinator:

```typescript
import { createId } from "@paralleldrive/cuid2";

const id = createId(); // e.g., "clh3am0g300002v6swxfz3o7y"
```

### Why cuid2 over alternatives

| Alternative    | Drawback                                                 |
| -------------- | -------------------------------------------------------- |
| UUID v4        | Longer (36 chars with dashes), poor index locality       |
| nanoid         | No built-in collision resistance guarantees              |
| Auto-increment | Exposes row count, non-portable, requires centralized DB |
| ULID           | Larger format, less compact                              |

cuid2 provides:

- **Collision resistance** — safe for distributed systems
- **URL-safe** — no special characters
- **Compact** — shorter than UUIDs
- **Non-sequential** — doesn't leak creation order or count

Used for all primary keys: users, sessions, characters, etc.

---

## Frontend Framework: Next.js 16

| Property | Value                                                |
| -------- | ---------------------------------------------------- |
| Package  | `next` 16.1.6                                        |
| Role     | Frontend framework (routing, SSR, static generation) |
| Router   | App Router (file-system based)                       |

Next.js 16 with the App Router provides:

### App Router File Conventions

| File            | Purpose                                                       |
| --------------- | ------------------------------------------------------------- |
| `layout.tsx`    | Persistent wrapper. Does **not** re-render on navigation.     |
| `page.tsx`      | Route entry point. Required for the URL to be valid.          |
| `loading.tsx`   | Suspense fallback while the page's async data loads.          |
| `error.tsx`     | Error boundary for the route segment. Must be `"use client"`. |
| `not-found.tsx` | Custom 404 for the route segment.                             |

### Server Components (Default)

All components in `app/` are Server Components by default. They:

- Can be `async` and `await` data directly
- Ship **zero JavaScript** to the client
- Cannot use `useState`, `useEffect`, or browser APIs

```tsx
// This component runs ONLY on the server. No JS sent to browser.
export default async function CharacterPage({ params }: { params: { id: string } }) {
  const { data } = await api.characters[params.id].get();
  return <h1>{data?.name}</h1>;
}
```

### Client Components

Prefix with `"use client"` when interactivity is needed:

```tsx
"use client";
import { useState } from "react";

export function SearchBar() {
  const [query, setQuery] = useState("");
  return <input value={query} onChange={(e) => setQuery(e.target.value)} />;
}
```

### Streaming SSR

Next.js 16 streams HTML progressively. Combined with `loading.tsx` and React Suspense, users see content as it becomes available rather than waiting for the entire page.

### Path Aliases

`@/*` maps to `./src/*` in `tsconfig.json`:

```typescript
import { api } from "@/lib/api"; // → frontend/src/lib/api.ts
```

---

## UI Library: React 19

| Property | Value                               |
| -------- | ----------------------------------- |
| Package  | `react` 19.2.3 / `react-dom` 19.2.3 |
| Role     | Component library, rendering engine |

React 19 brings:

- **Server Components** — render on the server, ship zero client JS for data-display components
- **Concurrent rendering** — non-blocking updates via `useTransition`, Suspense
- **`use` hook** — read promises and context inline in render
- **Improved Suspense** — first-class loading states for async Server Components
- **Actions** — `useActionState` and form actions for mutations

---

## CSS Framework: Tailwind CSS v4

| Property       | Value                                                          |
| -------------- | -------------------------------------------------------------- |
| Package        | `tailwindcss` ^4                                               |
| PostCSS plugin | `@tailwindcss/postcss` ^4                                      |
| Role           | Utility-first CSS framework                                    |
| Config         | CSS-based (`@theme` in `globals.css`), no `tailwind.config.js` |

Tailwind CSS v4 is a ground-up rewrite with the **Oxide** engine (written in Rust):

### Key Changes from v3

- **No `tailwind.config.js`.** Configuration is done in CSS with `@theme` directives.
- **Faster builds.** The Rust-based Oxide engine scans and generates utilities significantly faster.
- **CSS-first configuration.** Custom values, colors, and design tokens are defined in CSS.
- **PostCSS plugin.** Configured via `@tailwindcss/postcss` in `postcss.config.mjs`.

### Configuration

```javascript
// postcss.config.mjs
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
export default config;
```

```css
/* globals.css */
@import "tailwindcss";

@theme {
  --color-primary: #4f46e5;
  --color-secondary: #06b6d4;
}
```

### Zero Runtime

All styles are generated at build time. No CSS-in-JS runtime overhead, no style injection at runtime, no FOUC. This is a significant performance advantage over styled-components, Emotion, or CSS Modules with dynamic values.

---

## Class Utilities: clsx + tailwind-merge

| Package          | Version | Purpose                                  |
| ---------------- | ------- | ---------------------------------------- |
| `clsx`           | ^2.1.1  | Conditionally join class names           |
| `tailwind-merge` | ^3.4.1  | Merge Tailwind classes without conflicts |

### clsx

Composes class name strings conditionally:

```typescript
import { clsx } from "clsx";

clsx("base", isActive && "active", isDisabled && "opacity-50");
// → "base active" or "base opacity-50" or "base"
```

### tailwind-merge

Resolves conflicting Tailwind utilities (last wins):

```typescript
import { twMerge } from "tailwind-merge";

twMerge("px-4 px-8"); // → "px-8" (not "px-4 px-8")
twMerge("text-red-500 text-blue-500"); // → "text-blue-500"
```

### Combined Helper (cn)

The standard pattern combines both into a `cn` utility:

```typescript
// frontend/src/lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

```tsx
<div className={cn("p-4 rounded-lg", isActive && "bg-primary", className)} />
```

---

## Icons: Lucide React

| Property | Value                       |
| -------- | --------------------------- |
| Package  | `lucide-react` ^0.564.0     |
| Role     | SVG icon library            |
| Icons    | 1500+ icons, tree-shakeable |

Lucide is a fork of Feather Icons with a larger icon set. Each icon is a named export, enabling tree-shaking (unused icons are excluded from the bundle):

```tsx
import { Search, User, Settings, ChevronRight } from "lucide-react";

<Search className="h-4 w-4" />
<User className="h-5 w-5 text-muted" />
```

All icons accept `className`, `size`, `color`, `strokeWidth` props.

---

## TypeScript Configuration

### Backend (`backend/tsconfig.json`)

| Setting            | Value           | Reason                                        |
| ------------------ | --------------- | --------------------------------------------- |
| `target`           | ES2021          | Modern JS features, Bun supports them all     |
| `module`           | ES2022          | ESM with top-level await                      |
| `moduleResolution` | node            | Standard resolution                           |
| `types`            | `["bun-types"]` | Bun-specific APIs (Bun.serve, bun:test, etc.) |

### Frontend (`frontend/tsconfig.json`)

| Setting            | Value                  | Reason                                           |
| ------------------ | ---------------------- | ------------------------------------------------ |
| `target`           | ES2017                 | Browser compatibility                            |
| `module`           | esnext                 | Next.js handles module compilation               |
| `moduleResolution` | bundler                | Next.js bundler resolution                       |
| `jsx`              | react-jsx              | Automatic JSX transform (no React import needed) |
| `paths.@/*`        | `["./src/*"]`          | Import alias                                     |
| `plugins`          | `[{ "name": "next" }]` | Next.js TypeScript plugin                        |

---

## Linting: ESLint 9

| Property       | Value                             |
| -------------- | --------------------------------- |
| Package        | `eslint` ^9                       |
| Config extends | `eslint-config-next` 16.1.6       |
| Config format  | Flat config (`eslint.config.mjs`) |

ESLint 9 uses the new flat config format. `eslint-config-next` includes rules for React, JSX accessibility, and Next.js-specific patterns.

```bash
cd frontend && bun lint
```

---

## Full Dependency Manifest

### Backend Dependencies

| Package                       | Version  | Category                 |
| ----------------------------- | -------- | ------------------------ |
| `elysia`                      | ^1.4.25  | HTTP framework           |
| `@elysiajs/cors`              | ^1.4.1   | CORS middleware          |
| `@elysiajs/swagger`           | ^1.3.1   | OpenAPI documentation    |
| `@sinclair/typebox`           | ^0.34.48 | Schema validation        |
| `drizzle-orm`                 | ^0.45.1  | Database ORM             |
| `drizzle-typebox`             | ^0.3.3   | Schema-to-TypeBox bridge |
| `lucia`                       | ^3.2.2   | Authentication           |
| `@lucia-auth/adapter-drizzle` | ^1.1.0   | Lucia DB adapter         |
| `@paralleldrive/cuid2`        | ^3.3.0   | ID generation            |

### Backend Dev Dependencies

| Package       | Version | Category             |
| ------------- | ------- | -------------------- |
| `@types/bun`  | ^1.3.9  | Bun type definitions |
| `bun-types`   | latest  | Bun global types     |
| `drizzle-kit` | ^0.31.9 | Migration tooling    |

### Frontend Dependencies

| Package             | Version  | Category               |
| ------------------- | -------- | ---------------------- |
| `next`              | 16.1.6   | Framework              |
| `react`             | 19.2.3   | UI library             |
| `react-dom`         | 19.2.3   | React DOM renderer     |
| `@elysiajs/eden`    | ^1.4.8   | Type-safe API client   |
| `@sinclair/typebox` | ^0.34.48 | Shared schema types    |
| `clsx`              | ^2.1.1   | Class name utility     |
| `tailwind-merge`    | ^3.4.1   | Tailwind class merging |
| `lucide-react`      | ^0.564.0 | Icon library           |

### Frontend Dev Dependencies

| Package                | Version | Category           |
| ---------------------- | ------- | ------------------ |
| `tailwindcss`          | ^4      | CSS framework      |
| `@tailwindcss/postcss` | ^4      | PostCSS plugin     |
| `typescript`           | ^5      | Type checker       |
| `eslint`               | ^9      | Linter             |
| `eslint-config-next`   | 16.1.6  | Lint rules         |
| `@types/node`          | ^20     | Node type defs     |
| `@types/react`         | ^19     | React type defs    |
| `@types/react-dom`     | ^19     | ReactDOM type defs |

---

## End-to-End Type Safety Pipeline

The complete type flow from database to browser:

```
PostgreSQL Database
       │
       ▼
Drizzle Table Schema  (pgTable definitions in TypeScript)
       │
       ├──► drizzle-typebox ──► TypeBox Schemas (t.Object, t.String, etc.)
       │                              │
       │                              ▼
       │                     Elysia Route Validation (body, params, query, response)
       │                              │
       │                              ▼
       │                     export type App = typeof app
       │                              │
       │                              ▼
       │                     Eden Treaty Client (api.route.method())
       │                              │
       │                              ▼
       │                     React Components (typed props & responses)
       │
       └──► Drizzle Queries  (type-safe select/insert/update/delete)
```

**Zero manual type definitions at any layer.** A schema change in Drizzle surfaces compile-time errors across the entire stack.
