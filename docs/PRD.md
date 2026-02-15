## Plan: WoW Character Analyzer — Product Requirements Document

### TL;DR

A full-stack TypeScript web application that analyzes World of Warcraft characters' PvE performance (raids + M+) by aggregating data from WarcraftLogs, Raider.IO, and the Blizzard API, then presenting a rich character profile with AI-generated insights. Users log in via Discord or Battle.net, queue characters for analysis, and browse dynamically-updating character pages. The system separates **raw data collection** from **data processing** — fetched data is stored permanently, while computed profiles can be regenerated at any time by re-running analysis logic. Two processing tiers exist: a fast lightweight scan (prioritized when users are queueing) and a slow deep scan (background, progression logs). Runs on a single 1-core/1GB RAM VPS via Docker.

**Existing stack:** Bun runtime, Elysia backend, Next.js 16 + React 19 frontend, PostgreSQL + Drizzle ORM, BunQueue (embedded job queue), Tailwind CSS v4 + shadcn/ui, Lucia v3 auth, Eden Treaty type bridge — all scaffolded but not yet implemented. Docker Compose with Nginx/Certbot production config already in place.

---

### 1. Authentication & Authorization

**1.1 OAuth Providers**

- **Discord OAuth2** — primary login method. Uses Discord's OAuth2 flow to authenticate users.
- **Battle.net OAuth2** — used both for login and for linking an account to fetch the user's WoW characters from the Blizzard API (`/profile/user/wow` endpoint).
- Both providers create/link to the same internal user record via Lucia v3 sessions stored in PostgreSQL.
- Anonymous users can browse the frontpage, search characters, and view character pages (read-only).

**1.2 Battle.net Character Import**

- After logging in (via either provider), users can link their Battle.net account (OAuth2 with `wow.profile` scope).
- On linking, fetch the user's character list from Blizzard API.
- User selects up to 3 characters at a time to queue for processing.
- Users can also manually queue any character by typing `character-name` + `realm-name`.

**1.3 Admin**

- Admin users identified by matching Discord user ID against a comma-separated list in the `ADMIN_DISCORD_IDS` environment variable.
- Admin panel accessible at `/admin` (frontend route, protected).
- Admin capabilities: trigger reprocessing (all or per-character), view queue state, view rate limit status, manage seasons/expansions config.

---

### 2. Data Architecture — The Core Principle

The **most critical architectural decision**: separate **raw fetched data** from **processed/computed profiles**.

**2.1 Raw Data Layer (immutable, never deleted)**

- Data fetched from external APIs (WCL fights, Blizzard profile info, Raider.IO runs) is stored as-is in PostgreSQL.
- This includes: fight events, death events, cast events (defensives, healthstones, health potions), parse rankings, report metadata, guild associations, Blizzard character profile data, Raider.IO M+ data.
- Raw data is **never refetched** for the same entity. If we already have fight ID X from WCL, we skip it.
- JSONB columns used heavily for flexible event/fight data that varies by encounter.

**2.2 Processed Data Layer (derived, rebuildable)**

- Character profiles, statistics, aggregations, AI summaries — all computed from raw data.
- Can be **dropped and regenerated** at any time by re-running processing logic against raw data.
- This enables iterating on analysis algorithms without re-hitting external APIs.
- Admin can trigger reprocessing via the admin panel.

**2.3 Database Schema — High-Level Tables**

