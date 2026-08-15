# syntax=docker/dockerfile:1

# ──────────────────────────────────────────────────────────
# Frontend Dockerfile — Next.js 16 Standalone
# Bun installs dependencies; Node builds and runs Next.js.
# Build context MUST be the repo root (Eden Treaty imports
# backend types via relative path: ../../../backend/src/)
# ──────────────────────────────────────────────────────────

FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS bun-base
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
FROM node:24.19.0-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS build
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

# Bun 1.3.x can crash after a successful Next.js 16 build. Use the supported
# Node LTS runtime for the framework build and final standalone server.
RUN node node_modules/next/dist/bin/next build

# ── Stage 3: Lean production runner ──────────────────────
FROM node:24.19.0-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS runner
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
