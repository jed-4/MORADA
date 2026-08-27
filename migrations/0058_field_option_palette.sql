-- Move field_options.color onto the Morada palette.
--
-- These values were stock Tailwind hexes (blue-500, gray-500, amber-200 …) seeded
-- by getRequiredOptionsForCategory in server/storage.ts. They predate every
-- palette the app has had and match none of them, so every status chip in the
-- app renders in colours that belong to no design system. The seed itself was
-- fixed in the same change; this brings existing rows along.
--
-- ─── The mapping is hand-authored, and that is the point ─────────────────────
-- An automatic nearest-colour pass (CIE Lab) over the stored values collapses
-- 26 distinct colours onto 13 — five blues and purples all resolve to Lavender,
-- both greys to Soft Purple. Options a user set to different colours would then
-- render identically, which defeats the only reason the column exists. This
-- mapping instead preserves hue family AND relative weight:
--     Urgent/Critical stay darker than High/On Hold  (Dusty Red vs Coral)
--     the pale "Awaiting/FDP" pre-con run stays paler than "In Progress"
--     Ensuite/Tiling stay deeper than Plumbing/Meeting  (Deep Teal vs Teal)
-- It was verified to produce zero within-category merges: no two options that
-- were distinguishable inside one category become the same colour.
--
-- ─── Only untouched seed rows are updated ────────────────────────────────────
-- Each UPDATE is guarded on the CURRENT value, so a colour anyone has since
-- customised to something outside this list is left exactly as it is. On dev
-- all 617 rows across 6 companies still hold their seed value and no two
-- companies disagree on any option, so nothing had been customised there —
-- but prod may differ, and this must not overwrite a deliberate choice.
--
-- Reversible: the reverse mapping is 1:1 except that Chalk covers two former
-- greys and Mint two former greens, so a rollback would need those two by
-- category. Take a backup of (id, color) before running if that matters:
--   CREATE TABLE field_options_color_backup_0058 AS
--     SELECT id, color FROM field_options WHERE color IS NOT NULL;
--
-- Note: dev already carries a field_options_color_backup_0055 table, created
-- when this migration was first numbered 0055. It has been renumbered twice
-- since, as main landed its own 0054/0055 and then 0056. The table's contents
-- are unchanged — it is the pre-migration snapshot of the original 617 rows.

BEGIN;

-- neutrals
UPDATE field_options SET color = '#8A8680' WHERE upper(color) = '#6B7280'; -- gray-500  → Stone
UPDATE field_options SET color = '#D8D7D4' WHERE upper(color) = '#9CA3AF'; -- gray-400  → Chalk
UPDATE field_options SET color = '#D8D7D4' WHERE upper(color) = '#94A3B8'; -- slate-400 → Chalk

-- warm / in-progress
UPDATE field_options SET color = '#F0B964' WHERE upper(color) = '#F59E0B'; -- amber-500 → Amber
UPDATE field_options SET color = '#EAD070' WHERE upper(color) = '#FDE68A'; -- amber-200 → Soft Yellow
UPDATE field_options SET color = '#C89050' WHERE upper(color) = '#D97706'; -- amber-600 → Ochre

-- greens / done
UPDATE field_options SET color = '#82C8A2' WHERE upper(color) = '#10B981'; -- emerald-500 → Sage
UPDATE field_options SET color = '#68B088' WHERE upper(color) = '#059669'; -- emerald-600 → Forest
UPDATE field_options SET color = '#96D4A8' WHERE upper(color) = '#86EFAC'; -- green-300   → Mint
UPDATE field_options SET color = '#96D4A8' WHERE upper(color) = '#65A30D'; -- lime-600    → Mint

-- reds — Dusty Red is the darker of the two, so Urgent/Critical stay stronger
UPDATE field_options SET color = '#DA988A' WHERE upper(color) = '#EF4444'; -- red-500 → Coral
UPDATE field_options SET color = '#C87878' WHERE upper(color) = '#DC2626'; -- red-600 → Dusty Red

-- blues / cyans
UPDATE field_options SET color = '#7890C8' WHERE upper(color) = '#3B82F6'; -- blue-500 → Cornflower
UPDATE field_options SET color = '#80B8D8' WHERE upper(color) = '#93C5FD'; -- blue-300 → Sky
UPDATE field_options SET color = '#70CAD0' WHERE upper(color) = '#06B6D4'; -- cyan-500 → Teal
UPDATE field_options SET color = '#58A8B0' WHERE upper(color) = '#0891B2'; -- cyan-600 → Deep Teal

-- purples / pink
UPDATE field_options SET color = '#8888C4' WHERE upper(color) = '#8B5CF6'; -- violet-500 → Periwinkle
UPDATE field_options SET color = '#A890D4' WHERE upper(color) = '#7C3AED'; -- violet-600 → Lavender
UPDATE field_options SET color = '#D484A0' WHERE upper(color) = '#EC4899'; -- pink-500   → Mauve Rose

COMMIT;
