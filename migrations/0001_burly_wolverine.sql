CREATE TYPE "public"."oh_frequency" AS ENUM('weekly', 'monthly', 'quarterly', 'annual');--> statement-breakpoint
CREATE TABLE "company_oh_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"target_oh_percent" numeric(5, 2) DEFAULT '15' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_oh_settings_company_id_unique" UNIQUE("company_id")
);
--> statement-breakpoint
CREATE TABLE "doc_folders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"name" text NOT NULL,
	"parent_folder_id" varchar,
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "docs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"folder_id" varchar,
	"title" text DEFAULT 'Untitled' NOT NULL,
	"content_html" text DEFAULT '',
	"content_text" text DEFAULT '',
	"owner_id" varchar,
	"owner_name" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "enote_attachments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enote_id" varchar NOT NULL,
	"file_name" text NOT NULL,
	"file_url" text NOT NULL,
	"file_size" integer,
	"mime_type" text,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enote_template_sets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enote_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"group_name" text DEFAULT 'General' NOT NULL,
	"category_name" text NOT NULL,
	"brainstorm_notes" text,
	"is_required" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"template_set_id" varchar
);
--> statement-breakpoint
CREATE TABLE "estimate_enotes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estimate_id" varchar NOT NULL,
	"group_name" text NOT NULL,
	"category_name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"required" boolean,
	"brainstorm_notes" text,
	"rfi_required" boolean DEFAULT false NOT NULL,
	"rfq_required" boolean DEFAULT false NOT NULL,
	"rfq_date" text,
	"labour_required" boolean DEFAULT false NOT NULL,
	"estimator_notes" text,
	"completed" boolean DEFAULT false NOT NULL,
	"take_off_review" boolean DEFAULT false NOT NULL,
	"revisit" boolean DEFAULT false NOT NULL,
	"revisit_reason" text,
	"is_custom" boolean DEFAULT false NOT NULL,
	"status" text
);
--> statement-breakpoint
CREATE TABLE "hbcf_projects" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"project_id" varchar,
	"name" text NOT NULL,
	"max_value" numeric(15, 2) DEFAULT '0' NOT NULL,
	"statuses" jsonb DEFAULT '{}'::jsonb,
	"color" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_selections" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" varchar NOT NULL,
	"selection_option_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labour_estimate_categories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"labour_estimate_id" varchar NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'not_complete' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labour_estimate_tasks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" varchar NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"sub_heading" text,
	"num_men" double precision DEFAULT 1 NOT NULL,
	"hours_per_man" double precision DEFAULT 0 NOT NULL,
	"total_hours" double precision DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labour_estimates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"company_id" varchar NOT NULL,
	"title" text DEFAULT 'Labour Estimate' NOT NULL,
	"labour_rate_per_hour" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labour_task_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"category_name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"sub_heading" text,
	"num_men" double precision DEFAULT 1 NOT NULL,
	"hours_per_man" double precision DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oh_pipeline_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"name" text NOT NULL,
	"estimated_value" integer DEFAULT 0 NOT NULL,
	"probability_percent" integer DEFAULT 100 NOT NULL,
	"expected_start_date" date,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "overhead_categories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "overhead_forecast_overrides" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" varchar NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"forecast_cents" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "overhead_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" varchar NOT NULL,
	"name" text NOT NULL,
	"frequency" "oh_frequency" DEFAULT 'monthly' NOT NULL,
	"budget_cents" integer DEFAULT 0 NOT NULL,
	"xero_account_code" text,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "overhead_month_actuals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" varchar NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"actual_cents" integer DEFAULT 0 NOT NULL,
	"xero_imported" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "overhead_month_status" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"confirmed_at" timestamp,
	"confirmed_by_user_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scope_item_type_definitions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"name" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"visible_to_roles" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#6b7280' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variation_bills" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variation_id" varchar NOT NULL,
	"bill_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variation_timesheets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variation_id" varchar NOT NULL,
	"timesheet_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checklist_instance_groups" ALTER COLUMN "priority" SET DEFAULT 'low';--> statement-breakpoint
