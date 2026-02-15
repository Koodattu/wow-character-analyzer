# WoW Character Analyzer — Technical Documentation

## Overview

WoW Character Analyzer is a full-stack TypeScript application for analyzing World of Warcraft characters. It is built on a modern, performance-oriented stack: **Bun** runtime, **Elysia** HTTP framework, **PostgreSQL** with **Drizzle ORM**, **Next.js 16**, **React 19**, and **Tailwind CSS v4**. End-to-end type safety is achieved via **Eden Treaty**, which generates a fully typed API client directly from the Elysia backend — no manual API types, no code generation step.

---

## Technology Stack

| Layer               | Technology                      | Version | Purpose                                                          |
| ------------------- | ------------------------------- | ------- | ---------------------------------------------------------------- |
| Runtime & Toolchain | **Bun**                         | latest  | TypeScript-native runtime, bundler, test runner, package manager |
| Backend Framework   | **Elysia**                      | 1.4.x   | Bun-native HTTP framework with TypeBox schema validation         |
| Database            | **PostgreSQL**                  | —       | Primary relational data store                                    |
| ORM                 | **Drizzle ORM**                 | 0.45.x  | Type-safe, SQL-like ORM with zero-overhead query building        |
| Schema Bridge       | **drizzle-typebox**             | 0.3.x   | Generates TypeBox schemas from Drizzle table definitions         |
| Migrations          | **Drizzle Kit**                 | 0.31.x  | Schema migrations and introspection                              |
| Authentication      | **Lucia**                       | 3.2.x   | Modern, session-based auth library                               |
| Auth DB Adapter     | **@lucia-auth/adapter-drizzle** | 1.1.x   | Lucia adapter for Drizzle ORM                                    |
| ID Generation       | **@paralleldrive/cuid2**        | 3.3.x   | Collision-resistant, URL-safe unique IDs                         |
| API Docs            | **@elysiajs/swagger**           | 1.3.x   | Auto-generated OpenAPI/Swagger docs from Elysia schemas          |
| Type Bridge         | **Eden Treaty**                 | 1.4.x   | Type-safe RPC client generated from Elysia's exported app type   |
| Frontend Framework  | **Next.js**                     | 16.1.x  | App Router, Server Components, streaming SSR                     |
| UI Library          | **React**                       | 19.2.x  | Concurrent rendering, Server Components                          |
| CSS Framework       | **Tailwind CSS**                | 4.x     | Utility-first CSS via PostCSS plugin                             |
| Icons               | **Lucide React**                | 0.564.x | Consistent, tree-shakeable SVG icon set                          |
| Utility: classnames | **clsx** + **tailwind-merge**   | latest  | Conditional class composition with Tailwind conflict resolution  |
| Schema Validation   | **TypeBox (@sinclair/typebox)** | 0.34.x  | JSON Schema-compatible type validation (shared backend/frontend) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        Client                           │
│  Next.js 16 (App Router) + React 19 + Tailwind CSS v4  │
│  Eden Treaty client ← type-inferred from backend        │
│  Port 3000                                              │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP (typed via Eden)
┌──────────────────────▼──────────────────────────────────┐
│                       Backend                           │
│  Bun runtime + Elysia framework                         │
│  TypeBox validation · Swagger docs · CORS               │
│  Lucia auth · Drizzle ORM                               │
│  Port 3001                                              │
└──────────────────────┬──────────────────────────────────┘
                       │ SQL (via Drizzle)
┌──────────────────────▼──────────────────────────────────┐
│                     PostgreSQL                          │
│  Relational data store                                  │
│  Managed via Drizzle Kit migrations                     │
└─────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

- **Monorepo with independent packages.** `backend/` and `frontend/` each have their own `package.json` and `tsconfig.json`. No workspace orchestrator — just two Bun projects side by side.
- **End-to-end type safety without codegen.** The backend exports `type App = typeof app`. The frontend imports this type and passes it to Eden Treaty. Route paths, request bodies, query params, and response shapes are all inferred at compile time.
- **Drizzle + TypeBox bridge.** `drizzle-typebox` generates TypeBox schemas from Drizzle table definitions, which Elysia uses directly for request validation. One source of truth: database schema → validation → API types → client types.
- **Session-based auth via Lucia.** Lucia v3 with the Drizzle adapter handles session management. No JWTs — sessions are stored server-side in PostgreSQL.

---

## Project Structure

