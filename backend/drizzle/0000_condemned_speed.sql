CREATE TABLE "blizzard_achievements" (
	"id" text PRIMARY KEY NOT NULL,
	"character_id" text NOT NULL,
	"achievement_id" integer NOT NULL,
	"achievement_name" text,
	"completed_timestamp" timestamp with time zone,
	"raid_name" text,
	"type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bosses" (
	"id" text PRIMARY KEY NOT NULL,
	"raid_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"icon_url" text,
	"wcl_encounter_id" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "character_ai_summary" (
	"id" text PRIMARY KEY NOT NULL,
	"character_id" text NOT NULL,
	"verdict" text,
	"summary" text,
	"strengths" jsonb,
	"improvements" jsonb,
	"pitfalls" jsonb,
	"model_used" text,
	"raw_response" text,
	"generated_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_ai_summary_character_id_unique" UNIQUE("character_id")
);
--> statement-breakpoint
CREATE TABLE "character_boss_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"character_id" text NOT NULL,
	"boss_id" text,
	"encounter_id" integer NOT NULL,
	"boss_name" text NOT NULL,
	"raid_name" text,
	"kills" integer DEFAULT 0,
	"best_parse" real,
	"median_parse" real,
	"worst_parse" real,
	"avg_parse" real,
	"total_deaths" integer DEFAULT 0,
	"avg_deaths_per_kill" real,
	"first_death_rate" real,
	"avg_time_of_death" real,
	"defensive_usage_rate" real,
	"healthstone_usage_rate" real,
	"health_potion_usage_rate" real,
	"parse_tier" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "character_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"character_id" text NOT NULL,
	"total_kills" integer DEFAULT 0,
	"total_wipes" integer DEFAULT 0,
	"avg_parse" real,
	"median_parse" real,
	"best_parse" real,
	"total_deaths" integer DEFAULT 0,
	"avg_deaths_per_kill" real,
	"first_death_rate" real,
	"avg_time_of_death" real,
	"defensive_usage_rate" real,
	"healthstone_usage_rate" real,
	"health_potion_usage_rate" real,
	"current_mplus_score" real,
	"total_runs" integer DEFAULT 0,
	"timed_rate" real,
	"parse_tier" text,
	"processing_tier" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_profiles_character_id_unique" UNIQUE("character_id")
);
--> statement-breakpoint
CREATE TABLE "character_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"character_id" text NOT NULL,
	"queued_by_id" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"realm" text NOT NULL,
	"realm_slug" text NOT NULL,
	"region" text DEFAULT 'eu' NOT NULL,
	"class_name" text,
	"spec_name" text,
	"race" text,
	"faction" text,
	"guild" text,
	"profile_pic_url" text,
	"blizzard_id" integer,
	"last_fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dungeons" (
	"id" text PRIMARY KEY NOT NULL,
	"season_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"icon_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expansions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expansions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "oauth_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processing_state" (
	"id" text PRIMARY KEY NOT NULL,
	"character_id" text NOT NULL,
	"lightweight_status" text DEFAULT 'pending' NOT NULL,
	"deep_scan_status" text DEFAULT 'pending' NOT NULL,
	"current_step" text,
	"steps_completed" jsonb DEFAULT '[]'::jsonb,
	"total_steps" integer DEFAULT 6 NOT NULL,
	"error_message" text,
	"lightweight_completed_at" timestamp with time zone,
	"deep_scan_completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processing_state_character_id_unique" UNIQUE("character_id")
);
--> statement-breakpoint
CREATE TABLE "raiderio_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"character_id" text NOT NULL,
	"season_slug" text NOT NULL,
	"dungeon_name" text NOT NULL,
	"dungeon_slug" text,
	"key_level" integer NOT NULL,
	"score" real,
	"timed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"num_keystone_upgrades" integer DEFAULT 0,
	"duration" integer,
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raiderio_scores" (
	"id" text PRIMARY KEY NOT NULL,
	"character_id" text NOT NULL,
	"season_slug" text NOT NULL,
	"overall_score" real DEFAULT 0 NOT NULL,
	"tank_score" real DEFAULT 0,
	"healer_score" real DEFAULT 0,
	"dps_score" real DEFAULT 0,
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raids" (
	"id" text PRIMARY KEY NOT NULL,
	"season_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"icon_url" text,
	"wcl_zone_id" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "raids_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "season_consumables" (
	"id" text PRIMARY KEY NOT NULL,
	"season_id" text NOT NULL,
	"type" text NOT NULL,
	"ability_id" integer NOT NULL,
	"ability_name" text NOT NULL,
	"icon_url" text
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" text PRIMARY KEY NOT NULL,
	"expansion_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seasons_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spec_defensives" (
	"id" text PRIMARY KEY NOT NULL,
	"season_id" text NOT NULL,
	"class_name" text NOT NULL,
	"spec_name" text NOT NULL,
	"ability_id" integer NOT NULL,
	"ability_name" text NOT NULL,
	"icon_url" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text,
	"avatar_url" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wcl_casts" (
	"id" text PRIMARY KEY NOT NULL,
	"character_id" text NOT NULL,
	"fight_id" text,
	"ability_id" integer NOT NULL,
	"ability_name" text,
	"timestamp" integer,
	"type" text NOT NULL,
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wcl_deaths" (
	"id" text PRIMARY KEY NOT NULL,
	"character_id" text NOT NULL,
	"fight_id" text,
	"timestamp" integer,
	"ability_id" integer,
	"ability_name" text,
	"killer_name" text,
	"death_order" integer,
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wcl_fights" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"fight_id" integer NOT NULL,
	"encounter_id" integer,
	"encounter_name" text,
	"difficulty" integer,
	"kill" boolean DEFAULT false NOT NULL,
	"duration" integer,
	"start_time" integer,
	"end_time" integer,
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wcl_parses" (
	"id" text PRIMARY KEY NOT NULL,
	"character_id" text NOT NULL,
	"fight_id" text,
	"encounter_id" integer NOT NULL,
	"difficulty" integer,
	"report_code" text,
	"wcl_fight_id" integer,
	"percentile" real,
	"dps" real,
	"hps" real,
	"spec" text,
	"ilvl" real,
	"duration" integer,
	"kill_or_wipe" boolean DEFAULT true,
	"start_time" timestamp with time zone,
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wcl_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"report_code" text NOT NULL,
	"title" text,
	"guild_name" text,
	"guild_server_id" integer,
	"start_time" timestamp with time zone,
	"end_time" timestamp with time zone,
	"zone_id" integer,
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wcl_reports_report_code_unique" UNIQUE("report_code")
);
--> statement-breakpoint
ALTER TABLE "blizzard_achievements" ADD CONSTRAINT "blizzard_achievements_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bosses" ADD CONSTRAINT "bosses_raid_id_raids_id_fk" FOREIGN KEY ("raid_id") REFERENCES "public"."raids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_ai_summary" ADD CONSTRAINT "character_ai_summary_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_boss_stats" ADD CONSTRAINT "character_boss_stats_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_boss_stats" ADD CONSTRAINT "character_boss_stats_boss_id_bosses_id_fk" FOREIGN KEY ("boss_id") REFERENCES "public"."bosses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_profiles" ADD CONSTRAINT "character_profiles_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_queue" ADD CONSTRAINT "character_queue_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_queue" ADD CONSTRAINT "character_queue_queued_by_id_users_id_fk" FOREIGN KEY ("queued_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dungeons" ADD CONSTRAINT "dungeons_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_state" ADD CONSTRAINT "processing_state_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raiderio_runs" ADD CONSTRAINT "raiderio_runs_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raiderio_scores" ADD CONSTRAINT "raiderio_scores_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raids" ADD CONSTRAINT "raids_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_consumables" ADD CONSTRAINT "season_consumables_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_expansion_id_expansions_id_fk" FOREIGN KEY ("expansion_id") REFERENCES "public"."expansions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spec_defensives" ADD CONSTRAINT "spec_defensives_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wcl_casts" ADD CONSTRAINT "wcl_casts_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wcl_casts" ADD CONSTRAINT "wcl_casts_fight_id_wcl_fights_id_fk" FOREIGN KEY ("fight_id") REFERENCES "public"."wcl_fights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wcl_deaths" ADD CONSTRAINT "wcl_deaths_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wcl_deaths" ADD CONSTRAINT "wcl_deaths_fight_id_wcl_fights_id_fk" FOREIGN KEY ("fight_id") REFERENCES "public"."wcl_fights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wcl_fights" ADD CONSTRAINT "wcl_fights_report_id_wcl_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."wcl_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wcl_parses" ADD CONSTRAINT "wcl_parses_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wcl_parses" ADD CONSTRAINT "wcl_parses_fight_id_wcl_fights_id_fk" FOREIGN KEY ("fight_id") REFERENCES "public"."wcl_fights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blizzard_achievement_character_idx" ON "blizzard_achievements" USING btree ("character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "blizzard_achievement_unique_idx" ON "blizzard_achievements" USING btree ("character_id","achievement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "boss_stats_unique_idx" ON "character_boss_stats" USING btree ("character_id","encounter_id");--> statement-breakpoint
CREATE INDEX "boss_stats_character_idx" ON "character_boss_stats" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "queue_status_idx" ON "character_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "queue_character_idx" ON "character_queue" USING btree ("character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "character_realm_region_idx" ON "characters" USING btree ("realm_slug","name","region");--> statement-breakpoint
CREATE INDEX "character_name_idx" ON "characters" USING btree ("name");--> statement-breakpoint
CREATE INDEX "character_guild_idx" ON "characters" USING btree ("guild");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_provider_account_idx" ON "oauth_accounts" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "raiderio_run_character_idx" ON "raiderio_runs" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "raiderio_run_season_idx" ON "raiderio_runs" USING btree ("character_id","season_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "raiderio_score_unique_idx" ON "raiderio_scores" USING btree ("character_id","season_slug");--> statement-breakpoint
CREATE INDEX "spec_defensive_season_idx" ON "spec_defensives" USING btree ("season_id","class_name","spec_name");--> statement-breakpoint
CREATE INDEX "wcl_cast_character_idx" ON "wcl_casts" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "wcl_cast_fight_idx" ON "wcl_casts" USING btree ("fight_id");--> statement-breakpoint
CREATE INDEX "wcl_death_character_idx" ON "wcl_deaths" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "wcl_death_fight_idx" ON "wcl_deaths" USING btree ("fight_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wcl_fight_report_fight_idx" ON "wcl_fights" USING btree ("report_id","fight_id");--> statement-breakpoint
CREATE INDEX "wcl_fight_encounter_idx" ON "wcl_fights" USING btree ("encounter_id");--> statement-breakpoint
CREATE INDEX "wcl_parse_character_idx" ON "wcl_parses" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "wcl_parse_encounter_idx" ON "wcl_parses" USING btree ("character_id","encounter_id");--> statement-breakpoint
CREATE INDEX "wcl_report_code_idx" ON "wcl_reports" USING btree ("report_code");