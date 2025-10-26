-- Custom SQL migration file
-- Replit Auth and Company multi-tenant setup

-- Create companies table (if not exists for safety)
CREATE TABLE IF NOT EXISTS "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"abn" varchar(20),
	"phone" varchar(20),
	"email" varchar(255),
	"address" text,
	"logo_url" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL
);

-- Update users table for Replit Auth
DO $$ 
BEGIN
    -- Drop old authentication columns
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'username') THEN
        ALTER TABLE "users" DROP COLUMN "username";
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'password') THEN
        ALTER TABLE "users" DROP COLUMN "password";
    END IF;
    
    -- Add new Replit Auth columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'replit_id') THEN
        ALTER TABLE "users" ADD COLUMN "replit_id" varchar(255) UNIQUE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email') THEN
        ALTER TABLE "users" ADD COLUMN "email" varchar(255);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'first_name') THEN
        ALTER TABLE "users" ADD COLUMN "first_name" varchar(255);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'last_name') THEN
        ALTER TABLE "users" ADD COLUMN "last_name" varchar(255);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'profile_image_url') THEN
        ALTER TABLE "users" ADD COLUMN "profile_image_url" varchar(500);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'company_id') THEN
        ALTER TABLE "users" ADD COLUMN "company_id" integer REFERENCES "companies"("id");
    END IF;
END $$;

-- Ensure sessions table exists for connect-pg-simple
CREATE TABLE IF NOT EXISTS "sessions" (
  "sid" varchar NOT NULL PRIMARY KEY,
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
);

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "sessions" ("expire");