```
/wow-character-analyzer
├── backend/
│   ├── src/
│   │   └── index.ts              # Elysia entry point, exports `type App`
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── app/                  # Next.js App Router
│   │   │   ├── layout.tsx        # Root layout (Geist font, Tailwind)
│   │   │   ├── page.tsx          # Home page
│   │   │   └── globals.css       # Tailwind v4 entry (@import "tailwindcss")
│   │   └── lib/
│   │       └── api.ts            # Eden Treaty client
│   ├── public/                   # Static assets
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.ts
│   ├── postcss.config.mjs        # Tailwind via @tailwindcss/postcss
│   └── eslint.config.mjs
├── docs/
│   └── README.md                 # This file
├── LICENSE
└── README.md
```

---

## Performance & Optimization Rationale

### Why Bun

Bun replaces Node.js, npm, and ts-node in a single binary. It executes TypeScript natively without a transpilation step. Key performance advantages:

- **Startup time:** ~4x faster than Node.js for TypeScript files.
- **Package installation:** Bun's package manager is significantly faster than npm/yarn/pnpm due to hardlink-based caching and native resolution.
- **Built-in test runner:** `bun:test` is Jest-compatible without the overhead of additional tooling.
- **Built-in bundler and transpiler:** Eliminates the need for separate build tooling like esbuild or swc for backend code.

### Why Elysia

Elysia is purpose-built for Bun. It achieves high throughput by leveraging Bun's native HTTP server and avoids the overhead patterns common in Express/Fastify:

- **Compile-time type inference:** Route schemas defined with TypeBox are inferred at compile time, enabling end-to-end type safety through Eden without runtime reflection.
- **Method chaining for type propagation:** Elysia's chained API preserves full type information across the entire route tree.
- **Built-in validation:** TypeBox schemas validate request bodies, query params, and path params with zero additional dependencies.
- **Plugin architecture:** Routes are composed as Elysia plugin instances with prefixes, enabling modular code without losing type safety.

### Why PostgreSQL + Drizzle ORM

- **PostgreSQL:** Battle-tested relational database. Ideal for structured data like character profiles, gear sets, and analysis results where relationships and query flexibility matter.
- **Drizzle ORM:** SQL-like API with zero overhead. Unlike Prisma, Drizzle does not use a query engine binary — it generates SQL strings and sends them directly to the database driver. This results in faster queries and a smaller deployment footprint.
- **Drizzle Kit:** Handles schema migrations with `generate`, `migrate`, `push`, and `introspect` commands. No separate migration tool needed.

### Why Next.js 16 + React 19

- **React Server Components:** Data fetching happens on the server by default. Components that don't need interactivity never ship JavaScript to the client, reducing bundle size.
- **Streaming SSR:** Next.js 16 streams HTML as Server Components resolve, improving Time to First Byte (TTFB).
- **React 19 concurrent features:** Transitions, Suspense boundaries, and the `use` hook enable progressive rendering without blocking the UI.
- **App Router:** File-system routing with nested layouts, loading states, and error boundaries built into the folder structure.

### Why Tailwind CSS v4

- **Engine rewrite:** Tailwind v4 uses a new Rust-based engine (Oxide) that is significantly faster at scanning and generating utilities.
- **PostCSS plugin:** Configured via `@tailwindcss/postcss` — no `tailwind.config.js` needed for basic usage. Configuration moves into CSS with `@theme`.
- **Zero-runtime:** All styles are generated at build time. No CSS-in-JS runtime overhead.

---

## Type Safety Pipeline

The type safety chain flows from database schema to the browser with zero manual type definitions:

```
Drizzle Table Schema
        │
        ▼
  drizzle-typebox  ──►  TypeBox Schemas (t.Object, t.String, etc.)
        │
        ▼
  Elysia Route Validation  ──►  `export type App = typeof app`
        │
        ▼
  Eden Treaty Client  ──►  Fully typed `api.route.method()` calls
        │
        ▼
  React Components  ──►  Type-safe props and responses
```

This means:

- Adding a column to a Drizzle table automatically surfaces as a new field in API responses and the frontend — with compile-time errors if anything is mismatched.
- Renaming a field in the schema immediately shows type errors everywhere it was used.
- No `.d.ts` files, no GraphQL codegen, no manual `interface` definitions for API shapes.

---

## Authentication

**Lucia v3** handles session-based authentication:

- Sessions are stored in PostgreSQL via `@lucia-auth/adapter-drizzle`.
- Session tokens are managed as HTTP-only cookies.
- `@paralleldrive/cuid2` generates collision-resistant IDs for users and sessions.
- No JWTs — session validation is a database lookup, ensuring immediate revocation capability.

