ALTER TYPE "public"."file_format" ADD VALUE IF NOT EXISTS 'LINK';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "academic_terms" (
	"id" text PRIMARY KEY NOT NULL,
	"university_id" text NOT NULL,
	"code" varchar(16) NOT NULL,
	"name" text NOT NULL,
	"school_year" varchar(20) NOT NULL,
	"semester" "semester" NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text,
	"action" varchar(24) NOT NULL,
	"entity" varchar(24) NOT NULL,
	"entity_id" text,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_meta" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "idempotency_keys" (
	"scope" varchar(80) NOT NULL,
	"key" varchar(255) NOT NULL,
	"method" varchar(8) NOT NULL,
	"path" text NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"state" varchar(12) DEFAULT 'processing' NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_keys_scope_key_pk" PRIMARY KEY("scope","key")
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "academic_term_id" text;--> statement-breakpoint
ALTER TABLE "majors" ADD COLUMN "term_count" integer DEFAULT 8 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "academic_terms" ADD CONSTRAINT "academic_terms_university_id_universities_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."universities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin_activity" ADD CONSTRAINT "admin_activity_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "academic_terms_university_code_idx" ON "academic_terms" USING btree ("university_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_activity_created_idx" ON "admin_activity" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idempotency_keys_expires_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_academic_term_id_academic_terms_id_fk" FOREIGN KEY ("academic_term_id") REFERENCES "public"."academic_terms"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
