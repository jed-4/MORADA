-- Auto-generated catch-up migration covering DDL applied piecemeal via
-- direct SQL between snapshot 0009 and the post-pricing-refactor state.
-- Hand-edited to be idempotent (IF NOT EXISTS / DO $$ guards) so it is
-- safe to replay against a database where some/all of these statements
-- have already been applied (which is the case in BuildPro's prod, since
-- deployment uses `db:push` rather than `drizzle-kit migrate`).
-- Duplicates of statements present in 0011_proposals_share_token.sql
-- (proposals.share_token column + unique constraint) are intentionally
-- omitted.

DO $$ BEGIN
  CREATE TYPE "public"."dashboard_type" AS ENUM('business', 'project', 'user_workspace');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
ALTER TYPE "public"."bill_status" ADD VALUE IF NOT EXISTS 'needs_review' BEFORE 'awaiting_approval';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_direct_cost_actuals" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "company_id" varchar NOT NULL,
        "year" integer NOT NULL,
        "month" integer NOT NULL,
        "direct_cost_cents" integer DEFAULT 0 NOT NULL,
        "breakdown" jsonb,
        "xero_imported" boolean DEFAULT false NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "proposal_payment_milestones" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "proposal_id" varchar NOT NULL,
        "company_id" varchar,
        "name" text NOT NULL,
        "percentage" double precision,
        "amount_cents" integer,
        "description" text,
        "order" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "takeoff_categories" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "project_id" varchar NOT NULL,
        "company_id" varchar NOT NULL,
        "name" text NOT NULL,
        "order" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "takeoff_markups" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "plan_id" varchar NOT NULL,
        "page_number" integer DEFAULT 1 NOT NULL,
        "project_id" varchar NOT NULL,
        "company_id" varchar NOT NULL,
        "markup_type" text NOT NULL,
        "color" text DEFAULT '#E85D04' NOT NULL,
        "geometry" json DEFAULT '[]'::json NOT NULL,
        "label" text,
        "font_size" integer DEFAULT 14 NOT NULL,
        "stroke_width" integer DEFAULT 2 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "takeoff_measurements" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "plan_id" varchar NOT NULL,
        "page_id" varchar NOT NULL,
        "project_id" varchar NOT NULL,
        "company_id" varchar NOT NULL,
        "category_id" varchar,
        "name" text NOT NULL,
        "measurement_type" text NOT NULL,
        "color" text DEFAULT '#A890D4' NOT NULL,
        "geometry" json DEFAULT '[]'::json NOT NULL,
        "quantity" double precision DEFAULT 0 NOT NULL,
        "unit" text DEFAULT 'm²' NOT NULL,
        "multiplier" double precision DEFAULT 1 NOT NULL,
        "waste_percent" double precision DEFAULT 0 NOT NULL,
        "fill_pattern" text DEFAULT 'solid' NOT NULL,
        "line_type" text DEFAULT 'solid' NOT NULL,
        "line_size" integer DEFAULT 2 NOT NULL,
        "is_visible" boolean DEFAULT true NOT NULL,
        "order" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "takeoff_plan_pages" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "plan_id" varchar NOT NULL,
        "company_id" varchar NOT NULL,
        "page_number" integer DEFAULT 1 NOT NULL,
        "name" text,
        "is_scaled" boolean DEFAULT false NOT NULL,
        "scale_ratio" double precision,
        "calibration_pixel_length" double precision,
        "calibration_real_distance" double precision,
        "calibration_unit" text DEFAULT 'mm',
        "rotation" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "takeoff_plans" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "project_id" varchar NOT NULL,
        "company_id" varchar NOT NULL,
        "name" text NOT NULL,
        "object_path" text NOT NULL,
        "page_count" integer DEFAULT 1 NOT NULL,
        "order" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_memos" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "company_id" varchar NOT NULL,
        "content" text DEFAULT '' NOT NULL,
        "pinned" boolean DEFAULT false NOT NULL,
        "sort_order" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bill_line_items" ALTER COLUMN "quantity" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "estimate_items" ALTER COLUMN "markup_percent" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "estimates" ALTER COLUMN "project_markup_percent" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "color" SET DEFAULT '#A890D4';--> statement-breakpoint
