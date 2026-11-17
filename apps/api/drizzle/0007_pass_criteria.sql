ALTER TABLE "subjects" ADD COLUMN IF NOT EXISTS "pass_criteria" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "grades" ADD COLUMN IF NOT EXISTS "criteria" jsonb DEFAULT '{}'::jsonb NOT NULL;
