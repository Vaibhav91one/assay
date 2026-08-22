CREATE TABLE "conversations" (
	"conversation_id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"turns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scraper_slug" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "conversations_updated_at_idx" ON "conversations" USING btree ("updated_at");