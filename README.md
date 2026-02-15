# WoW Character Analyzer

A web application that analyzes World of Warcraft characters' PvE performance across raids and Mythic+, combining raw data from multiple sources with AI-generated insights to paint a complete picture of any player.

## What It Does

**Queue any character** by name and realm, and the app builds a detailed performance profile by pulling data from three major sources:

- **WarcraftLogs** — raid parses, kill counts, death events, defensive cooldown usage, consumable usage
- **Raider.IO** — Mythic+ scores, best/recent runs, timed vs. depleted keys, historical seasons
- **Blizzard API** — character info (class, race, guild, profile picture), Cutting Edge & AotC achievements

All of this feeds into an **AI-generated summary** that highlights strengths, weaknesses, and specific areas for improvement — backed by actual data points, not vibes.

## Key Features

- **Rich Character Profiles** — Parse percentiles color-coded to the WarcraftLogs standard (gold, pink, orange, purple, blue, green, gray), death analysis, defensive/consumable usage rates, per-boss breakdowns, M+ stats, and achievement badges.
- **Two-Tier Processing** — A fast lightweight scan gets a usable profile up quickly (parses, M+ score, basic info). A background deep scan then enriches it with fight-level details (deaths, casts, progression logs).
- **AI Insights** — GPT-powered narrative summaries with a verdict, strengths/weaknesses, and concrete improvement suggestions based on the character's actual numbers.
- **Live Progress** — Character pages update in real-time as processing moves through each step.
- **Historical Coverage** — Tracks all seasons from Dragonflight onward, with new expansions/seasons added via config — no code changes needed.
- **Search & Browse** — Search characters by name, realm, class, or guild. Frontpage showcases recently analyzed and currently processing characters.
- **Battle.net Import** — Link your Battle.net account to pull your character list and queue them directly.

## Parse Tier System

Parses are categorized into tiers following the WarcraftLogs color scale:

| Parse | Tier          | Color  |
| ----- | ------------- | ------ |
| 100   | Legendary     | Gold   |
| 99    | Exceptional   | Pink   |
| 95–98 | Near Perfect  | Orange |
| 90–94 | Excellent     | Orange |
| 75–89 | Very Good     | Purple |
| 50–74 | Average       | Blue   |
| 25–49 | Below Average | Green  |
| 1–24  | Poor          | Gray   |

## Tech Stack

- **Runtime:** Bun
- **Backend:** Elysia (TypeScript)
- **Frontend:** Next.js 16 + React 19
- **Database:** PostgreSQL with Drizzle ORM
- **Queue:** Redis + BullMQ
- **UI:** Tailwind CSS v4 + shadcn/ui
- **Auth:** Lucia v3 (Discord & Battle.net OAuth2)
- **AI:** OpenAI (gpt-4o-mini)
- **Infra:** Docker Compose, Nginx, Let's Encrypt

## Architecture Highlights

The core design principle is **separating raw data from processed data**. Fetched API responses are stored permanently and never re-fetched. Computed profiles, statistics, and AI summaries are derived from that raw data and can be regenerated at any time — meaning analysis logic can be iterated on without burning API quota.

Processing runs through BullMQ with two priority queues (lightweight scan first, deep scan in the background), and the whole thing is sized to run on a single 1-core / 1 GB RAM VPS.

## Getting Started

### Prerequisites

- [Docker](https://www.docker.com/) and Docker Compose
- API credentials for: Discord, Battle.net, WarcraftLogs, OpenAI

### Environment Variables

Copy `.env.example` (if available) or configure the following:

```env
# Database
DATABASE_URL=postgresql://user:pass@db:5432/wow_analyzer

# Redis
REDIS_URL=redis://redis:6379

# OAuth
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
BATTLENET_CLIENT_ID=
BATTLENET_CLIENT_SECRET=

# External APIs
WCL_CLIENT_ID=
WCL_CLIENT_SECRET=
BLIZZARD_CLIENT_ID=
BLIZZARD_CLIENT_SECRET=
OPENAI_API_KEY=

# Admin
ADMIN_DISCORD_IDS=your_discord_id
```

### Run with Docker Compose

```bash
docker compose up
```

The app will be available at `http://localhost` (Nginx) with the API at `/api`.

## License

See [LICENSE](LICENSE) for details.