ALTER TABLE "supplier_labels" ALTER COLUMN "color" SET DEFAULT '#A890D4';--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "tax_mode" text DEFAULT 'exclusive' NOT NULL;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "xero_last_sync_at" timestamp;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "xero_last_sync_status" text;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "xero_last_sync_error" text;--> statement-breakpoint
ALTER TABLE "checklist_template_items" ADD COLUMN IF NOT EXISTS "assigned_role_id" varchar;--> statement-breakpoint
ALTER TABLE "client_invoices" ADD COLUMN IF NOT EXISTS "xero_invoice_number" text;--> statement-breakpoint
ALTER TABLE "company_income_actuals" ADD COLUMN IF NOT EXISTS "breakdown" jsonb;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "proposal_show_logo" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "workspace_schedule_view" text DEFAULT 'all';--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "bill_default_xero_account" text;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "takeoff_measurement_templates" json;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "payment_schedule_templates" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "proposal_templates" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "suppress_defaults_prompt" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "dashboard_views" ADD COLUMN IF NOT EXISTS "dashboard_type" "dashboard_type" DEFAULT 'business' NOT NULL;--> statement-breakpoint
ALTER TABLE "dashboard_views" ADD COLUMN IF NOT EXISTS "user_id" varchar;--> statement-breakpoint
ALTER TABLE "overhead_items" ADD COLUMN IF NOT EXISTS "xero_account_type" text;--> statement-breakpoint
ALTER TABLE "overhead_items" ADD COLUMN IF NOT EXISTS "buildpro_group" text;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "parent_proposal_id" varchar;--> statement-breakpoint
-- proposals.share_token + proposals_share_token_unique are added by 0011_proposals_share_token.sql; intentionally omitted here.
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "content_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "view_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "last_viewed_at" timestamp;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "viewer_device" text;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "layout_settings" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "scope_stages" ADD COLUMN IF NOT EXISTS "normalized_name" text GENERATED ALWAYS AS (lower(btrim(name))) STORED;--> statement-breakpoint
-- Drop the old expression-based unique index if it survives from a legacy DB; the new column-based one is recreated below.
DROP INDEX IF EXISTS "scope_stages_project_normalized_name_unique";--> statement-breakpoint
ALTER TABLE "selections" ADD COLUMN IF NOT EXISTS "estimate_item_id" varchar;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "company_direct_cost_actuals" ADD CONSTRAINT "company_direct_cost_actuals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "proposal_payment_milestones" ADD CONSTRAINT "proposal_payment_milestones_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "proposal_payment_milestones" ADD CONSTRAINT "proposal_payment_milestones_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "takeoff_categories" ADD CONSTRAINT "takeoff_categories_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "takeoff_categories" ADD CONSTRAINT "takeoff_categories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "takeoff_markups" ADD CONSTRAINT "takeoff_markups_plan_id_takeoff_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."takeoff_plans"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "takeoff_markups" ADD CONSTRAINT "takeoff_markups_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "takeoff_markups" ADD CONSTRAINT "takeoff_markups_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "takeoff_measurements" ADD CONSTRAINT "takeoff_measurements_plan_id_takeoff_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."takeoff_plans"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "takeoff_measurements" ADD CONSTRAINT "takeoff_measurements_page_id_takeoff_plan_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."takeoff_plan_pages"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "takeoff_measurements" ADD CONSTRAINT "takeoff_measurements_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "takeoff_measurements" ADD CONSTRAINT "takeoff_measurements_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "takeoff_measurements" ADD CONSTRAINT "takeoff_measurements_category_id_takeoff_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."takeoff_categories"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "takeoff_plan_pages" ADD CONSTRAINT "takeoff_plan_pages_plan_id_takeoff_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."takeoff_plans"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "takeoff_plan_pages" ADD CONSTRAINT "takeoff_plan_pages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "takeoff_plans" ADD CONSTRAINT "takeoff_plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "takeoff_plans" ADD CONSTRAINT "takeoff_plans_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "user_memos" ADD CONSTRAINT "user_memos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "user_memos" ADD CONSTRAINT "user_memos_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "company_direct_cost_actuals_company_year_month_unique" ON "company_direct_cost_actuals" USING btree ("company_id","year","month");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "takeoff_plan_pages_plan_page_uq" ON "takeoff_plan_pages" USING btree ("plan_id","page_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_memos_user_idx" ON "user_memos" USING btree ("user_id");--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "checklist_template_items" ADD CONSTRAINT "checklist_template_items_assigned_role_id_user_roles_id_fk" FOREIGN KEY ("assigned_role_id") REFERENCES "public"."user_roles"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "dashboard_views" ADD CONSTRAINT "dashboard_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "proposals" ADD CONSTRAINT "proposals_parent_proposal_id_proposals_id_fk" FOREIGN KEY ("parent_proposal_id") REFERENCES "public"."proposals"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "selections" ADD CONSTRAINT "selections_estimate_item_id_estimate_items_id_fk" FOREIGN KEY ("estimate_item_id") REFERENCES "public"."estimate_items"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dashboard_views_dashboard_type_idx" ON "dashboard_views" USING btree ("dashboard_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dashboard_views_user_idx" ON "dashboard_views" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "scope_stages_project_normalized_name_unique" ON "scope_stages" USING btree ("project_id","normalized_name");
