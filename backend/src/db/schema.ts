import { pgTable, text, timestamp, integer, boolean, jsonb, real, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

// ─── Helper ──────────────────────────────────────────────────────────────
const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => createId());

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ─── Auth Layer ──────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: id(),
  username: text("username"),
  avatarUrl: text("avatar_url"),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // Lucia generates session IDs
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
});

export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // 'discord' | 'battlenet'
    providerAccountId: text("provider_account_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("oauth_provider_account_idx").on(table.provider, table.providerAccountId)],
);

// ─── API Cache Layer ─────────────────────────────────────────────────────
// Stores raw API responses so data survives restarts without refetching.
// The sync service checks here before making API calls.

export const apiCache = pgTable("api_cache", {
  key: text("key").primaryKey(), // e.g. "wcl:zone:39", "rio:raids:10"
  data: jsonb("data").notNull(), // raw API response JSON
  cachedAt: timestamp("cached_at", { withTimezone: true }).notNull().defaultNow(),
  ttlSeconds: integer("ttl_seconds").notNull().default(86400), // 24h default
});

// ─── Config Layer ────────────────────────────────────────────────────────
export const expansions = pgTable("expansions", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  wclExpansionId: integer("wcl_expansion_id"),
  rioExpansionId: integer("rio_expansion_id"),
  logoUrl: text("logo_url"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

export const seasons = pgTable("seasons", {
  id: id(),
  expansionId: text("expansion_id")
    .notNull()
    .references(() => expansions.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  number: integer("number").notNull(),
  createdAt: createdAt(),
});

/** Region date map shape for raid start/end dates from Raider.IO */
export type RegionDates = {
  us?: string;
  eu?: string;
  tw?: string;
  kr?: string;
  cn?: string;
};

export const raids = pgTable(
  "raids",
  {
    id: id(),
    seasonId: text("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    iconUrl: text("icon_url"),
    wclZoneId: integer("wcl_zone_id"),
    raiderioSlug: text("raiderio_slug"),
    regionStartDates: jsonb("region_start_dates").$type<RegionDates>(),
    regionEndDates: jsonb("region_end_dates").$type<RegionDates>(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("raid_wcl_zone_id_idx").on(table.wclZoneId)],
);

export const bosses = pgTable(
  "bosses",
  {
    id: id(),
    raidId: text("raid_id")
      .notNull()
      .references(() => raids.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    iconUrl: text("icon_url"),
    wclEncounterId: integer("wcl_encounter_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("boss_raid_encounter_idx").on(table.raidId, table.wclEncounterId), uniqueIndex("boss_raid_slug_idx").on(table.raidId, table.slug)],
);

export const dungeons = pgTable("dungeons", {
  id: id(),
  seasonId: text("season_id")
    .notNull()
    .references(() => seasons.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  iconUrl: text("icon_url"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

export const specDefensives = pgTable(
  "spec_defensives",
  {
    id: id(),
    seasonId: text("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    className: text("class_name").notNull(),
    specName: text("spec_name").notNull(),
    abilityId: integer("ability_id").notNull(),
    abilityName: text("ability_name").notNull(),
    iconUrl: text("icon_url"),
  },
  (table) => [index("spec_defensive_season_idx").on(table.seasonId, table.className, table.specName)],
);

export const seasonConsumables = pgTable("season_consumables", {
  id: id(),
  seasonId: text("season_id")
    .notNull()
    .references(() => seasons.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // 'healthstone' | 'health_potion' | 'other'
  abilityId: integer("ability_id").notNull(),
  abilityName: text("ability_name").notNull(),
  iconUrl: text("icon_url"),
});

// ─── Raw Data Layer (immutable) ─────────────────────────────────────────
export const characters = pgTable(
  "characters",
  {
    id: id(),
    name: text("name").notNull(),
    realm: text("realm").notNull(),
    realmSlug: text("realm_slug").notNull(),
    region: text("region").notNull().default("eu"),
    className: text("class_name"),
    specName: text("spec_name"),
    race: text("race"),
    faction: text("faction"), // 'alliance' | 'horde'
    guild: text("guild"),
    profilePicUrl: text("profile_pic_url"),
    blizzardId: integer("blizzard_id"),
    lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("character_realm_region_idx").on(table.realmSlug, table.name, table.region),
    index("character_name_idx").on(table.name),
    index("character_guild_idx").on(table.guild),
  ],
);

// ─── Queue Layer ─────────────────────────────────────────────────────────
export const characterQueue = pgTable(
  "character_queue",
  {
    id: id(),
    characterId: text("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    queuedById: text("queued_by_id").references(() => users.id, { onDelete: "set null" }),
    priority: integer("priority").notNull().default(0),
    status: text("status").notNull().default("pending"), // 'pending' | 'processing' | 'completed' | 'failed'
    errorMessage: text("error_message"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("queue_status_idx").on(table.status), index("queue_character_idx").on(table.characterId)],
);

export const processingState = pgTable("processing_state", {
  id: id(),
  characterId: text("character_id")
    .notNull()
    .references(() => characters.id, { onDelete: "cascade" })
    .unique(),
  lightweightStatus: text("lightweight_status").notNull().default("pending"), // 'pending' | 'in_progress' | 'completed' | 'failed'
  deepScanStatus: text("deep_scan_status").notNull().default("pending"),
  currentStep: text("current_step"), // human-readable step name
  stepsCompleted: jsonb("steps_completed").$type<string[]>().default([]),
  totalSteps: integer("total_steps").notNull().default(6),
  errorMessage: text("error_message"),
  lightweightCompletedAt: timestamp("lightweight_completed_at", { withTimezone: true }),
  deepScanCompletedAt: timestamp("deep_scan_completed_at", { withTimezone: true }),
  updatedAt: updatedAt(),
});

// ─── WCL Raw Data ───────────────────────────────────────────────────────
export const wclReports = pgTable(
  "wcl_reports",
  {
    id: id(),
    reportCode: text("report_code").notNull().unique(),
    title: text("title"),
    guildName: text("guild_name"),
    guildServerId: integer("guild_server_id"),
    startTime: timestamp("start_time", { withTimezone: true }),
    endTime: timestamp("end_time", { withTimezone: true }),
    zoneId: integer("zone_id"),
    rawData: jsonb("raw_data"),
    createdAt: createdAt(),
  },
  (table) => [index("wcl_report_code_idx").on(table.reportCode)],
);

export const wclFights = pgTable(
  "wcl_fights",
  {
    id: id(),
    reportId: text("report_id")
      .notNull()
      .references(() => wclReports.id, { onDelete: "cascade" }),
    fightId: integer("fight_id").notNull(),
    encounterId: integer("encounter_id"),
    encounterName: text("encounter_name"),
    difficulty: integer("difficulty"),
    kill: boolean("kill").notNull().default(false),
    duration: integer("duration"), // ms
    startTime: integer("start_time"),
    endTime: integer("end_time"),
    rawData: jsonb("raw_data"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("wcl_fight_report_fight_idx").on(table.reportId, table.fightId), index("wcl_fight_encounter_idx").on(table.encounterId)],
);

export const wclParses = pgTable(
  "wcl_parses",
  {
    id: id(),
    characterId: text("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    fightId: text("fight_id").references(() => wclFights.id, { onDelete: "cascade" }),
    encounterId: integer("encounter_id").notNull(),
    difficulty: integer("difficulty"),
    reportCode: text("report_code"),
    wclFightId: integer("wcl_fight_id"), // the fight ID within the report
    percentile: real("percentile"),
    dps: real("dps"),
    hps: real("hps"),
    spec: text("spec"),
    ilvl: real("ilvl"),
    duration: integer("duration"),
    killOrWipe: boolean("kill_or_wipe").default(true),
    startTime: timestamp("start_time", { withTimezone: true }),
    rawData: jsonb("raw_data"),
    createdAt: createdAt(),
  },
  (table) => [index("wcl_parse_character_idx").on(table.characterId), index("wcl_parse_encounter_idx").on(table.characterId, table.encounterId)],
);

export const wclDeaths = pgTable(
  "wcl_deaths",
  {
    id: id(),
    characterId: text("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    fightId: text("fight_id").references(() => wclFights.id, { onDelete: "cascade" }),
    timestamp: integer("timestamp"), // ms into the fight
    abilityId: integer("ability_id"),
    abilityName: text("ability_name"),
    killerName: text("killer_name"),
    deathOrder: integer("death_order"), // 1st death, 2nd death, etc.
    rawData: jsonb("raw_data"),
    createdAt: createdAt(),
  },
  (table) => [index("wcl_death_character_idx").on(table.characterId), index("wcl_death_fight_idx").on(table.fightId)],
);

export const wclCasts = pgTable(
  "wcl_casts",
  {
    id: id(),
    characterId: text("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    fightId: text("fight_id").references(() => wclFights.id, { onDelete: "cascade" }),
    abilityId: integer("ability_id").notNull(),
    abilityName: text("ability_name"),
    timestamp: integer("timestamp"), // ms into the fight
    type: text("type").notNull(), // 'defensive' | 'healthstone' | 'health_potion'
    rawData: jsonb("raw_data"),
    createdAt: createdAt(),
  },
  (table) => [index("wcl_cast_character_idx").on(table.characterId), index("wcl_cast_fight_idx").on(table.fightId)],
);

// ─── Blizzard Raw Data ──────────────────────────────────────────────────
export const blizzardAchievements = pgTable(
  "blizzard_achievements",
  {
    id: id(),
    characterId: text("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    achievementId: integer("achievement_id").notNull(),
    achievementName: text("achievement_name"),
    completedTimestamp: timestamp("completed_timestamp", { withTimezone: true }),
    raidName: text("raid_name"),
    type: text("type"), // 'cutting_edge' | 'ahead_of_the_curve'
    createdAt: createdAt(),
  },
  (table) => [index("blizzard_achievement_character_idx").on(table.characterId), uniqueIndex("blizzard_achievement_unique_idx").on(table.characterId, table.achievementId)],
);

// ─── Raider.IO Raw Data ─────────────────────────────────────────────────
export const raiderioRuns = pgTable(
  "raiderio_runs",
  {
    id: id(),
    characterId: text("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    seasonSlug: text("season_slug").notNull(),
    dungeonName: text("dungeon_name").notNull(),
    dungeonSlug: text("dungeon_slug"),
    keyLevel: integer("key_level").notNull(),
    score: real("score"),
    timed: boolean("timed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    numKeystoneUpgrades: integer("num_keystone_upgrades").default(0),
    duration: integer("duration"), // ms
    rawData: jsonb("raw_data"),
    createdAt: createdAt(),
  },
  (table) => [index("raiderio_run_character_idx").on(table.characterId), index("raiderio_run_season_idx").on(table.characterId, table.seasonSlug)],
);

export const raiderioScores = pgTable(
  "raiderio_scores",
  {
    id: id(),
    characterId: text("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    seasonSlug: text("season_slug").notNull(),
    overallScore: real("overall_score").notNull().default(0),
    tankScore: real("tank_score").default(0),
    healerScore: real("healer_score").default(0),
    dpsScore: real("dps_score").default(0),
    rawData: jsonb("raw_data"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("raiderio_score_unique_idx").on(table.characterId, table.seasonSlug)],
);

// ─── Processed Layer (rebuildable) ──────────────────────────────────────
export const characterProfiles = pgTable("character_profiles", {
  id: id(),
  characterId: text("character_id")
    .notNull()
    .references(() => characters.id, { onDelete: "cascade" })
    .unique(),
  // Raid stats
  totalKills: integer("total_kills").default(0),
  totalWipes: integer("total_wipes").default(0),
  avgParse: real("avg_parse"),
  medianParse: real("median_parse"),
  bestParse: real("best_parse"),
  // Death stats
  totalDeaths: integer("total_deaths").default(0),
  avgDeathsPerKill: real("avg_deaths_per_kill"),
  firstDeathRate: real("first_death_rate"), // % of kills where died first
  avgTimeOfDeath: real("avg_time_of_death"), // avg ms into fight when they die
  // Defensive/consumable stats
  defensiveUsageRate: real("defensive_usage_rate"),
  healthstoneUsageRate: real("healthstone_usage_rate"),
  healthPotionUsageRate: real("health_potion_usage_rate"),
  // M+ stats
  currentMplusScore: real("current_mplus_score"),
  totalRuns: integer("total_runs").default(0),
  timedRate: real("timed_rate"),
  // Meta
  parseTier: text("parse_tier"), // from parse tier system
  processingTier: text("processing_tier"), // 'lightweight' | 'deep'
  updatedAt: updatedAt(),
});

export const characterBossStats = pgTable(
  "character_boss_stats",
  {
    id: id(),
    characterId: text("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    bossId: text("boss_id").references(() => bosses.id, { onDelete: "cascade" }),
    encounterId: integer("encounter_id").notNull(),
    bossName: text("boss_name").notNull(),
    raidName: text("raid_name"),
    // Parse stats
    kills: integer("kills").default(0),
    bestParse: real("best_parse"),
    medianParse: real("median_parse"),
    worstParse: real("worst_parse"),
    avgParse: real("avg_parse"),
    // Death stats
    totalDeaths: integer("total_deaths").default(0),
    avgDeathsPerKill: real("avg_deaths_per_kill"),
    firstDeathRate: real("first_death_rate"),
    avgTimeOfDeath: real("avg_time_of_death"),
    // Defensive/consumable stats
    defensiveUsageRate: real("defensive_usage_rate"),
    healthstoneUsageRate: real("healthstone_usage_rate"),
    healthPotionUsageRate: real("health_potion_usage_rate"),
    // Meta
    parseTier: text("parse_tier"),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("boss_stats_unique_idx").on(table.characterId, table.encounterId), index("boss_stats_character_idx").on(table.characterId)],
);

export const characterAiSummary = pgTable("character_ai_summary", {
  id: id(),
  characterId: text("character_id")
    .notNull()
    .references(() => characters.id, { onDelete: "cascade" })
    .unique(),
  verdict: text("verdict"),
  summary: text("summary"),
  strengths: jsonb("strengths").$type<string[]>(),
  improvements: jsonb("improvements").$type<string[]>(),
  pitfalls: jsonb("pitfalls").$type<string[]>(),
  modelUsed: text("model_used"),
  rawResponse: text("raw_response"),
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow(),
  updatedAt: updatedAt(),
});

// ─── Relations ──────────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  oauthAccounts: many(oauthAccounts),
  queuedCharacters: many(characterQueue),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const oauthAccountsRelations = relations(oauthAccounts, ({ one }) => ({
  user: one(users, { fields: [oauthAccounts.userId], references: [users.id] }),
}));

export const expansionsRelations = relations(expansions, ({ many }) => ({
  seasons: many(seasons),
}));

export const seasonsRelations = relations(seasons, ({ one, many }) => ({
  expansion: one(expansions, { fields: [seasons.expansionId], references: [expansions.id] }),
  raids: many(raids),
  dungeons: many(dungeons),
}));

export const raidsRelations = relations(raids, ({ one, many }) => ({
  season: one(seasons, { fields: [raids.seasonId], references: [seasons.id] }),
  bosses: many(bosses),
}));

export const bossesRelations = relations(bosses, ({ one }) => ({
  raid: one(raids, { fields: [bosses.raidId], references: [raids.id] }),
}));

export const dungeonsRelations = relations(dungeons, ({ one }) => ({
  season: one(seasons, { fields: [dungeons.seasonId], references: [seasons.id] }),
}));

export const charactersRelations = relations(characters, ({ one, many }) => ({
  queue: many(characterQueue),
  processingState: one(processingState, {
    fields: [characters.id],
    references: [processingState.characterId],
  }),
  parses: many(wclParses),
  deaths: many(wclDeaths),
  casts: many(wclCasts),
  achievements: many(blizzardAchievements),
  raiderioRuns: many(raiderioRuns),
  raiderioScores: many(raiderioScores),
  profile: one(characterProfiles, {
    fields: [characters.id],
    references: [characterProfiles.characterId],
  }),
  bossStats: many(characterBossStats),
  aiSummary: one(characterAiSummary, {
    fields: [characters.id],
    references: [characterAiSummary.characterId],
  }),
}));

export const characterQueueRelations = relations(characterQueue, ({ one }) => ({
  character: one(characters, {
    fields: [characterQueue.characterId],
    references: [characters.id],
  }),
  queuedBy: one(users, {
    fields: [characterQueue.queuedById],
    references: [users.id],
  }),
}));

export const wclReportsRelations = relations(wclReports, ({ many }) => ({
  fights: many(wclFights),
}));

export const wclFightsRelations = relations(wclFights, ({ one, many }) => ({
  report: one(wclReports, { fields: [wclFights.reportId], references: [wclReports.id] }),
  parses: many(wclParses),
  deaths: many(wclDeaths),
  casts: many(wclCasts),
}));

export const wclParsesRelations = relations(wclParses, ({ one }) => ({
  character: one(characters, { fields: [wclParses.characterId], references: [characters.id] }),
  fight: one(wclFights, { fields: [wclParses.fightId], references: [wclFights.id] }),
}));

export const wclDeathsRelations = relations(wclDeaths, ({ one }) => ({
  character: one(characters, { fields: [wclDeaths.characterId], references: [characters.id] }),
  fight: one(wclFights, { fields: [wclDeaths.fightId], references: [wclFights.id] }),
}));

export const wclCastsRelations = relations(wclCasts, ({ one }) => ({
  character: one(characters, { fields: [wclCasts.characterId], references: [characters.id] }),
  fight: one(wclFights, { fields: [wclCasts.fightId], references: [wclFights.id] }),
}));

export const blizzardAchievementsRelations = relations(blizzardAchievements, ({ one }) => ({
  character: one(characters, {
    fields: [blizzardAchievements.characterId],
    references: [characters.id],
  }),
}));

export const raiderioRunsRelations = relations(raiderioRuns, ({ one }) => ({
  character: one(characters, { fields: [raiderioRuns.characterId], references: [characters.id] }),
}));

export const raiderioScoresRelations = relations(raiderioScores, ({ one }) => ({
  character: one(characters, {
    fields: [raiderioScores.characterId],
    references: [characters.id],
  }),
}));

export const characterProfilesRelations = relations(characterProfiles, ({ one }) => ({
  character: one(characters, {
    fields: [characterProfiles.characterId],
    references: [characters.id],
  }),
}));

export const characterBossStatsRelations = relations(characterBossStats, ({ one }) => ({
  character: one(characters, {
    fields: [characterBossStats.characterId],
    references: [characters.id],
  }),
  boss: one(bosses, { fields: [characterBossStats.bossId], references: [bosses.id] }),
}));

export const characterAiSummaryRelations = relations(characterAiSummary, ({ one }) => ({
  character: one(characters, {
    fields: [characterAiSummary.characterId],
    references: [characters.id],
  }),
}));
