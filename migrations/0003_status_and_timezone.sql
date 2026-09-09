ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status_text" varchar(100);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status_expires_at" timestamp;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "timezone_label" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "timezone_offset" text;
