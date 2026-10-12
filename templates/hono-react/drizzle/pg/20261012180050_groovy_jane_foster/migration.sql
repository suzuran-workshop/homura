CREATE TABLE "license_state" (
	"id" text PRIMARY KEY,
	"license_id" text,
	"instance_key" text NOT NULL,
	"updated_at" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"token_hash" text PRIMARY KEY,
	"family_id" text NOT NULL,
	"sid" text NOT NULL,
	"sub" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"used_at" bigint,
	"profile" text
);
--> statement-breakpoint
CREATE TABLE "todos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"title" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"ownerSub" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"meta" jsonb
);
--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens" ("family_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_sub_idx" ON "refresh_tokens" ("sub");