| Table                   | Purpose                                                                                              | Layer     |
| ----------------------- | ---------------------------------------------------------------------------------------------------- | --------- |
| `users`                 | Auth accounts (Discord/Bnet linked)                                                                  | Auth      |
| `sessions`              | Lucia v3 sessions                                                                                    | Auth      |
| `oauth_accounts`        | Provider-specific OAuth data per user                                                                | Auth      |
| `characters`            | Canonical character records (name, realm, region, class, race, faction, guild, profile pic, bnet ID) | Raw       |
| `character_queue`       | BunQueue-managed but tracked here for UI: who queued, priority, status                               | Queue     |
| `processing_state`      | Per-character scan progress: which steps done, lightweight vs deep scan status                       | Queue     |
| `expansions`            | Expansion definitions (id, name, slug, logo URL, min season, max season)                             | Config    |
| `seasons`               | Season definitions per expansion (id, expansion_id, name, number)                                    | Config    |
| `raids`                 | Raid definitions per season (id, season_id, name, slug, icon URL, WCL zone ID)                       | Config    |
| `bosses`                | Boss definitions per raid (id, raid_id, name, slug, icon URL, WCL encounter ID)                      | Config    |
| `dungeons`              | Dungeon definitions per season (id, season_id, name, slug)                                           | Config    |
| `spec_defensives`       | Defensive ability IDs per spec per season                                                            | Config    |
| `season_consumables`    | Healthstone, health potion, and other consumable ability IDs per season                              | Config    |
| `wcl_reports`           | WCL report metadata (report code, title, guild, start/end time)                                      | Raw       |
| `wcl_fights`            | Individual fight data within reports (fight ID, encounter, kill/wipe, duration, start/end)           | Raw       |
| `wcl_parses`            | Per-character per-fight parse data (percentile, DPS/HPS, spec, ilvl)                                 | Raw       |
| `wcl_deaths`            | Death events per character per fight (timestamp, ability, killer, order of death)                    | Raw       |
| `wcl_casts`             | Relevant cast events per character per fight (defensives, healthstones, health potions)              | Raw       |
| `blizzard_achievements` | Achievement data (Cutting Edge, AotC, etc.) per character                                            | Raw       |
| `raiderio_runs`         | M+ run data per character (dungeon, key level, score, timed/depleted, date)                          | Raw       |
| `raiderio_scores`       | Overall M+ score per character per season                                                            | Raw       |
| `character_profiles`    | **Computed** aggregate profile: stats, parse averages, death patterns, defensive usage rates         | Processed |
| `character_boss_stats`  | **Computed** per-boss statistics: kills, avg parse, deaths, first-death rate, etc.                   | Processed |
| `character_ai_summary`  | **Computed** AI-generated text summary and verdict                                                   | Processed |

---

### 3. External API Integration

**3.1 WarcraftLogs API v2 (GraphQL)**

- **Primary data source** for raid performance: fights, parses, deaths, casts.
- Authentication: OAuth2 client credentials flow (client ID + secret → bearer token).
- **Rate limit handling**: Global rate limit tracker. Each WCL GraphQL response includes `X-RateLimit-*` headers (points remaining, reset time). Track this in-memory (shared across BunQueue workers via a singleton). When approaching the limit, pause processing and resume after reset. Display rate limit status in admin panel.
- **Fetch strategy per character**:
  - **Lightweight scan** (priority): Fetch character's ranked kills via `characterData.character.encounterRankings` for each tracked boss. This gives kill count, best/median parse, and basic data with minimal API points.
  - **Deep scan** (background): For each kill, fetch the full report → fight details → events (deaths, casts for defensives/consumables). Navigate from character → fights → reports → potentially guild reports for progression (wipe) logs.
- **Deduplication**: Before fetching, check if we already have the report/fight in the DB. Skip known data.

**3.2 Blizzard API**

- **Character profile**: `/profile/wow/character/{realm}/{name}` — race, class, faction, guild, avatar/profile picture, active spec.
- **Achievements**: `/profile/wow/character/{realm}/{name}/achievements` — filter for Cutting Edge and Ahead of the Curve achievement IDs.
- **Media/icons**: Boss icons, raid icons from game data APIs. Ability icons from `/data/wow/media/spell/{spellId}`.
- **User characters**: `/profile/user/wow` (requires user OAuth token with `wow.profile` scope) — list all characters on the linked Bnet account.
- Rate limit: 36,000 requests/hour (generous). Add ~200ms sleep between requests as courtesy.

**3.3 Raider.IO API**

- **M+ data**: `https://raider.io/api/v1/characters/profile` with `mythic_plus_scores_by_season`, `mythic_plus_best_runs`, `mythic_plus_recent_runs`, `mythic_plus_alternate_runs`.
- **Raid data** (supplementary): Raid progression, raid kill timestamps (start/end dates for boss kills — useful for determining raid duration context).
- No auth required (public API). Add ~200ms sleep between requests.
- Fetch as many runs as the API provides (best runs, recent runs, alternate runs per dungeon).

---

### 4. Processing Pipeline

**4.1 Queue System — BunQueue (Embedded)**

