CREATE TABLE "api_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"cached_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ttl_seconds" integer DEFAULT 86400 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expansions" ADD COLUMN "wcl_expansion_id" integer;--> statement-breakpoint
ALTER TABLE "expansions" ADD COLUMN "rio_expansion_id" integer;