-- VEC – Virtual Exam Center: server-held exam sessions.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "student_code" varchar(20);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "class_name" varchar(40);

CREATE TABLE IF NOT EXISTS "vec_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "host_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" varchar(2) DEFAULT 'FE' NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "instructions" text,
  "lecturer_display" text NOT NULL,
  "subject_code" varchar(24) NOT NULL,
  "subject_name" text NOT NULL,
  "university_id" text,
  "deck_id" text,
  "ephemeral" boolean DEFAULT false NOT NULL,
  "room_code" varchar(7) NOT NULL,
  "otp_enc" text,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "duration_min" integer NOT NULL,
  "lobby_open_min" integer DEFAULT 15 NOT NULL,
  "late_join_min" integer DEFAULT 10 NOT NULL,
  "status_override" varchar(12),
  "paused_at" timestamp with time zone,
  "paused_total_sec" integer DEFAULT 0 NOT NULL,
  "ended_at" timestamp with time zone,
  "end_reason" varchar(16),
  "question_count" integer DEFAULT 0 NOT NULL,
  "settings" jsonb NOT NULL,
  "results_released_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vec_sessions_time_chk" CHECK ("ends_at" > "starts_at"),
  CONSTRAINT "vec_sessions_duration_chk" CHECK ("duration_min" BETWEEN 5 AND 720),
  CONSTRAINT "vec_sessions_lobby_chk" CHECK ("lobby_open_min" BETWEEN 0 AND 60)
);
CREATE INDEX IF NOT EXISTS "vec_sessions_host_idx" ON "vec_sessions" ("host_id", "starts_at");
CREATE INDEX IF NOT EXISTS "vec_sessions_expires_idx" ON "vec_sessions" ("expires_at");
-- A room code is unique among sessions that have not ended; it is reused afterwards.
CREATE UNIQUE INDEX IF NOT EXISTS "vec_active_room_code" ON "vec_sessions" ("room_code")
  WHERE "status_override" IS NULL OR "status_override" = 'PAUSED';

CREATE TABLE IF NOT EXISTS "vec_session_questions" (
  "session_id" text NOT NULL REFERENCES "vec_sessions"("id") ON DELETE CASCADE,
  "qid" varchar(24) NOT NULL,
  "position" integer NOT NULL,
  "chapter" integer DEFAULT 0 NOT NULL,
  "kind" varchar(8) NOT NULL,
  "text" text NOT NULL,
  "options" jsonb NOT NULL,
  "answers" jsonb NOT NULL,
  "can_shuffle" boolean DEFAULT true NOT NULL,
  "explain" text,
  "note" text,
  PRIMARY KEY ("session_id", "qid")
);

CREATE TABLE IF NOT EXISTS "vec_participants" (
  "session_id" text NOT NULL REFERENCES "vec_sessions"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "candidate_info" jsonb NOT NULL,
  "consented_at" timestamp with time zone DEFAULT now() NOT NULL,
  "extra_retakes" integer DEFAULT 0 NOT NULL,
  "retakes_used" integer DEFAULT 0 NOT NULL,
  "counted_score10" double precision,
  "counted_attempt_no" integer,
  "retake_requested_at" timestamp with time zone,
  "retake_request_note" text,
  "retake_approved_at" timestamp with time zone,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL,
  "first_ip" varchar(64),
  "first_ua_hash" varchar(32),
  PRIMARY KEY ("session_id", "user_id")
);