---

## API Documentation

**@elysiajs/swagger** auto-generates OpenAPI documentation from Elysia's TypeBox schemas. Available at `/swagger` in development. Every route with a schema definition is automatically documented with request/response types.

---

## Development

### Prerequisites

- **Bun** (latest) — [bun.sh](https://bun.sh)
- **PostgreSQL** — local instance or containerized
- **Node.js** is NOT required

### Commands

All commands use `bun`. Never use `npm` or `npx`.

```bash
# Install dependencies
cd backend && bun install
cd ../frontend && bun install

# Start backend (port 3001, watch mode)
cd backend
bun dev                        # bun run --watch src/index.ts

# Start frontend (port 3000)
cd frontend
bun dev                        # next dev

# Database migrations
cd backend
bunx drizzle-kit generate      # generate migration from schema changes
bunx drizzle-kit migrate       # apply pending migrations
bunx drizzle-kit push          # push schema directly (dev only)
bunx drizzle-kit studio        # open Drizzle Studio GUI

# Type check
cd backend && bun tsc --noEmit
cd frontend && bun tsc --noEmit

# Tests
cd backend && bun test
bun test --watch               # watch mode
bun test --coverage            # with coverage

# Linting
cd frontend && bun lint
```

---

## Eden Treaty: End-to-End Typed API Client

Eden Treaty creates a fully typed RPC client from the Elysia app type. Routes map to object paths, HTTP methods map to function calls.

### Setup

```typescript
// frontend/src/lib/api.ts
import { treaty } from "@elysiajs/eden";
import type { App } from "../../../backend/src/index";

export const api = treaty<App>("http://localhost:3001");
```

### Usage

```typescript
// GET — fully typed response
const { data, error } = await api.index.get();

// POST — typed body, typed response
const { data, error } = await api.user.post({ name: "Alice" });

// Dynamic route params
const { data } = await api.users["123"].get();

// Query parameters
const { data } = await api.search.get({ query: { q: "term", page: 1 } });
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

---

## Frontend Patterns

### Server Components (Default)

All `app/` components are Server Components by default. They can be `async`, fetch data on the server, and ship zero JavaScript to the client:

```tsx
import { api } from "@/lib/api";

export default async function CharacterPage() {
  const { data } = await api.characters["some-id"].get();
  return <h1>{data?.name}</h1>;
}
```

### Client Components

Add `"use client"` only when the component needs state, effects, or browser APIs:

```tsx
"use client";
import { useState } from "react";

export function SearchBar() {
  const [query, setQuery] = useState("");
  // ...
}
```

### Styling

- Tailwind CSS v4 via `@tailwindcss/postcss` plugin.
- `clsx` + `tailwind-merge` for conditional class composition without Tailwind conflicts.
- `lucide-react` for consistent, tree-shakeable SVG icons.
- Geist and Geist Mono fonts loaded via `next/font/google`.

### Path Aliases

`@/*` maps to `./src/*` in the frontend `tsconfig.json`:

```typescript
import { api } from "@/lib/api"; // → frontend/src/lib/api.ts
```

---

## Backend Patterns

### Route Definition

Always chain methods on the Elysia instance. Always validate with TypeBox schemas:

```typescript
const app = new Elysia()
  .use(cors())
  .get("/characters/:id", ({ params }) => getCharacter(params.id), {
    params: t.Object({ id: t.String() }),
  })
  .post("/characters", ({ body }) => createCharacter(body), {
    body: t.Object({
      name: t.String(),
      realm: t.String(),
      region: t.String(),
    }),
  })
  .listen(3001);

export type App = typeof app;
```

### Modular Routes

Use Elysia plugin instances with prefixes to organize routes:

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

---

## Code Generation Rules

When generating or modifying code in this project:

1. **Runtime:** Always use `bun`. Never `npm`, `npx`, or `node`.
2. **Backend routes:** Always chain on the Elysia instance. Always include TypeBox validation schemas.
3. **API calls:** Always use the Eden Treaty client from `@/lib/api`. Never use raw `fetch`.
4. **Types:** Never manually define API request/response interfaces. Eden infers them.
5. **Imports:** Use `@/` alias in frontend. Use relative paths in backend.
6. **Components:** Default to Server Components. Only add `"use client"` when required.
7. **IDs:** Use `cuid2` for all generated identifiers.
8. **Database:** Define schemas with Drizzle. Use `drizzle-typebox` to bridge to Elysia validation.
