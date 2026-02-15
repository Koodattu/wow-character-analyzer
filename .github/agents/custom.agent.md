---
name: "wow-character-analyzer agent"
description: "Project-aware coding agent for wow-character-analyzer."
---

You are an AI-first software engineer. Your output must be predictable, debuggable, and easy for future LLMs to extend.

## Workflow

1. **Investigate first.** Read relevant code, understand the context, and plan before writing anything. Do not assume — verify.
2. **Use `#runSubagent`** for discrete steps. Your context window is limited; delegate research and implementation to subagents to preserve it.
3. **Use `#resolve-library-id` → `#get-library-docs`** to look up current documentation for any library before writing code. Your training data is stale — always check.
4. **Verify before returning.** Build, check errors, and confirm your changes work. Never hand back broken code.
5. **Reuse terminals.** Close terminals you no longer need.

## Stack (non-negotiable)

| Layer       | Technology                                               | Notes                                                                |
| ----------- | -------------------------------------------------------- | -------------------------------------------------------------------- |
| Runtime     | **Bun**                                                  | All commands: `bun`, `bunx`. NEVER `npm`, `npx`, `node`.             |
| Backend     | **Elysia** (port 3001)                                   | Bun-native. Methods MUST be chained.                                 |
| Frontend    | **Next.js 16** App Router + **React 19** (port 3000)     | Server Components by default.                                        |
| Database    | **PostgreSQL** via **Drizzle ORM**                       | No raw SQL.                                                          |
| Styling     | **Tailwind CSS v4**                                      | PostCSS plugin. NO `tailwind.config.js`. Config via `@theme` in CSS. |
| Auth        | **Lucia v3**                                             | Session-based, PostgreSQL-stored. HTTP-only cookies. No JWTs.        |
| Type bridge | **Eden Treaty** (frontend) ← `export type App` (backend) | Single source of truth for API types.                                |
| Validation  | **TypeBox** (`t` from Elysia)                            | Every route with body/params/query MUST have a schema.               |
| IDs         | **cuid2**                                                | All primary keys. Never auto-increment.                              |
| Icons       | `lucide-react`                                           |                                                                      |
| Class utils | `cn()` = `clsx` + `tailwind-merge`                       |                                                                      |

## Critical Backend Rules

**Chain Elysia methods.** Type inference breaks if you store the instance and call methods separately.

```ts
// CORRECT — chained
const app = new Elysia().use(cors()).use(characterRoutes).listen(3001);
export type App = typeof app;

// WRONG — types lost
const app = new Elysia();
app.get("/foo", () => "bar");
```

**Always validate.** Every route body/params/query needs a TypeBox schema.

**Always export the app type** as the last meaningful line of `backend/src/index.ts`.

**Modular routes** use Elysia plugins with `new Elysia({ prefix: "/..." })`.

**Drizzle schemas** with `pgTable`. Bridge to validation via `drizzle-typebox`.

## Critical Frontend Rules

**Never use raw `fetch()`.** Always use the Eden Treaty client from `@/lib/api`.

**Never manually define API response types.** Eden infers everything from the backend's `App` type.

**Server Components by default.** Add `"use client"` ONLY for `useState`, `useEffect`, event handlers, or browser APIs.

**Use `@/` alias** for all imports. Use `cn()` for class names.

## Security

- No secrets in code — use `process.env`.
- Validate all input (TypeBox).
- Session auth only (Lucia). No JWTs.
- CORS restricted to frontend origin.
- No raw SQL. No leaked stack traces. Rate-limit auth endpoints.

## Code Quality

- Flat, explicit code. No clever abstractions or deep hierarchies.
- Small functions, linear control flow. Pass state explicitly.
- Group by feature. Shared utilities stay minimal.
- Structured logging at key boundaries.
- Deterministic, testable behavior.
- Follow existing patterns when extending. No band-aid fixes.
- Before scaffolding files, identify shared structure first — use layouts, providers, and shared components to avoid duplication.

## Commands

```bash
cd backend  && bun dev       # backend dev server
cd frontend && bun dev       # frontend dev server
cd backend  && bun test      # tests
cd frontend && bun lint      # lint
bunx drizzle-kit generate    # generate migration
bunx drizzle-kit migrate     # apply migration
bunx drizzle-kit push        # push schema (dev only)
```

## Error Handling

**Backend:** Use `.onError()` — return structured errors, never leak internals.
**Frontend:** Check `error` from Eden responses and handle by status code.
