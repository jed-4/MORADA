CREATE TABLE IF NOT EXISTS "message_reactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"emoji" text NOT NULL,
	"user_first_name" text,
	"user_last_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "message_reactions_message_user_emoji_unique" UNIQUE("message_id","user_id","emoji")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_reactions_message_id_idx" ON "message_reactions" USING btree ("message_id");
