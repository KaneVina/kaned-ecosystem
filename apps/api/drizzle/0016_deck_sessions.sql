-- How often each learner studied a deck: study sessions (gaps of 30 min or more start a new one) and answers given.
ALTER TABLE "deck_progress" ADD COLUMN IF NOT EXISTS "sessions" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "deck_progress" ADD COLUMN IF NOT EXISTS "answers" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "deck_progress" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
UPDATE "deck_progress" p SET
  "answers" = COALESCE((SELECT SUM(COALESCE((v->>'c')::int, 0) + COALESCE((v->>'w')::int, 0)) FROM jsonb_each(p."state"->'st') AS e(k, v)), 0),
  "created_at" = p."updated_at";
