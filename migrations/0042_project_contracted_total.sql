-- Freeze the contract sum once a job is contracted.
--
-- Business rule: once a job is contracted, the contract sum must not change —
-- only an approved variation may change what the client owes.
--
-- Morada broke this by recomputing the "original contract" live from the
-- selected estimate on every read (shared/projectMetrics.ts), so any edit to a
-- contracted estimate silently moved the client's number. The sharpest symptom
-- is a DOUBLE-CREDIT: excluding an allowance shrinks the live estimate (credit
-- #1, silent, no paperwork) and the deduction variation raised for it credits
-- the same amount again (credit #2).
--
-- Why new columns rather than repurposing projects.contract_price:
--   1. contract_price is ALSO stamped by stage-1 "Approve", where tracking the
--      estimate live is the correct, deliberate behaviour. Redefining it would
--      change that.
--   2. Every read site treats contract_price as a stale-cache fallback
--      (`?? project.contractPrice`); redefining it silently changes ~8 of them.
--   3. contract_price is inc-GST only. The Budget margin bars, Project Settings
--      and the Business Metrics table all need a frozen EX-GST figure, and
--      deriving ex from inc by /1.1 reintroduces a rounding error on exactly
--      the number this change exists to make exact.
--
-- GST is applied once at the estimate subtotal (shared/pricing.ts), so
-- gst = inc - ex holds exactly and needs no third column.
--
-- contracted_at IS NOT NULL is the single "this job is frozen" predicate. It
-- lives on projects (not just estimates.contracted_at) so list views holding
-- only project rows — the board, the project cards — can tell without a join.
--
-- COLUMNS ONLY, no data. The correct value is whatever computeEstimateSummary
-- returns (per-line markup -> project markup -> GST, with round2 at each step),
-- which is not reproducible in SQL without forking the pricing rules. The
-- backfill runs as an idempotent startup healer (backfillContractedTotals in
-- server/storage.ts) that fills these from the CURRENT live total for already
-- contracted jobs — so there is zero visible change on deploy; the figures
-- simply stop moving afterwards.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS contracted_total_ex_gst_cents INTEGER;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS contracted_total_inc_gst_cents INTEGER;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS contracted_at TIMESTAMP;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS contracted_estimate_id VARCHAR;
