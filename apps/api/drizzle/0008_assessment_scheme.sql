ALTER TABLE "subjects" ADD COLUMN IF NOT EXISTS "assessment_scheme" jsonb DEFAULT '[]'::jsonb NOT NULL;
