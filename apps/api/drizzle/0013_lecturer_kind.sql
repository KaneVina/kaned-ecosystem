-- Giảng viên or cán bộ.
ALTER TABLE "lecturers" ADD COLUMN IF NOT EXISTS "kind" varchar(12) DEFAULT 'LECTURER' NOT NULL;
