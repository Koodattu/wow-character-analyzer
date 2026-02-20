ALTER TABLE "raids" ADD COLUMN "raiderio_slug" text;--> statement-breakpoint
ALTER TABLE "raids" ADD COLUMN "region_start_dates" jsonb;--> statement-breakpoint
ALTER TABLE "raids" ADD COLUMN "region_end_dates" jsonb;--> statement-breakpoint
-- Deduplicate bosses before adding unique constraints (keep oldest row per raid_id+wcl_encounter_id)
DELETE FROM "bosses" WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "raid_id", "wcl_encounter_id" ORDER BY "created_at" ASC) AS rn
    FROM "bosses" WHERE "wcl_encounter_id" IS NOT NULL
  ) sub WHERE rn > 1
);--> statement-breakpoint
-- Deduplicate bosses by raid_id+slug (keep oldest row)
DELETE FROM "bosses" WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "raid_id", "slug" ORDER BY "created_at" ASC) AS rn
    FROM "bosses"
  ) sub WHERE rn > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX "boss_raid_encounter_idx" ON "bosses" USING btree ("raid_id","wcl_encounter_id");--> statement-breakpoint
CREATE UNIQUE INDEX "boss_raid_slug_idx" ON "bosses" USING btree ("raid_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "raid_wcl_zone_id_idx" ON "raids" USING btree ("wcl_zone_id");