# Morada — Consolidated Plan

**Created:** 16 July 2026. Single source of truth for outstanding work, ordered by urgency.
Detail lives in [MOBILE_APP_AUDIT.md](MOBILE_APP_AUDIT.md) (the ~90-finding bug audit, now fixed) and [MOBILE_UX_ROADMAP.md](MOBILE_UX_ROADMAP.md) (structure/UX assessment + Messages & Notes plans). This file is the running order.

**Done so far:** mobile bug audit (all ~90 findings), plum rebrand, interaction kit (Sheet/Toast/haptics/Skeleton/PressableScale/ProgressRing), Dashboard rebuild, Tasks pilot, Calendar rebuild (phases 1–3), More panel rebuild, Messages phases 1–3 + client-facing signals, app icon, dark-mode contrast fix (⚠️ stranded — see S0).

---

## Stage 0 — Rescue & housekeeping (no decisions, ~30 min)

| # | Item | Why |
|---|---|---|
| 0.1 | **Cherry-pick `50b6251e` onto `main`** | The dark-mode contrast fix is stranded on the local, unpushed `fix/dark-mode-status-contrast`, which also carries two duplicate commits another session re-made on `fix/api-no-store`. Cherry-pick the one commit; don't merge the branch (it would duplicate history). Then delete the branch. |
| 0.2 | **Delete the 66 `" 2"` duplicate files** | iCloud sync conflicts. Byte-identical copies of real files (incl. `Sheet 2.tsx`, `mentions 2.ts`, `weather 2.ts`). Untracked, but easy to commit by accident and confusing to build on. |
| 0.3 | **Move the repo out of iCloud Drive** | `~/Documents` is iCloud-synced. Those duplicates are iCloud fighting the working tree. When it does that inside `.git`, you lose history rather than a file. `mv` to `~/Developer`. **Highest-leverage item here.** |
| 0.4 | **Commit convention** | Commit to `main` like the other sessions, not feature branches — S0.1 exists because I branched. |

## Stage 1 — Stop active harm (no decisions, ~half a day)

Each is independently verifiable. Nothing new should be built until these land.

| # | Item | Layer | Detail |
|---|---|---|---|
| 1.1 | **Install `@tiptap/extension-image` on web** | client | **Live data loss.** Not installed at all → ProseMirror drops `<img>` on parse → one keystroke on a web note permanently deletes every site photo taken on mobile. Upload infra already exists on both platforms; web just never wired it. Highest value-to-effort item in the codebase. |
| 1.2 | **Sanitise note HTML on render** | client (+ server hardening) | Stored XSS: `Memos.tsx:440` and `UserNotes.tsx:270` render note `contentHtml` via `dangerouslySetInnerHTML` with no sanitisation, and `POST /api/notes` accepts arbitrary HTML. A crafted note runs code in every colleague's browser. |
| 1.3 | **Make mobile's note parser non-destructive** | client | `stripTags` (`NoteEditorScreen.tsx:260-270`) removes every inline tag; autosave then persists the loss. Opening a web note on a phone destroys bold/italic/links/code/quotes and downgrades H3→H2. Preserve what it can't model rather than deleting it. |
| 1.4 | **Fix `GET /api/channels/:id/members` authz** | server | `routes.ts:30086` has only `requireAuth` — no company scoping, no membership check. Any authenticated user can enumerate any channel's members **across tenants**. Siblings `/pinned` and `/reactions` already do it correctly; mirror them. |

## Stage 2 — Deploy & release (unblocks features already built)

| # | Item | Notes |
|---|---|---|
| 2.1 | **Deploy the server** | Weather endpoint, `/api/presence`, read-receipt emits, and the mobile socket-auth handshake are all **local-only**. Until deployed: no weather line on the phone, no presence, and real-time messaging won't work against production. |
| 2.2 | **Native build (EAS)** | The new app icon only appears via a native build — icons don't ship OTA. Bump `version`/`buildNumber` in `app.config.js`. Also enables push notifications, which Expo Go can't do. |
| 2.3 | **Migrate off `expo-av`** | Deprecated and slated for removal; voice notes + audio playback depend on it. → `expo-audio` / `expo-video`. |

## Stage 3 — Decisions needed from Jed (blocking Stage 4)

| # | Question | Options |
|---|---|---|
| 3.1 | **Note visibility semantics** | The picker (private/team_only/everyone/project_team) is **decorative** — nothing filters by it, so "Private" notes are readable by everyone in the company. Decide: does `private` mean owner-only, or owner + assignees? Does `project_team` require a membership check? |
| 3.2 | **Visibility data migration** | Stored values are meaningless (mobile defaults to `private`, web to `team_only`, neither enforced). Reset everything to `team_only` and let people re-mark, or trust what's there? Enforcing without deciding will silently hide notes and look like data loss. |
| 3.3 | **How far do Notes go?** | (a) Project notes on mobile + tidy → ~1 session, safe on HTML once Stage 1 lands. (b) Notion-grade → JSON block document **first**. Recommendation: (b), if serious. |

## Stage 4 — Notes elevation (gated on 3.3)

