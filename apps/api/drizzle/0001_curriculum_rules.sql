ALTER TABLE "major_subjects" ADD COLUMN "requirements" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "major_subjects" ADD COLUMN "choice_group" varchar(40);--> statement-breakpoint
ALTER TABLE "majors" ADD COLUMN "pass_mark" real DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "subject_prerequisites" ADD COLUMN "min_score" real;