CREATE TABLE "focus_blocks" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "company_id" varchar NOT NULL,
        "title" text NOT NULL,
        "color" text DEFAULT '#6366f1' NOT NULL,
        "start_time" text NOT NULL,
        "end_time" text NOT NULL,
        "is_recurring" boolean DEFAULT false NOT NULL,
        "days_of_week" integer[] DEFAULT '{}',
        "specific_date" date,
        "category_type" text DEFAULT 'general' NOT NULL,
        "category_id" varchar,
        "pinned_task_ids" text[] DEFAULT '{}',
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "focus_blocks" ADD CONSTRAINT "focus_blocks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "focus_blocks" ADD CONSTRAINT "focus_blocks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
