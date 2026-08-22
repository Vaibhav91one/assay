CREATE TABLE "contracts" (
	"contract_id" serial PRIMARY KEY NOT NULL,
	"target_id" text NOT NULL,
	"version" integer NOT NULL,
	"yaml" text NOT NULL,
	"parsed" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "digests" (
	"digest_id" serial PRIMARY KEY NOT NULL,
	"cadence" text NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_sent_at" timestamp with time zone,
	"recipients" jsonb
);
--> statement-breakpoint
CREATE TABLE "field_state" (
	"target_id" text NOT NULL,
	"field" text NOT NULL,
	"fragility_grade" text,
	"drift_state" text,
	"brake_active" boolean DEFAULT false NOT NULL,
	"brake_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "field_state_target_id_field_pk" PRIMARY KEY("target_id","field")
);
--> statement-breakpoint
CREATE TABLE "heal_history" (
	"heal_id" serial PRIMARY KEY NOT NULL,
	"target_id" text NOT NULL,
	"field" text NOT NULL,
	"from_selector" text,
	"to_selector" text NOT NULL,
	"run_id" integer NOT NULL,
	"reverted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retractions" (
	"retraction_id" serial PRIMARY KEY NOT NULL,
	"target_id" text NOT NULL,
	"field" text NOT NULL,
	"from_run" integer NOT NULL,
	"to_run" integer NOT NULL,
	"row_ids" jsonb,
	"exported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "queue_items" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "queue_items" ADD COLUMN "undone_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_target_id_targets_target_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."targets"("target_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_state" ADD CONSTRAINT "field_state_target_id_targets_target_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."targets"("target_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heal_history" ADD CONSTRAINT "heal_history_target_id_targets_target_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."targets"("target_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heal_history" ADD CONSTRAINT "heal_history_run_id_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("run_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retractions" ADD CONSTRAINT "retractions_target_id_targets_target_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."targets"("target_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contracts_target_version_idx" ON "contracts" USING btree ("target_id","version");--> statement-breakpoint
CREATE INDEX "digests_next_run_at_idx" ON "digests" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "field_state_brake_idx" ON "field_state" USING btree ("brake_active");--> statement-breakpoint
CREATE INDEX "heal_history_target_field_idx" ON "heal_history" USING btree ("target_id","field","created_at");--> statement-breakpoint
CREATE INDEX "retractions_target_field_idx" ON "retractions" USING btree ("target_id","field");--> statement-breakpoint
CREATE INDEX "queue_items_group_idx" ON "queue_items" USING btree ("group_key");