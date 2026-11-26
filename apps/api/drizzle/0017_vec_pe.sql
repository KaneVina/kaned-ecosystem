-- PE (practical) rooms: paper and materials, submitted solutions, manual grading.
ALTER TABLE "vec_sessions" ADD COLUMN IF NOT EXISTS "pe" jsonb;
--> statement-breakpoint
ALTER TABLE "vec_attempts" ADD COLUMN IF NOT EXISTS "grade_note" text;
--> statement-breakpoint
ALTER TABLE "vec_attempts" ADD COLUMN IF NOT EXISTS "graded_by" text REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "vec_attempts" ADD COLUMN IF NOT EXISTS "pe_closed_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vec_files" (
  "id" text PRIMARY KEY NOT NULL,
  "session_id" text REFERENCES "vec_sessions"("id") ON DELETE SET NULL,
  "attempt_id" text REFERENCES "vec_attempts"("id") ON DELETE SET NULL,
  "owner_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" varchar(12) NOT NULL,
  "name" text NOT NULL,
  "format" varchar(12) NOT NULL,
  "bytes" bigint NOT NULL,
  "sha256" varchar(64),
  "storage" varchar(12) NOT NULL,
  "storage_key" text NOT NULL,
  "status" varchar(10) DEFAULT 'PENDING' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ready_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vec_files_session_idx" ON "vec_files" ("session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vec_files_orphan_idx" ON "vec_files" ("created_at") WHERE "session_id" IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vec_submissions" (
  "id" text PRIMARY KEY NOT NULL,
  "session_id" text NOT NULL REFERENCES "vec_sessions"("id") ON DELETE CASCADE,
  "attempt_id" text NOT NULL REFERENCES "vec_attempts"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "no" integer NOT NULL,
  "file_id" text REFERENCES "vec_files"("id") ON DELETE SET NULL,
  "path" text NOT NULL,
  "file_name" text NOT NULL,
  "file_count" integer NOT NULL,
  "bytes" bigint NOT NULL,
  "sha256" varchar(64) NOT NULL,
  "note" text,
  "late" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vec_submissions_no_idx" ON "vec_submissions" ("attempt_id", "no");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vec_submissions_session_idx" ON "vec_submissions" ("session_id");
