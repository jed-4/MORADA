-- Operations Phase 5: workflows that actually fire.
--
-- workflow_templates gains the engine's shape (shared/workflows.ts): a trigger
-- config and an ordered list of actions. The legacy columns (task_template_ids,
-- task_configs, trigger_stage, trigger_status) stay and are still read when a
-- row has no actions, so nothing saved before this changes meaning.
--
-- workflow_runs is the run log. (workflow_id, event_key) is unique: the engine
-- claims a run row before doing anything, so one event fires a workflow once.
--
-- Additive and idempotent.

ALTER TABLE workflow_templates ADD COLUMN IF NOT EXISTS trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE workflow_templates ADD COLUMN IF NOT EXISTS actions jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS workflow_templates_company_trigger_idx ON workflow_templates (company_id, trigger_type) WHERE is_active;

CREATE TABLE IF NOT EXISTS workflow_runs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workflow_id varchar NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  trigger_type text NOT NULL,
  project_id varchar REFERENCES projects(id) ON DELETE SET NULL,
  summary text,
  status text NOT NULL DEFAULT 'running',
  result jsonb,
  fired_by_id varchar REFERENCES users(id) ON DELETE SET NULL,
  fired_by_name text,
  created_at timestamp NOT NULL DEFAULT now(),
  finished_at timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS workflow_runs_workflow_event_uq ON workflow_runs (workflow_id, event_key);
CREATE INDEX IF NOT EXISTS workflow_runs_company_created_idx ON workflow_runs (company_id, created_at);