ALTER TABLE "checklist_instances" ALTER COLUMN "priority" SET DEFAULT 'low';--> statement-breakpoint
ALTER TABLE "reminder_notifications" ALTER COLUMN "delivery_method" SET DEFAULT 'in_app';--> statement-breakpoint
ALTER TABLE "schedule_items" ALTER COLUMN "priority" SET DEFAULT 'low';--> statement-breakpoint
ALTER TABLE "checklist_instances" ADD COLUMN "visibility" text DEFAULT 'everyone' NOT NULL;--> statement-breakpoint
ALTER TABLE "checklist_instances" ADD COLUMN "scope_stage_id" varchar;--> statement-breakpoint
ALTER TABLE "checklist_templates" ADD COLUMN "visible_to_roles" json DEFAULT '[]'::json;--> statement-breakpoint
ALTER TABLE "checklist_templates" ADD COLUMN "default_visibility" text DEFAULT 'everyone' NOT NULL;--> statement-breakpoint
ALTER TABLE "client_invoice_items" ADD COLUMN "unit" text;--> statement-breakpoint
ALTER TABLE "client_invoice_items" ADD COLUMN "cost_code_id" varchar;--> statement-breakpoint
ALTER TABLE "client_invoice_items" ADD COLUMN "xero_account_code" text;--> statement-breakpoint
ALTER TABLE "client_invoice_payments" ADD COLUMN "is_voided" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "client_invoices" ADD COLUMN "contract_claim_rows" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "terms_templates" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "hwi_exposure_limit" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "hwi_insurer" text;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "hwi_policy_number" text;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "hwi_expiry_date" text;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "builder_license_number" text;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "builder_license_expiry" text;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "builder_license_state" text DEFAULT 'VIC';--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "public_liability_insurer" text;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "public_liability_limit" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "public_liability_expiry" text;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "public_liability_policy_number" text;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "contract_works_insurer" text;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "contract_works_limit" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "contract_works_expiry" text;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "contract_works_policy_number" text;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "workers_comp_insurer" text;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "workers_comp_policy_number" text;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "workers_comp_expiry" text;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "prof_indemnity_insurer" text;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "prof_indemnity_limit" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "prof_indemnity_expiry" text;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "annual_revenue_target" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN "parent_estimate_id" varchar;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "contract_price" integer;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "percent_complete" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "schedule_items" ADD COLUMN "team_id" varchar;--> statement-breakpoint
ALTER TABLE "schedule_items" ADD COLUMN "team_name" text;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "is_online" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "business_assign_color" text;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "business_assign_status" text;--> statement-breakpoint
ALTER TABLE "scope_items" ADD COLUMN "is_todo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scope_stages" ADD COLUMN "is_completed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scope_stages" ADD COLUMN "completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "scope_stages" ADD COLUMN "completed_by" varchar;--> statement-breakpoint
ALTER TABLE "scope_stages" ADD COLUMN "attachments" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "system_configuration" ADD COLUMN "client_invoice_default_xero_account" text;--> statement-breakpoint
ALTER TABLE "task_templates" ADD COLUMN "scope_stage_id" varchar;--> statement-breakpoint
ALTER TABLE "variation_items" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "variation_items" ADD COLUMN "item_type" text DEFAULT 'cost_line' NOT NULL;--> statement-breakpoint
ALTER TABLE "variation_items" ADD COLUMN "type" text DEFAULT 'Material' NOT NULL;--> statement-breakpoint
ALTER TABLE "variation_items" ADD COLUMN "unit_type" text DEFAULT 'each' NOT NULL;--> statement-breakpoint
ALTER TABLE "variation_items" ADD COLUMN "unit_cost_ex_tax" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "variation_items" ADD COLUMN "markup_percent" integer;--> statement-breakpoint
ALTER TABLE "variation_items" ADD COLUMN "cost_code" text;--> statement-breakpoint
ALTER TABLE "variation_items" ADD COLUMN "show_in_pdf" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "variations" ADD COLUMN "is_seen" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "variations" ADD COLUMN "terms_and_conditions" text;--> statement-breakpoint
ALTER TABLE "variations" ADD COLUMN "attachments" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "variations" ADD COLUMN "portal_token" text;--> statement-breakpoint
ALTER TABLE "variations" ADD COLUMN "portal_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "variations" ADD COLUMN "client_signed_name" text;--> statement-breakpoint
ALTER TABLE "variations" ADD COLUMN "client_signed_date" timestamp;--> statement-breakpoint
ALTER TABLE "variations" ADD COLUMN "builder_signed_name" text;--> statement-breakpoint
ALTER TABLE "variations" ADD COLUMN "builder_signed_date" timestamp;--> statement-breakpoint
ALTER TABLE "company_oh_settings" ADD CONSTRAINT "company_oh_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "docs" ADD CONSTRAINT "docs_folder_id_doc_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."doc_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "docs" ADD CONSTRAINT "docs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enote_attachments" ADD CONSTRAINT "enote_attachments_enote_id_estimate_enotes_id_fk" FOREIGN KEY ("enote_id") REFERENCES "public"."estimate_enotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enote_template_sets" ADD CONSTRAINT "enote_template_sets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enote_templates" ADD CONSTRAINT "enote_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_enotes" ADD CONSTRAINT "estimate_enotes_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hbcf_projects" ADD CONSTRAINT "hbcf_projects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hbcf_projects" ADD CONSTRAINT "hbcf_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_selections" ADD CONSTRAINT "invoice_selections_invoice_id_client_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."client_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_selections" ADD CONSTRAINT "invoice_selections_selection_option_id_selection_options_id_fk" FOREIGN KEY ("selection_option_id") REFERENCES "public"."selection_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labour_estimate_categories" ADD CONSTRAINT "labour_estimate_categories_labour_estimate_id_labour_estimates_id_fk" FOREIGN KEY ("labour_estimate_id") REFERENCES "public"."labour_estimates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labour_estimate_tasks" ADD CONSTRAINT "labour_estimate_tasks_category_id_labour_estimate_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."labour_estimate_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labour_estimates" ADD CONSTRAINT "labour_estimates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labour_estimates" ADD CONSTRAINT "labour_estimates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labour_task_templates" ADD CONSTRAINT "labour_task_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oh_pipeline_jobs" ADD CONSTRAINT "oh_pipeline_jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overhead_categories" ADD CONSTRAINT "overhead_categories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overhead_forecast_overrides" ADD CONSTRAINT "overhead_forecast_overrides_item_id_overhead_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."overhead_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overhead_items" ADD CONSTRAINT "overhead_items_category_id_overhead_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."overhead_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overhead_month_actuals" ADD CONSTRAINT "overhead_month_actuals_item_id_overhead_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."overhead_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overhead_month_status" ADD CONSTRAINT "overhead_month_status_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overhead_month_status" ADD CONSTRAINT "overhead_month_status_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scope_item_type_definitions" ADD CONSTRAINT "scope_item_type_definitions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variation_bills" ADD CONSTRAINT "variation_bills_variation_id_variations_id_fk" FOREIGN KEY ("variation_id") REFERENCES "public"."variations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variation_bills" ADD CONSTRAINT "variation_bills_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variation_timesheets" ADD CONSTRAINT "variation_timesheets_variation_id_variations_id_fk" FOREIGN KEY ("variation_id") REFERENCES "public"."variations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "overhead_forecast_overrides_item_year_month_unique" ON "overhead_forecast_overrides" USING btree ("item_id","year","month");--> statement-breakpoint
CREATE UNIQUE INDEX "overhead_month_actuals_item_year_month_unique" ON "overhead_month_actuals" USING btree ("item_id","year","month");--> statement-breakpoint
CREATE UNIQUE INDEX "overhead_month_status_company_year_month_unique" ON "overhead_month_status" USING btree ("company_id","year","month");--> statement-breakpoint
ALTER TABLE "checklist_instances" ADD CONSTRAINT "checklist_instances_scope_stage_id_scope_stages_id_fk" FOREIGN KEY ("scope_stage_id") REFERENCES "public"."scope_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_invoice_items" ADD CONSTRAINT "client_invoice_items_cost_code_id_cost_codes_id_fk" FOREIGN KEY ("cost_code_id") REFERENCES "public"."cost_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_parent_estimate_id_estimates_id_fk" FOREIGN KEY ("parent_estimate_id") REFERENCES "public"."estimates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_items" ADD CONSTRAINT "schedule_items_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scope_stages" ADD CONSTRAINT "scope_stages_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_scope_stage_id_scope_stages_id_fk" FOREIGN KEY ("scope_stage_id") REFERENCES "public"."scope_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variations" ADD CONSTRAINT "variations_portal_token_unique" UNIQUE("portal_token");