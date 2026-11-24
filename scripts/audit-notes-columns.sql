-- Read-only. Lists every column shared/schema.ts defines on `notes` and
-- `user_invitations` that this database does not have. Empty result = no drift.
-- Goes with migrations/0141_invitation_contact_and_notes_drift.sql.
--   psql "$PROD_URL" -f scripts/audit-notes-columns.sql
WITH expected(table_name, column_name) AS (
  SELECT 'notes', unnest(ARRAY[
    'id','company_id','title','content','content_html','content_text','category','priority',
    'author','owner_id','owner_name','visibility','pinned','custom_fields','project_id','scope',
    'type','status','assignee_id','assignee_name','assignee_ids','assignee_names','due_date',
    'start_time','end_time','completed_at','tags','labels','checklist','color','parent_task_id',
    'subtask_order','is_recurring','recurring_type','recurring_interval','recurring_days',
    'include_saturday','include_sunday','recurring_start_date','recurring_end_date',
    'last_recurring_date','template_id','occurrence_date','is_modified','reference_type',
    'reference_id','task_context_type','task_context_id','group_id','archived_at',
    'archived_by_id','is_private','checklist_instance_id','checklist_instance_name',
    'created_at','updated_at'])
  UNION ALL
  SELECT 'user_invitations', unnest(ARRAY[
    'id','company_id','email','first_name','last_name','company','phone','user_category',
    'role_id','project_ids','contact_id','invited_by','invite_token','expires_at',
    'accepted_at','created_user_id','status','created_at','updated_at'])
)
SELECT e.table_name, e.column_name AS missing_column
FROM expected e
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public' AND c.table_name = e.table_name AND c.column_name = e.column_name
WHERE c.column_name IS NULL
ORDER BY 1, 2;