- Uses BunQueue in **embedded mode** — a BullMQ-compatible job queue built for Bun with zero external dependencies. No Redis required.
- Persistence via embedded SQLite (automatic, configured via `dataPath`). Queue state survives restarts without a separate service.
- Two BunQueue queues:
  - **`lightweight-scan`** — high priority. Processes the initial character scan (Blizzard profile + WCL ranked kills + Raider.IO M+ score/runs). Yields a usable character page quickly.
  - **`deep-scan`** — low priority. Fetches full fight events (deaths, casts, progression logs) for richer analysis. Only runs when `lightweight-scan` queue is empty.
- Both queues process **one job at a time** (single concurrency) to respect the 1-core constraint and API rate limits.
- Processing state persisted in PostgreSQL (`processing_state` table) so the frontend can show exactly which step a character is on.
- On server restart, BunQueue resumes from its SQLite store. Any in-progress jobs are retried.

**4.2 Lightweight Scan Steps** (per character)

1. **Blizzard Profile Fetch** — race, class, faction, guild, profile pic, spec.
2. **Blizzard Achievements Fetch** — Cutting Edge, Ahead of the Curve for tracked seasons.
3. **WCL Rankings Fetch** — For each tracked boss (current + historical seasons), fetch encounter rankings. Stores kill count, best parse, median parse, fastest kill.
4. **Raider.IO Fetch** — M+ score, best/recent/alternate runs for current season, plus historical seasons.
5. **Initial Profile Computation** — Crunch the fetched data into `character_profiles` and `character_boss_stats`. Generate parse tier labels (see Section 6).
6. **AI Summary Generation** — Build prompt from computed stats, send to OpenAI, store result.

**4.3 Deep Scan Steps** (per character, after lightweight is done)

1. **WCL Report Discovery** — From ranked kills, extract report codes. Additionally, search for guild reports and personal logs for progression (wipe) data.
2. **WCL Fight Detail Fetch** — For each report/fight, fetch detailed events: death events (who died, when, to what), cast events (filter for defensive abilities, healthstones, health potions by ability ID).
3. **Extended Profile Recomputation** — Recompute `character_profiles` and `character_boss_stats` with deeper data: death frequency, first-death rate, how early they died, defensive usage rate, healthstone/potion usage rate.
4. **AI Summary Regeneration** — Re-run AI summary with richer data.

**4.4 Rate Limit Orchestration**

- A global rate limit manager (singleton in the backend process) tracks points remaining for WCL, request counts for Blizzard/Raider.IO.
- Each API call updates the tracker from response headers.
- When WCL points are near exhaustion, the manager pauses the BunQueue worker (via `worker.pause()`). A timer resumes processing (via `worker.resume()`) when the rate limit resets (timestamp provided by WCL).
- All API calls include a configurable sleep interval (default 200ms) between sequential requests.
- Admin panel displays: current points remaining, reset timestamp, requests made this hour, characters in queue, estimated time to completion.

---

### 5. Frontend — Pages & Components

**5.1 Page Structure**

| Route                       | Description                                                                       | Auth Required |
| --------------------------- | --------------------------------------------------------------------------------- | ------------- |
| `/`                         | Frontpage — random selection of processed/processing characters, hero section     | No            |
| `/search`                   | Search all processed/processing characters by name, realm, class, guild           | No            |
| `/character/{realm}/{name}` | Character profile page — the main feature                                         | No            |
| `/login`                    | Login page with Discord + Battle.net OAuth buttons                                | No            |
| `/dashboard`                | User dashboard — link Bnet, queue characters, see their queued characters' status | Yes           |
| `/admin`                    | Admin panel — queue management, reprocessing, rate limit monitor, season config   | Admin         |

**5.2 Frontpage (`/`)**

- Hero section with app branding.
- "Recently Analyzed" — grid of character cards (random selection of recently processed characters).
- "Currently Processing" — live-updating list of characters being scanned right now.
- Search bar shortcut.
- Quick-queue input (character name + realm) for logged-in users.

**5.3 Search Page (`/search`)**

- Full-text search across character names, realm names, guild names.
- Filter by: class, faction, expansion, processing status (complete / in progress).
- Results show character cards with: name, realm, class icon, guild, processing status badge, top parse.

**5.4 Character Profile Page (`/character/{realm}/{name}`) — The Core Page**

This page is **highly dynamic**. It uses polling (short-polling via Eden Treaty, every 2-5 seconds while processing is active) to show real-time progress.

**Layout sections:**

- **Header**: Character name, realm, guild, race, class, spec, profile picture (from Blizzard API). Faction-themed styling.
- **Processing Status Banner**: If still processing, show which step is active, progress bar, ETA. Disappears when done.

