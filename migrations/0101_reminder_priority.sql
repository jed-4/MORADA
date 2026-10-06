-- Reminders: store the priority the UI has always collected.
--
-- SetReminderDialog and the User Workspace reminder form both offer a
-- low/normal/high priority, UserReminders colours the row by it and flags the
-- high ones — but there was no column, so createInsertSchema stripped it on the
-- way in and every reminder read back as undefined. The control was decorative.
--
-- Additive and idempotent: existing rows take 'normal', which is what the UI
-- already falls back to when the value is missing.
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal';
