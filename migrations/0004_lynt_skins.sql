ALTER TABLE "lynts" ADD COLUMN IF NOT EXISTS "lyntskin_key" text;
ALTER TABLE "clan_lynts" ADD COLUMN IF NOT EXISTS "lyntskin_key" text;

CREATE TABLE IF NOT EXISTS "user_lyntskins" (
	"id" uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"skin_key" text NOT NULL,
	"purchased_at" timestamp DEFAULT now()
);

DO $$ BEGIN
	ALTER TABLE "user_lyntskins" ADD CONSTRAINT "user_lyntskins_user_id_users_id_fk"
		FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "user_lyntskins_user_id_skin_key_idx" ON "user_lyntskins" ("user_id", "skin_key");