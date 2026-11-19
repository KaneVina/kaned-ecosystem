-- Lecturer directory ("Tra cứu giảng viên") and the documents' link to it.
CREATE TABLE IF NOT EXISTS "lecturers" (
  "id" text PRIMARY KEY NOT NULL,
  "university_id" text NOT NULL REFERENCES "universities"("id") ON DELETE cascade,
  "code" varchar(32) NOT NULL,
  "full_name" text NOT NULL,
  "department" text,
  "gender" varchar(8),
  "phone" varchar(32),
  "email" varchar(160),
  "description" text,
  "links" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "search" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lecturers_university_code_idx" ON "lecturers" ("university_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lecturers_university_idx" ON "lecturers" ("university_id");--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "lecturer_id" text REFERENCES "lecturers"("id") ON DELETE set null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_lecturer_idx" ON "documents" ("lecturer_id");
