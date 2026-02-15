# 🚀 Project Blueprint: Bun + Elysia + Next.js (2026)

## 📌 TL;DR for LLMs

This project uses **Bun** as the primary runtime and package manager. The backend is powered by **ElysiaJS**, chosen for its high-performance Zig-based core and native TypeScript support. The frontend is **Next.js (React)**. Both are linked via **Eden Treaty** to provide end-to-end type safety without manual schema synchronization.

---

## 🛠 The Tech Stack Defined

- **Bun:** A fast JavaScript runtime, package manager, and test runner. It replaces Node.js, npm, and `ts-node`. It executes `.ts` files directly.
- **ElysiaJS:** A "Bun-native" backend framework. It is significantly faster than Express/Fastify and uses **TypeBox** for schema validation.
- **Eden Treaty:** A client library for Elysia that allows the Frontend to "consume" the Backend as a typed object. **If the backend changes, the frontend build fails.**
- **Next.js:** The React framework for the frontend, running on the Bun runtime for optimized SSR.

---

## 📂 Recommended Project Structure

A "Workspace" (Monorepo) approach is best for Eden Treaty to work seamlessly.

```text
/my-app
├── apps/
│   ├── backend/          # ElysiaJS API
│   │   ├── src/
│   │   │   ├── index.ts  # Main entry & App Type export
│   │   │   └── routes/   # Modular route controllers
│   │   └── package.json
│   └── frontend/         # Next.js App
│       ├── src/
│       │   ├── app/      # App Router
│       │   └── lib/
│       │       └── api.ts # Eden Treaty Client
│       └── package.json
├── package.json          # Root workspace config
└── bun.lockb             # Single lockfile for speed

```

---

## 🚦 Best Practices & Rules

### 1. Backend (Elysia)

- **Chain Everything:** Use Elysia’s fluent API. It’s optimized for TypeScript inference.
- **Validation:** Always use `t.Object()` from `elysia` for `body`, `query`, and `params`. This generates the types for the frontend automatically.
- **Export the Type:** You **must** export the type of the app instance: `export type App = typeof app;` at the end of your main backend file.

### 2. The Bridge (Eden Treaty)

- **Single Source of Truth:** Do not write manual interfaces for API responses in the frontend.
- **Setup:** In `frontend/src/lib/api.ts`, initialize the treaty:

```typescript
import { treaty } from "@elysiajs/eden";
import type { App } from "../../backend/src/index";
export const api = treaty<App>("localhost:3000");
```

### 3. Frontend (Next.js)

- **Server Components:** Use standard `fetch` or Bun’s native `Bun.file()` for high-speed I/O inside Server Components.
- **Client Components:** Use the `api` object (Eden) for user interactions (forms, buttons) to get full autocomplete.

### 4. Workflow

- **Installation:** Use `bun install`, never `npm`.
- **Execution:** Run the dev environment using `bun dev`.
- **Type Checking:** Run `bun x tsc --noEmit` from the root to check both apps at once.

---

## 🤖 AI Instructions for this Project

> "When generating code for this project, prioritize Elysia's chainable route syntax. Ensure all backend endpoints include a schema validation block using the `t` object. When writing frontend data fetching, always use the `api` treaty client rather than raw `fetch` strings to ensure type safety."
