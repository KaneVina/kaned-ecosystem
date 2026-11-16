CREATE TABLE IF NOT EXISTS "subject_folders" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_id" text NOT NULL,
	"parent_id" text,
	"name" varchar(80) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "folder_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subject_folders" ADD CONSTRAINT "subject_folders_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subject_folders" ADD CONSTRAINT "subject_folders_parent_id_subject_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."subject_folders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subject_folders_subject_idx" ON "subject_folders" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subject_folders_parent_idx" ON "subject_folders" USING btree ("parent_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_folder_id_subject_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."subject_folders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_folder_idx" ON "documents" USING btree ("folder_id");