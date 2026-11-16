ALTER TYPE "public"."document_type" ADD VALUE IF NOT EXISTS 'PROJECT';--> statement-breakpoint
ALTER TYPE "public"."document_type" ADD VALUE IF NOT EXISTS 'TEXTBOOK';--> statement-breakpoint
ALTER TYPE "public"."file_format" ADD VALUE IF NOT EXISTS 'HTML' BEFORE 'LINK';--> statement-breakpoint
ALTER TYPE "public"."file_format" ADD VALUE IF NOT EXISTS 'MD' BEFORE 'LINK';--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "lecturer" varchar(120);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "period" varchar(40);--> statement-breakpoint
ALTER TABLE "universities" ADD COLUMN IF NOT EXISTS "periods" jsonb;--> statement-breakpoint
UPDATE "universities" SET "periods" = '["Block 10","Block 10 - Half 1","Block 10 - Half 2","Block 3"]'::jsonb WHERE "code" = 'FPTU' AND "periods" IS NULL;
--> statement-breakpoint
UPDATE "documents" SET "thumbnail_url" = NULL WHERE "format" <> 'PDF' AND "thumbnail_url" IS NOT NULL;
