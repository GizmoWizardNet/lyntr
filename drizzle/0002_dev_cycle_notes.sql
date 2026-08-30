CREATE TABLE IF NOT EXISTS "dev_cycle_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"commit_sha" varchar(40) NOT NULL,
	"note" text NOT NULL,
	"author_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "dev_cycle_notes_commit_sha_idx" ON "dev_cycle_notes" ("commit_sha");