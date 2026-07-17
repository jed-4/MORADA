-- PS timesheet allocations bill the client at a CHARGE rate, editable per row.
-- Store the charge rate used (auto-filled from users.charge_rate, overridable)
-- and a snapshot of the cost rate so margin (charge − cost) is recoverable.
-- amount stays the allocation total in ex-GST cents = hours × charge_rate_cents.
ALTER TABLE "timesheet_allowances" ADD COLUMN IF NOT EXISTS "charge_rate_cents" integer;
ALTER TABLE "timesheet_allowances" ADD COLUMN IF NOT EXISTS "cost_rate_cents" integer;