- **Raid Performance Section** (per expansion → per raid → per boss):
  - Expansion selector with expansion logos.
  - Raid tabs with raid logos/icons.
  - Per-boss rows with boss icons showing:
    - Kill count, best parse (color-coded by tier), median parse, worst parse.
    - Deaths: total, average per kill, first-death rate (% of kills where this character died first), average time-of-death (how early in the fight they tend to die).
    - Defensive usage rate (% of kills where they used their defensive CDs).
    - Healthstone usage rate, Health potion usage rate.
    - Parse tier badge (see Section 6).
  - Expandable detail per boss: individual kill list with per-kill parse, deaths, defensive usage.

- **M+ Section**:
  - Current season M+ score (overall + role-specific).
  - Best run per dungeon: key level, timed/depleted, score.
  - Weekly runs count (has ran 8x +10 weekly?).
  - Historical season scores.
  - Total runs, timed %, depletion %.

- **Achievements Section**:
  - Cutting Edge badges per tier (with raid icon).
  - Ahead of the Curve badges per tier.

- **AI Summary Section**:
  - AI-generated narrative summary of the character's performance.
  - Verdict: overall assessment.
  - Strengths and weaknesses.
  - Specific improvement suggestions.
  - Pitfalls identified.

**5.5 Dashboard (`/dashboard`)**

- "Link Battle.net" button if not linked → OAuth flow → returns with character list.
- Character picker: shows all WoW characters from linked Bnet account. Select up to 3 → queue button.
- Manual queue: input character name + realm.
- "My Queued Characters" list with live status for each.

**5.6 Admin Panel (`/admin`)**

- **Queue Overview**: characters in lightweight queue, characters in deep-scan queue, currently processing character + current step.
- **Rate Limits**: WCL points remaining / total, reset timer, Blizzard requests this hour, Raider.IO requests this hour. Visual gauges.
- **Reprocessing**: Button to drop all processed data and re-run processing logic. Per-character reprocess option.
- **Season Config**: View/edit tracked expansions, seasons, raids, bosses, dungeons, defensive IDs per spec, consumable IDs per season.

**5.7 Polling Strategy**

- Character page: poll `GET /api/characters/{realm}/{name}` every 3 seconds while `processing_status !== 'complete'`. Reduce to every 30 seconds once complete (to catch deep-scan updates).
- Frontpage "Currently Processing": poll every 5 seconds.
- Dashboard "My Queued Characters": poll every 3 seconds.
- Use `useEffect` + `setInterval` in client components with Eden Treaty. Clean up on unmount.

**5.8 Visual Design Notes**

- Dark theme primary (WoW aesthetic), light theme supported.
- Class colors used throughout (Warrior brown, Paladin pink, Hunter green, etc. — standard WoW class colors).
- Parse colors: 100 = gold/orange, 99 = pink, 95 = orange, 75 = purple, 50 = blue, 25 = green, 0 = gray (standard WCL color scale).
- Expansion logos, raid logos, boss icons, dungeon icons sourced from Blizzard game data API or bundled assets.
- Ability icons (defensives, healthstone, health potion) from Blizzard spell media API, cached locally.
- shadcn/ui components as the base, customized for WoW theming.

---

### 6. Parse Tier System

Standardized parse interpretation displayed as badges/labels:

| Parse Range | Tier          | Label                                | Color  |
| ----------- | ------------- | ------------------------------------ | ------ |
| 100         | Legendary     | "Rank 1 — Cheese/Exploit likely"     | Gold   |
| 99          | Exceptional   | "Achievable Rank 1"                  | Pink   |
| 95-98       | Mythic-tier   | "Near Perfect Play"                  | Orange |
| 90-94       | Excellent     | "Excellent"                          | Orange |
| 75-89       | Great         | "Very Good — Room for Improvement"   | Purple |
| 50-74       | Average       | "Average — Rotational/CD Mistakes"   | Blue   |
| 25-49       | Below Average | "Below Average — Significant Issues" | Green  |
| 1-24        | Poor          | "Poor — Major Problems"              | Gray   |
| 0           | Dead Weight   | "Dead All Fight / AFK"               | Gray   |

---

### 7. AI Feature

**7.1 Prompt Construction**

