-- Lecturer date of birth (YYYY-MM-DD); age is worked out when shown.
ALTER TABLE "lecturers" ADD COLUMN IF NOT EXISTS "birth_date" varchar(10);
