CREATE TYPE "public"."document_status" AS ENUM('PENDING', 'PUBLISHED', 'REJECTED', 'REMOVED');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('NOTES', 'SLIDES', 'EXERCISES', 'EXAM', 'REVIEW', 'ASSIGNMENT', 'BOOK', 'REPORT');--> statement-breakpoint
CREATE TYPE "public"."file_format" AS ENUM('PDF', 'DOCX', 'PPTX', 'XLSX');--> statement-breakpoint
CREATE TYPE "public"."prereq_type" AS ENUM('PREREQUISITE', 'COREQUISITE', 'PRIOR');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('STUDENT', 'MODERATOR', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."semester" AS ENUM('S1', 'S2', 'SUMMER');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bookmarks" (
	"user_id" text NOT NULL,
	"document_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookmarks_user_id_document_id_pk" PRIMARY KEY("user_id","document_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "collection_items" (
	"collection_id" text NOT NULL,
	"document_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_items_collection_id_document_id_pk" PRIMARY KEY("collection_id","document_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "collections" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(60) NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_tags" (
	"document_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "document_tags_document_id_tag_id_pk" PRIMARY KEY("document_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"type" "document_type" NOT NULL,
	"format" "file_format" NOT NULL,
	"status" "document_status" DEFAULT 'PUBLISHED' NOT NULL,
	"language" varchar(32) DEFAULT 'Vietnamese' NOT NULL,
	"file_url" text NOT NULL,
	"file_public_id" text NOT NULL,
	"file_bytes" integer NOT NULL,
	"pages" integer,
	"thumbnail_url" text,
	"year" integer NOT NULL,
	"semester" "semester" NOT NULL,
	"school_year" varchar(20),
	"university_id" text NOT NULL,
	"subject_id" text NOT NULL,
	"uploader_id" text NOT NULL,
	"downloads" integer DEFAULT 0 NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"rating_avg" real DEFAULT 0 NOT NULL,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "faculties" (
	"id" text PRIMARY KEY NOT NULL,
	"code" varchar(16) NOT NULL,
	"name" text NOT NULL,
	"name_vi" text NOT NULL,
	"university_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "grades" (
	"user_id" text NOT NULL,
	"subject_id" text NOT NULL,
	"score_10" double precision,
	"term_no" integer,
	"in_progress" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grades_user_id_subject_id_pk" PRIMARY KEY("user_id","subject_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "major_subjects" (
	"major_id" text NOT NULL,
	"subject_id" text NOT NULL,
	"term_no" integer,
	"is_required" boolean DEFAULT true NOT NULL,
	CONSTRAINT "major_subjects_major_id_subject_id_pk" PRIMARY KEY("major_id","subject_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "majors" (
	"id" text PRIMARY KEY NOT NULL,
	"code" varchar(16) NOT NULL,
	"name" text NOT NULL,
	"name_vi" text NOT NULL,
	"total_credits" integer DEFAULT 145 NOT NULL,
	"faculty_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "refresh_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"user_agent" varchar(190),
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"score" integer NOT NULL,
	"comment" text NOT NULL,
	"user_id" text NOT NULL,
	"document_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subject_prerequisites" (
	"subject_id" text NOT NULL,
	"requires_id" text NOT NULL,
	"type" "prereq_type" DEFAULT 'PREREQUISITE' NOT NULL,
	"note" text,
	CONSTRAINT "subject_prerequisites_subject_id_requires_id_pk" PRIMARY KEY("subject_id","requires_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subjects" (
	"id" text PRIMARY KEY NOT NULL,
	"code" varchar(24) NOT NULL,
	"name" text NOT NULL,
	"name_vi" text NOT NULL,
	"credits" integer DEFAULT 3 NOT NULL,
	"description" text,
	"assessment" text,
	"outcomes" text[] DEFAULT '{}'::text[] NOT NULL,
	"topics" text[] DEFAULT '{}'::text[] NOT NULL,
	"typical_year" integer,
	"typical_semester" "semester",
	"university_id" text NOT NULL,
	"faculty_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tags" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" varchar(64) NOT NULL,
	CONSTRAINT "tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "universities" (
	"id" text PRIMARY KEY NOT NULL,
	"code" varchar(16) NOT NULL,
	"name" text NOT NULL,
	"name_vi" text NOT NULL,
	"city" text NOT NULL,
	"region" varchar(16) DEFAULT 'south' NOT NULL,
	"kind" varchar(16) DEFAULT 'Public' NOT NULL,
	"founded_year" integer,
	"color" varchar(9) DEFAULT '#4433B4' NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "universities_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" varchar(190) NOT NULL,
	"name" text NOT NULL,
	"password_hash" text,
	"google_id" varchar(64),
	"avatar_url" text,
	"bio" text,
	"role" "role" DEFAULT 'STUDENT' NOT NULL,
	"year" integer,
	"university_id" text,
	"major_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "collections" ADD CONSTRAINT "collections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_tags" ADD CONSTRAINT "document_tags_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_tags" ADD CONSTRAINT "document_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_university_id_universities_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."universities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "faculties" ADD CONSTRAINT "faculties_university_id_universities_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."universities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grades" ADD CONSTRAINT "grades_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grades" ADD CONSTRAINT "grades_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "major_subjects" ADD CONSTRAINT "major_subjects_major_id_majors_id_fk" FOREIGN KEY ("major_id") REFERENCES "public"."majors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "major_subjects" ADD CONSTRAINT "major_subjects_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "majors" ADD CONSTRAINT "majors_faculty_id_faculties_id_fk" FOREIGN KEY ("faculty_id") REFERENCES "public"."faculties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reviews" ADD CONSTRAINT "reviews_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subject_prerequisites" ADD CONSTRAINT "subject_prerequisites_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subject_prerequisites" ADD CONSTRAINT "subject_prerequisites_requires_id_subjects_id_fk" FOREIGN KEY ("requires_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subjects" ADD CONSTRAINT "subjects_university_id_universities_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."universities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subjects" ADD CONSTRAINT "subjects_faculty_id_faculties_id_fk" FOREIGN KEY ("faculty_id") REFERENCES "public"."faculties"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_university_id_universities_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."universities"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_major_id_majors_id_fk" FOREIGN KEY ("major_id") REFERENCES "public"."majors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookmarks_document_idx" ON "bookmarks" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "collections_user_name_idx" ON "collections" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_tags_tag_idx" ON "document_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_subject_idx" ON "documents" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_university_idx" ON "documents" USING btree ("university_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_uploader_idx" ON "documents" USING btree ("uploader_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_type_idx" ON "documents" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_downloads_idx" ON "documents" USING btree ("downloads");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_status_created_idx" ON "documents" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "faculties_university_code_idx" ON "faculties" USING btree ("university_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "major_subjects_subject_idx" ON "major_subjects" USING btree ("subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "majors_faculty_code_idx" ON "majors" USING btree ("faculty_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reviews_user_document_idx" ON "reviews" USING btree ("user_id","document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reviews_document_idx" ON "reviews" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subject_prerequisites_requires_idx" ON "subject_prerequisites" USING btree ("requires_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subjects_university_code_idx" ON "subjects" USING btree ("university_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subjects_code_idx" ON "subjects" USING btree ("code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subjects_faculty_idx" ON "subjects" USING btree ("faculty_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_university_idx" ON "users" USING btree ("university_id");