- Programmatically build the prompt from hard-coded explanation strings + character data.
- Explain to the model what parses mean (use the tier system above).
- Explain what death patterns mean (first death = likely standing in bad, frequent early deaths = positioning/awareness issue).
- Explain what defensive/consumable usage means (low usage = likely not keybinding them or forgetting under pressure).
- Include concrete numbers: "This character has killed Boss X 6 times with an average parse of 22."
- Include M+ context: score, run frequency, depletion rate.

**7.2 LLM Call**

- Provider: OpenAI (`gpt-4o-mini` for cost efficiency, `gpt-4o` as upgrade option).
- Single API call per character per summary generation.
- Store the full response in `character_ai_summary`.
- On reprocessing, regenerate.

**7.3 Output Structure**

- Overall verdict (1-2 sentences).
- Performance summary (paragraph).
- Strengths (bullet points).
- Areas for improvement (bullet points).
- Specific pitfalls observed (bullet points with data citations).

---

### 8. Configuration Data — Spec Defensives, Consumables, Season Data

**8.1 Approach**

- Store in PostgreSQL config tables, seeded via Drizzle seed scripts or admin panel.
- Each expansion/season/raid/boss/dungeon is a row with relevant IDs (WCL encounter IDs, Blizzard API IDs, Raider.IO slugs).
- Spec defensive ability IDs: per spec, per season (abilities can change between patches). Source: community resources (e.g., Raid Leader Discord, Wowhead, or manual entry).
- Consumable IDs: healthstone spell ID, health potion spell IDs per season (potions change each expansion).

**8.2 Adding New Seasons/Expansions**

- Add rows to config tables (via admin panel or seed script).
- Processing logic automatically picks up new seasons.
- No code changes required for new bosses/dungeons — only data.

---

### 9. Infrastructure & Resource Budget

**9.1 Docker Compose Services** (updated)

| Service                       | Memory Limit | Purpose                       |
| ----------------------------- | ------------ | ----------------------------- |
| `db` (PostgreSQL 17)          | 200MB        | Primary datastore             |
| backend (Bun + Elysia)        | 242MB        | API server + BunQueue workers |
| frontend (Next.js standalone) | 384MB        | SSR + static serving          |
| nginx (prod only)             | 64MB         | Reverse proxy + SSL           |
| **Total**                     | **~890MB**   | Fits 1GB VPS with OS overhead |

> **Note:** No Redis service required. BunQueue runs embedded in the backend process with SQLite-based persistence, freeing ~50MB of RAM compared to a Redis-backed queue.

**9.2 Performance Considerations**

