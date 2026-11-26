-- Hẹn họp nhóm: events a leader shares by link, and the people who answer them.
CREATE TABLE IF NOT EXISTS "meet_events" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" varchar(16) NOT NULL,
  "owner_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" varchar(120) NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "location" varchar(200) DEFAULT '' NOT NULL,
  "mode" varchar(8) NOT NULL,
  "days" jsonb NOT NULL,
  "slot_min" integer NOT NULL,
  "duration_min" integer NOT NULL,
  "blocked" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "blocked_label" varchar(60) DEFAULT 'Lịch học' NOT NULL,
  "status" varchar(8) DEFAULT 'OPEN' NOT NULL,
  "final" jsonb,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meet_events_slug_idx" ON "meet_events" ("slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meet_events_owner_idx" ON "meet_events" ("owner_id", "updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meet_events_expires_idx" ON "meet_events" ("expires_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meet_participants" (
  "id" text PRIMARY KEY NOT NULL,
  "event_id" text NOT NULL REFERENCES "meet_events"("id") ON DELETE CASCADE,
  "name" varchar(40) NOT NULL,
  "name_key" varchar(60) NOT NULL,
  "token_hash" varchar(64) NOT NULL,
  "pin_hash" varchar(64),
  "user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "free" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "busy" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "busy_note" varchar(80) DEFAULT '' NOT NULL,
  "saved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meet_participants_name_idx" ON "meet_participants" ("event_id", "name_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meet_participants_token_idx" ON "meet_participants" ("token_hash");
