-- Add a due date to individual checklists.
-- Terminology: checklist_instances = "Checklist Group", checklist_instance_groups = "Checklist".
ALTER TABLE checklist_instance_groups ADD COLUMN IF NOT EXISTS due_date timestamp;
