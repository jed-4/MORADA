# Gotchas (read before coding)

1. **Tabular figures.** Inter's default digits are proportional, so columns of numbers wobble. Apply `fontVariant: ['tabular-nums']` (`theme.tabular`) to every price, hour total, count column, time, and date in a column: Projects prices, Labour hours ("1.8 / 18h", "47h"), Timesheets, calendar times, Gantt dates, badges. Check it works on Android with the loaded Inter files. If not, use the Inter font files that include the `tnum` feature (Google Fonts static files do).

2. **Caret glyph doesn't render in Inter.** Triangles ▸ ▾ and some arrows fall back to a system font or show tofu. Use icons for every caret and chevron (Lucide ChevronDown / ChevronRight 12 dp `muted` after group titles; ChevronRight 16 for "open" affordances). The "›" in short labels like "25 ›" is fine (it's a normal glyph). Don't use ▾ in "All types ▾". Use an icon.

3. **Product images fail to load in the live app.** Selections thumbnails and the detail hero show empty lilac boxes today. **Investigate before styling:** log the actual image URLs; check for relative vs absolute URLs, expired signed URLs (S3/Supabase/Firebase tokens), missing auth headers (RN `<Image>` doesn't send cookies/bearer tokens; use `source={{ uri, headers }}` or a signed URL), http vs https (iOS ATS / Android cleartext), CORS isn't the issue in native but is on web, wrong field name in the API mapping, cache keys (expo-image `cachePolicy`, stale cached 403s), and very large originals. Report the root cause to Jed, then build `SmartImage` (expo-image preferred) with a loading state and the **grey fallback tile** (`greyFill` + 18 dp Image icon `faint`) for missing or failed images. The fallback is a safety net. Fixing the loading bug is still needed.

4. **All Figma data is dummy.** Names (Client A, Site Lead A, Sam, Supplier D), emails, phones, addresses, prices, counts, dates, weather and photos are placeholders. Never copy them into code. Fixed UI labels are fine.

5. **Variations and Documents are not designed yet.** Match the system (BUILD-SPEC §3 and §6) using shared components. Don't invent a new look.

6. **Figma variables are out of date.** The local variables in the Figma file (`bg/app #F6F3EE`, `text/primary #2B2724`, `border/default #E6E1DA` …) are the OLD palette. Use `tokens/theme.ts`, which was measured from the approved frames. If you use the Figma MCP, trust frame fills and text colours over variables.

7. **Primary text colour.** The approved frames use `#1F1D1B` for titles and most text (`colors.text`). `#2F2B27` (`colors.textBody`) appears on calendar event titles and chat/comment bodies. Both are in the theme; don't merge them without asking Jed.

8. **Status bar / frame sizes.** Figma frames include a fake 50 dp status bar and a fixed 83 dp tab bar (with 28 dp bottom padding for the home indicator). Use real safe-area insets, not those fixed numbers.

9. **FAB overlap.** The FAB floats over content. Add bottom padding (≈ 84 dp + tab bar) to every scroll view on screens with a FAB so the last row and its status are never hidden.

10. **Text wrapping.** Task titles, checklist items, scope lines, defect titles and product names must wrap (2+ lines). Don't truncate to one line with an ellipsis unless the spec says "1 line" (message previews, diary preview is 2 lines).

11. **Shadows.** Only the FAB and bottom sheets have shadows. Cards are border-only. On Android, `elevation` on cards adds an unwanted shadow; don't set it.

12. **Hairline borders.** Use 1 dp (`StyleSheet.hairlineWidth` looks too faint on high-density screens against `#EBE8E3`). Dividers between rows go inside the card's 14 dp horizontal padding (they don't touch the card edge).

13. **Calendar tints.** Week/all-day blocks use `projectTint(colour)` (16% over `bg`); list-view blocks sit on white cards, so use `projectTint(colour, 0.16, colors.surface)`. Project colours come from project data; `colors.projectFallback` is only a fallback.

14. **Font weights on Android.** `fontWeight: '600'` won't pick the SemiBold file with custom fonts. Use the explicit family (`fonts.semibold`) from `type.*` styles.

15. **Collapsed state.** Group/section collapsed state should persist per screen for the session (and per project where it makes sense, e.g. Scope categories), so returning to a screen doesn't re-expand everything.

16. **Duo detection.** Use `useWindowDimensions` (updates on fold/unfold), not `Dimensions.get` at module load. Breakpoint: width ≥ 700 and landscape.
