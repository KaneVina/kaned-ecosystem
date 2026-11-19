-- "Lưu hành nội bộ": members only, original link hidden, optional no download / no share.
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "internal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "allow_download" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "allow_share" boolean DEFAULT true NOT NULL;
