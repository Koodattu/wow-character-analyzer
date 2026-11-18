# syntax=docker/dockerfile:1

# ──────────────────────────────────────────────────────────
# Frontend Dockerfile — Next.js 16 Standalone
# Bun installs dependencies; Node builds and runs Next.js.
# Build context MUST be the repo root (Eden Treaty imports
# backend types via relative path: ../../../backend/src/)
# ──────────────────────────────────────────────────────────

FROM oven/bun:1.4.4-alpine@sha256:4cf82f5686b196504fe119db3fcd9185b191f82ece82c40680e597228ec6070a AS bun-base
WORKDIR /app

# ── Stage 1: Install all dependencies (including dev) ────
FROM bun-base AS frontend-deps
COPY frontend/package.json frontend/bun.lock /temp/frontend/
RUN cd /temp/frontend && bun install --frozen-lockfile

# Backend dependencies are needed only while resolving Eden Treaty types.
FROM bun-base AS backend-deps
COPY backend/package.json backend/bun.lock /temp/backend/
RUN cd /temp/backend && bun install --frozen-lockfile

# ── Stage 2: Build Next.js ───────────────────────────────
FROM node:26.13.1-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS build
WORKDIR /app

# Copy backend types after their dependency layer so source changes do not
# invalidate either frozen dependency install.
COPY --from=backend-deps /temp/backend/node_modules ./backend/node_modules
COPY backend/package.json ./backend/package.json
COPY backend/bun.lock ./backend/bun.lock
COPY backend/tsconfig.json ./backend/tsconfig.json
COPY backend/src ./backend/src

# Copy frontend source and deps
WORKDIR /app/frontend
COPY --from=frontend-deps /temp/frontend/node_modules ./node_modules
COPY frontend/ .

# NEXT_PUBLIC_ vars must be available at build time
# Passed via docker-compose build.args
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

ENV NODE_ENV=production

# Use the same Node LTS runtime for the build and standalone server.
RUN node node_modules/next/dist/bin/next build

# ── Stage 3: Lean production runner ──────────────────────
FROM node:26.13.1-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy only the standalone output, static assets, and public dir
COPY --from=build /app/frontend/.next/standalone ./
COPY --from=build /app/frontend/.next/static ./.next/static
COPY --from=build /app/frontend/public ./public

# Run as the non-root user provided by the Node image.
USER node

EXPOSE 3000

# Next.js standalone server must bind to 0.0.0.0 inside Docker
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

CMD ["node", "server.js"]