- Backend runs API server and BunQueue worker in the same process (BunQueue's embedded mode — no external service needed) to save memory.
- Single concurrency for processing — one character at a time, one API call at a time.
- PostgreSQL tuned for low memory (64MB shared buffers, 20 max connections).
- Frontend uses Next.js standalone output for minimal footprint.
- Short-polling (not WebSockets) to avoid persistent connection overhead.

---

### 10. API Endpoints (Backend — Elysia)

| Method | Path                             | Description                                                 | Auth                        |
| ------ | -------------------------------- | ----------------------------------------------------------- | --------------------------- |
| `GET`  | `/api/characters`                | List/search characters (paginated, filterable)              | Public                      |
| `GET`  | `/api/characters/featured`       | Random selection of processed characters for frontpage      | Public                      |
| `GET`  | `/api/characters/processing`     | Currently processing characters                             | Public                      |
| `GET`  | `/api/characters/{realm}/{name}` | Full character profile (processed data + processing status) | Public                      |
| `POST` | `/api/characters/queue`          | Queue a character for processing (name + realm)             | Authenticated               |
| `POST` | `/api/characters/queue/batch`    | Queue multiple characters (from Bnet import, max 3)         | Authenticated               |
| `GET`  | `/api/auth/discord`              | Discord OAuth2 redirect                                     | Public                      |
| `GET`  | `/api/auth/discord/callback`     | Discord OAuth2 callback                                     | Public                      |
| `GET`  | `/api/auth/battlenet`            | Battle.net OAuth2 redirect                                  | Public                      |
| `GET`  | `/api/auth/battlenet/callback`   | Battle.net OAuth2 callback                                  | Public                      |
| `POST` | `/api/auth/logout`               | Logout (clear session)                                      | Authenticated               |
| `GET`  | `/api/auth/me`                   | Current user info                                           | Authenticated               |
| `GET`  | `/api/user/characters`           | Fetch characters from linked Bnet account                   | Authenticated + Bnet linked |
| `GET`  | `/api/user/queued`               | User's queued characters with status                        | Authenticated               |
| `GET`  | `/api/admin/queue`               | Queue overview (both queues)                                | Admin                       |
| `GET`  | `/api/admin/rate-limits`         | Current rate limit status for all external APIs             | Admin                       |
| `POST` | `/api/admin/reprocess`           | Trigger reprocessing (all or specific character)            | Admin                       |
| `GET`  | `/api/admin/config/seasons`      | List configured seasons                                     | Admin                       |
| `POST` | `/api/admin/config/seasons`      | Add/update season config                                    | Admin                       |

---

### 11. Environment Variables

```
# Database
POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, DATABASE_URL

# Auth
DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI
BATTLENET_CLIENT_ID, BATTLENET_CLIENT_SECRET, BATTLENET_REDIRECT_URI

# External APIs
WCL_CLIENT_ID, WCL_CLIENT_SECRET
BLIZZARD_CLIENT_ID, BLIZZARD_CLIENT_SECRET

# AI
OPENAI_API_KEY, OPENAI_MODEL=gpt-4o-mini

# Admin
ADMIN_DISCORD_IDS=discord_id_1,discord_id_2

# App
CORS_ORIGIN, NEXT_PUBLIC_API_URL, INTERNAL_API_URL, DOMAIN
```

---

### 12. Supported Expansions (Initial Scope)

| Expansion      | Slug  | Seasons         | Min Expansion Boundary |
| -------------- | ----- | --------------- | ---------------------- |
| Dragonflight   | `df`  | S1, S2, S3, S4  | Current minimum        |
| The War Within | `tww` | S1, S2, S3      | —                      |
| Midnight       | `mid` | Added when live | —                      |

The `MIN_EXPANSION_SLUG` env var (or config row) defines the oldest expansion to track. Anything older is ignored. New expansions/seasons added via config tables — no code changes.

---

### 13. Edge Cases & Error Handling

- **Character has very little data**: Show what's available. AI summary acknowledges limited data. Processing still completes (some steps just yield empty results).
- **Character doesn't exist on WCL**: Show Blizzard profile + Raider.IO data only. WCL sections show "No logs found."
- **Character name/realm mismatch**: Validate against Blizzard API during queueing. Reject invalid characters before entering queue.
- **Duplicate queue requests**: If character is already queued or recently processed, skip. Allow re-queue after a cooldown (e.g., 24 hours) or if admin triggers.
- **WCL rate limit exhaustion**: Pause processing, show "Rate limited, resuming at {time}" in admin panel and on processing characters' status.
- **External API downtime**: Retry with exponential backoff (3 attempts). Mark step as failed. Allow admin to retry failed steps.
- **Server restart mid-processing**: BunQueue (SQLite-backed) resumes jobs. Processing state in PostgreSQL shows last completed step; processing resumes from there.

---

### Verification

- **Unit tests**: `bun:test` for processing logic (parse tier calculation, prompt construction, queue state machine).
- **Integration tests**: Test external API client modules with mocked responses.
- **Manual E2E**: Queue a known character (e.g., your own), verify data appears correctly on the character page.
- **Rate limit verification**: Monitor admin panel during processing, verify pausing/resuming behavior.
- **Reprocessing test**: Process a character → trigger reprocess from admin → verify profile regenerated without refetching raw data.
- **Restart resilience**: Kill backend mid-processing → restart → verify it resumes.

---

### Decisions

- **BunQueue (embedded)** over Redis + BullMQ: BullMQ-compatible API with zero external dependencies. Uses SQLite for persistence instead of Redis, eliminating a separate service and saving ~50MB RAM. Purpose-built for Bun.
- **Short-polling** over WebSockets: Simpler, no persistent connection overhead, sufficient for 3-5 second update intervals on a resource-constrained server.
- **OpenAI (gpt-4o-mini)** as the AI provider: Cost-efficient, fast, sufficient for structured analysis summaries.
- **Two-tier processing** (lightweight + deep scan): Enables fast initial character pages while enriching data in the background.
- **Admin via env-var Discord IDs**: Simple, sufficient for a small team, avoids building a full role system.
- **All historical seasons from DF onward**: Comprehensive data from day one, configurable minimum expansion boundary.
- **No M+ WCL log analysis**: M+ data sourced exclusively from Raider.IO for now, keeping WCL API usage focused on raid data.
