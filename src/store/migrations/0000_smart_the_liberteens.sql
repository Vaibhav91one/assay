CREATE TABLE "captures" (
	"sha256" text PRIMARY KEY NOT NULL,
	"url" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"bytes" integer NOT NULL,
	"pruned" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episodes" (
	"episode_id" serial PRIMARY KEY NOT NULL,
	"target_id" text NOT NULL,
	"field" text NOT NULL,
	"cause" text,
	"opened_run" integer NOT NULL,
	"closed_run" integer
);
--> statement-breakpoint
CREATE TABLE "field_runs" (
	"run_id" integer NOT NULL,
	"field" text NOT NULL,
	"value" text,
	"status" text NOT NULL,
	"reason" text,
	"proof_id" text NOT NULL,
	"golden_sha256" text,
	"capture_sha256" text,
	"ranked" jsonb,
	"held_since_run" integer,
	"group_key" text,
	CONSTRAINT "field_runs_run_id_field_pk" PRIMARY KEY("run_id","field"),
	CONSTRAINT "field_runs_proof_id_unique" UNIQUE("proof_id")
);
--> statement-breakpoint
CREATE TABLE "queue_items" (
	"item_id" serial PRIMARY KEY NOT NULL,
	"proof_id" text NOT NULL,
	"stakes_rows" integer DEFAULT 0 NOT NULL,
	"group_key" text,
	"resolved_by" text,
	"resolution" text,
	"ts" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"run_id" serial PRIMARY KEY NOT NULL,
	"target_id" text NOT NULL,
	"capture_sha" text,
	"skeleton_hash" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "targets" (
	"target_id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"cadence" text DEFAULT '6h' NOT NULL,
	"contract" jsonb NOT NULL,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_target_id_targets_target_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."targets"("target_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_runs" ADD CONSTRAINT "field_runs_run_id_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("run_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_items" ADD CONSTRAINT "queue_items_proof_id_field_runs_proof_id_fk" FOREIGN KEY ("proof_id") REFERENCES "public"."field_runs"("proof_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_target_id_targets_target_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."targets"("target_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_capture_sha_captures_sha256_fk" FOREIGN KEY ("capture_sha") REFERENCES "public"."captures"("sha256") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "episodes_target_field_closed_idx" ON "episodes" USING btree ("target_id","field","closed_run");--> statement-breakpoint
CREATE INDEX "field_runs_status_idx" ON "field_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "field_runs_group_idx" ON "field_runs" USING btree ("group_key");--> statement-breakpoint
CREATE INDEX "queue_items_resolved_idx" ON "queue_items" USING btree ("resolved_by");--> statement-breakpoint
CREATE INDEX "runs_target_started_idx" ON "runs" USING btree ("target_id","started_at");--> statement-breakpoint
CREATE INDEX "targets_next_run_at_idx" ON "targets" USING btree ("next_run_at");