CREATE TABLE IF NOT EXISTS "vec_attempts" (
  "id" text PRIMARY KEY NOT NULL,
  "session_id" text NOT NULL REFERENCES "vec_sessions"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "attempt_no" integer DEFAULT 1 NOT NULL,
  "counts_toward_limit" boolean DEFAULT true NOT NULL,
  "state" varchar(16) DEFAULT 'LOBBY' NOT NULL,
  "version" integer DEFAULT 0 NOT NULL,
  "paper_code" varchar(6) NOT NULL,
  "seed" text NOT NULL,
  "started_at" timestamp with time zone,
  "submitted_at" timestamp with time zone,
  "deadline_at" timestamp with time zone,
  "paused_base_sec" integer DEFAULT 0 NOT NULL,
  "time_bonus_sec" integer DEFAULT 0 NOT NULL,
  "submit_reason" varchar(16),
  "lock_reason" text,
  "locked_at" timestamp with time zone,
  "resumed_at" timestamp with time zone,
  "answered_count" integer DEFAULT 0 NOT NULL,
  "flagged_count" integer DEFAULT 0 NOT NULL,
  "current_index" integer DEFAULT 0 NOT NULL,
  "correct_count" integer,
  "wrong_count" integer,
  "blank_count" integer,
  "score10" double precision,
  "grade_label" varchar(16),
  "passed" boolean,
  "graded_at" timestamp with time zone,
  "violation_lock" integer DEFAULT 0 NOT NULL,
  "violation_warn" integer DEFAULT 0 NOT NULL,
  "violation_log" integer DEFAULT 0 NOT NULL,
  "risk_score" integer DEFAULT 0 NOT NULL,
  "ip_at_start" varchar(64),
  "ua_hash" varchar(32),
  "connection_id" text,
  "connection_at" timestamp with time zone,
  "last_seen_at" timestamp with time zone,
  "fullscreen" boolean,
  "visible" boolean,
  "focused" boolean,
  "last_ip" varchar(64),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vec_attempts_score_chk" CHECK ("score10" IS NULL OR "score10" BETWEEN 0 AND 10),
  CONSTRAINT "vec_attempts_no_chk" CHECK ("attempt_no" >= 1)
);
-- One live attempt per account, whatever races happen (CAN-R1).
CREATE UNIQUE INDEX IF NOT EXISTS "vec_one_active_attempt_per_user" ON "vec_attempts" ("user_id")
  WHERE "state" IN ('LOBBY', 'IN_PROGRESS', 'SUSPENDED');
CREATE UNIQUE INDEX IF NOT EXISTS "vec_attempt_no_idx" ON "vec_attempts" ("session_id", "user_id", "attempt_no");
CREATE INDEX IF NOT EXISTS "vec_attempts_session_state_idx" ON "vec_attempts" ("session_id", "state");

CREATE TABLE IF NOT EXISTS "vec_attempt_answers" (
  "attempt_id" text NOT NULL REFERENCES "vec_attempts"("id") ON DELETE CASCADE,
  "qid" varchar(24) NOT NULL,
  "selected" jsonb NOT NULL,
  "flagged" boolean DEFAULT false NOT NULL,
  "seq" bigint NOT NULL,
  "answered_at" timestamp with time zone DEFAULT now() NOT NULL,
  "late_sync" boolean DEFAULT false NOT NULL,
  PRIMARY KEY ("attempt_id", "qid")
);

CREATE TABLE IF NOT EXISTS "vec_attempt_events" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "attempt_id" text NOT NULL REFERENCES "vec_attempts"("id") ON DELETE CASCADE,
  "session_id" text NOT NULL REFERENCES "vec_sessions"("id") ON DELETE CASCADE,
  "type" varchar(32) NOT NULL,
  "severity" varchar(8) DEFAULT 'INFO' NOT NULL,
  "data" jsonb,
  "actor_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "vec_events_session_id_idx" ON "vec_attempt_events" ("session_id", "id");
CREATE INDEX IF NOT EXISTS "vec_events_attempt_idx" ON "vec_attempt_events" ("attempt_id", "id");

CREATE TABLE IF NOT EXISTS "vec_unlock_requests" (
  "id" text PRIMARY KEY NOT NULL,
  "attempt_id" text NOT NULL REFERENCES "vec_attempts"("id") ON DELETE CASCADE,
  "session_id" text NOT NULL REFERENCES "vec_sessions"("id") ON DELETE CASCADE,
  "kind" varchar(8) DEFAULT 'UNLOCK' NOT NULL,
  "reason" text DEFAULT '' NOT NULL,
  "status" varchar(8) DEFAULT 'PENDING' NOT NULL,
  "decided_by" text,
  "decided_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "vec_unlock_session_idx" ON "vec_unlock_requests" ("session_id", "status");

CREATE TABLE IF NOT EXISTS "vec_messages" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "session_id" text NOT NULL REFERENCES "vec_sessions"("id") ON DELETE CASCADE,
  "attempt_id" text REFERENCES "vec_attempts"("id") ON DELETE CASCADE,
  "sender_id" text,
  "kind" varchar(8) DEFAULT 'ANNOUNCE' NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "vec_messages_session_idx" ON "vec_messages" ("session_id", "id");

CREATE TABLE IF NOT EXISTS "vec_audit" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "session_id" text,
  "actor_id" text,
  "action" varchar(40) NOT NULL,
  "target" text,
  "data" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "vec_audit_session_idx" ON "vec_audit" ("session_id", "id");

CREATE TABLE IF NOT EXISTS "vec_join_attempts" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "ip" varchar(64),
  "kind" varchar(4) NOT NULL,
  "key" varchar(40),
  "ok" boolean NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "vec_join_attempts_user_idx" ON "vec_join_attempts" ("user_id", "created_at");
