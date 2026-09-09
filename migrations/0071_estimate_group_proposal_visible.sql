-- Estimate groups: hide a whole section from the client's proposal.
--
-- Line items already had this (estimate_items.proposal_visible, the eye toggle
-- in the grid). Groups did not, so hiding a section meant toggling every line
-- inside it one at a time — and re-hiding any line added afterwards.
--
-- Defaults to true so every existing group keeps printing exactly as it does
-- today. Hiding is opt-in, per group, and applies to the group's descendants:
-- the tree is resolved in shared/proposalTotals.ts, not here.
ALTER TABLE estimate_groups
  ADD COLUMN IF NOT EXISTS proposal_visible boolean NOT NULL DEFAULT true;
