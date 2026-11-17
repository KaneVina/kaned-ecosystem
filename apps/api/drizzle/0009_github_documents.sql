ALTER TYPE "public"."file_format" ADD VALUE IF NOT EXISTS 'GITHUB';--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "guide" text;
