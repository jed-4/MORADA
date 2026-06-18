---
name: DataTable sticky column hides row banding
description: The shared DataTable's sticky first column paints its own opaque background; row-level zebra/category banding needs the --dt-row-bg CSS var to show through.
---

Rule: The shared `client/src/components/data-table/DataTable.tsx` renders the first
column as a sticky cell with its own opaque background. Any per-row background
(zebra striping, category tint, status highlight) applied to the `<tr>` will be
COVERED by that sticky cell unless the color is routed through the `--dt-row-bg`
CSS variable.

How it works: DataTable's sticky `<td>` background is
`var(--dt-row-bg, hsl(var(--background)))`. Set `--dt-row-bg` on the row via the
`rowStyle?: (row, index) => React.CSSProperties` prop. For a tinted row,
composite the tint OVER the card color so the sticky cell stays opaque during
horizontal scroll, e.g.
`--dt-row-bg: linear-gradient(<tint>,<tint>), hsl(var(--card))`.
Untinted rows should set `--dt-row-bg: hsl(var(--card))` (or omit `rowStyle` to
keep the unchanged default fallback).

**Why:** A plain `backgroundColor` on the `<tr>` looks right until you scroll
horizontally — the frozen first column shows the wrong (default) background and
the banding visibly breaks at the sticky column.

**How to apply:** When styling row backgrounds in any DataTable instance, pass
`rowStyle` and set `--dt-row-bg`; don't rely on `rowClassName` background
utilities alone. Financial-table chrome (banding, totals bar, legends, palette,
theme detection) is centralized in one module — edit styling there, not per page.
Note: Budget is a DataTable (uses `--dt-row-bg`) while Monthly Actuals is a
custom div-grid that can't use that contract, so they share theme tokens + the
module home but keep separate banding mechanisms and intentionally different
tint values; don't "unify" their values expecting no visual change.

Dark-mode tinting note: dark theme has `--muted ≈ --card`, so muted-based tints
disappear. Use foreground-alpha overlays (`hsl(var(--foreground)/0.05..0.09)`)
for banding in dark mode and muted-based tints
(`hsl(var(--muted)/0.5..0.85)`) for light mode. Detect theme with a local
`useIsDark()` MutationObserver on the documentElement `class`.
