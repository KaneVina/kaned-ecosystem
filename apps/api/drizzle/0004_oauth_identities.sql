CREATE TABLE IF NOT EXISTS "user_identities" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" varchar(20) NOT NULL,
	"provider_user_id" varchar(190) NOT NULL,
	"email" varchar(190),
	"email_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_identities_provider_account_idx" ON "user_identities" USING btree ("provider","provider_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_identities_user_provider_idx" ON "user_identities" USING btree ("user_id","provider");--> statement-breakpoint
-- Accounts that already signed in with Google keep working: their Google id
-- moves into user_identities before the old column goes away.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'google_id') THEN
  INSERT INTO "user_identities" ("id", "user_id", "provider", "provider_user_id", "email", "email_verified")
  SELECT gen_random_uuid()::text, "id", 'google', "google_id", "email", true
  FROM "users" WHERE "google_id" IS NOT NULL
  ON CONFLICT DO NOTHING;
 END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_google_id_unique";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "google_id";