If (a): 4.2 + 4.7 only. If (b): the whole stage, in order.

| # | Item | Layer | Notes |
|---|---|---|---|
| 4.1 | **JSON block document as canonical** (`contentJson`; HTML/text derived for search+previews) | **schema + server + both clients** | The keystone. HTML is the wrong wire format: two divergent parsers, each mutating on read, each deleting what the other doesn't understand. Every item below is cheap on top and unsafe without. Clients must **preserve unknown blocks**, not discard them. |
| 4.2 | **Project notes on mobile** | client only | `GET /api/notes?projectId=X` already exists. Dual-register Notes/NoteEditor in `ProjectsStack`; add a tile to `ProjectDetailScreen` `categoryTiles:265`; make the list param-aware; **thread `projectId`+`scope` into NoteEditor's auto-create** or notes silently become personal and vanish from the project. Filter by `projectId` only, never `scope`. Grouped "My notes / Project notes" view (agreed). |
| 4.3 | **Checkbox → real task** | server + schema | **The killer feature.** A site-note checklist where each box becomes assignable, scheduled work — something Notion can't do because it doesn't know what a project is. Needs stable block ids (4.1). |
| 4.4 | **@-mentions of people/projects/tasks** | client + small server | Messaging's mention infra is ~80% reusable (`messages/mentions.ts`); note-mention notifications already wired (`routes.ts:1659`). Web must use a TipTap Mention **node**, not regex markup. |
| 4.5 | **Full-text search** | server + schema | Postgres `tsvector` + GIN. Today's search only searches notes already loaded in the client — a toy. |
| 4.6 | **Web: photo grid + lightbox; mobile: slash menu, markdown shortcuts, block drag-reorder** | client | Mobile currently can't reorder at all, and `# ` means different things on each platform. |
| 4.7 | **Mobile notes → UI kit** | client | The last screens on the old patterns (`Alert.alert` instead of `Sheet`, no `Toast`). |
| 4.8 | **Server-side pin limit** | server | 3-pin max is client-side only; mobile can exceed it and web then shows 4+. Enforce or drop the rule. |
| 4.9 | Web notes responsive; drag-to-group (`/api/note-groups/reorder` exists, unused); decide on `noteTemplateFields` (built, unused) | client | Responsiveness matters for the Capacitor build. |

## Stage 5 — Finish the app to the standard already set

| # | Item | Notes |
|---|---|---|
| 5.1 | **Kit rollout to remaining screens** | Projects, Timesheets, Site Diary, Schedule, Checklists, Scope, Notes. ~135 system alerts and ~35 hand-rolled modals remain outside the rebuilt screens. |
| 5.2 | **Decompose the monoliths** | Site Diary 3,023 lines; Schedule 2,214; Timesheets 2,088. Target <500 via the kit. |
| 5.3 | **Wire failures into Sentry** | From the original audit's improvement list, never done. The SDK is integrated but every catch swallows — **you are currently blind to field errors**. |
| 5.4 | **Wire CustomizeHome prefs into the dashboard** | That screen saves preferences the dashboard never reads — it's decorative today. |
| 5.5 | **Contrast leftovers** | Web `--tab-active` 3.74:1 on dark sidebar; **light-mode** warning 3.48:1 / info 3.80:1 also under 4.5. |
| 5.6 | Timesheet multi-split editing (mobile is single-split); TaskComments new-mentions-during-edit stay plain text | Known limitations from earlier phases. |

## Stage 6 — Signature features (the "top-tier" moves)

| # | Item | Notes |
|---|---|---|
| 6.1 | **Global quick-add** | A "+" from anywhere → Task / Diary / Photo / Note / Timesheet, pre-filled with project context. Two-tap capture for field workers. |
| 6.2 | **Global search** | One surface over projects, tasks, diary, notes, messages. Needs the same server search work as 4.5 — **do them together**. |
| 6.3 | **Swipe actions + long-press menus everywhere** | Pattern already proven in Messages. |
| 6.4 | **Calendar phase 4** | Drag-to-reschedule (lane math already computes positions), jump-to-date, Google sync status. |
| 6.5 | **Onboarding, home-screen widgets, Live Activity for running timers** | Widgets/Live Activity need native builds; the timer Live Activity is the most "pro" feature available for a field app. |

## Declined (for now)

- **Real-time collaborative editing (CRDT/Yjs)** — very large; notes aren't co-edited live in this domain, and the 1500ms autosave already covers the real conflict rate.
- **Inline tables / databases in notes** — competes with estimates/allowances tables, which are already better at it.
- **Per-channel custom icons/colours** — needs schema + pickers on both platforms; low value next to the client-facing signal already built.

---

## Recommended running order

**S0 → S1 → S2** back-to-back (nothing needs a decision; ~1 day). Then **S3** (your call) unblocks **S4**. **S5** can run in parallel with S4 since it touches different screens. **S6** last — it's the most visible but assumes the foundation.

**Do not build on top of Stage 1.** Every item in it exists because features were layered onto an unsafe foundation; adding more before fixing them just makes more to unpick.
