CREATE TABLE "oauth_refresh_tokens" (
	"hash" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"key_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_client_id_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("client_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_key_id_api_keys_key_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."api_keys"("key_id") ON DELETE no action ON UPDATE no action;