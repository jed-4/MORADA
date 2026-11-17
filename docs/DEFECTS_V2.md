# Defects v2 — stage 1 contract (server ⇄ web ⇄ mobile)

Jed approved 2026-11-18. Built for many companies, big teams, many jobs.
Stage 1 = foundations + phone capture. Stage 2 = trades (per-trade-per-job
link, daily digest, overdue reminders). Stage 3 = handover PDF, client
sign-off, backcharges. **Only stage 1 is in scope now.**

## Workflow (fixed for every company)

`stage` (canonical, drives all logic):

| stage | meaning | label (default) |
|---|---|---|
| `open` | raised, not sent | Open |
| `sent` | sent to the responsible trade | Sent to trade |
| `accepted` | trade accepted / working on it | Trade accepted |
| `fixed` | trade (or crew) says fixed — awaiting check | Fixed – to check |
| `closed` | owner checked and closed | Closed |
| `rejected` | check failed, back to trade (behaves like `sent`) | Rejected |

Allowed transitions (anything else → 400):
- open → sent, fixed, closed
- sent → accepted, fixed, open
- accepted → fixed, open
- fixed → closed (needs `close`), rejected (needs a `note`)
- rejected → accepted, fixed
- closed → open (reopen; needs `close`)

Legacy `status` column stays and is kept in sync for old reports:
open→`open`, sent/accepted/rejected→`in_progress`, fixed→`resolved`,
closed→`closed`. Backfill `stage` from `status` the reverse way
(unknown custom keys → `open`).

## Data (migration — number: next free after 0130 at merge time; Defects takes the FIRST free number)

`defects` add:
- `company_id varchar` (backfill from projects; index `(company_id, project_id, stage)`)
- `number integer` — per project, `unique(project_id, number)`, backfill in `created_at` order. Shown as `D-014`.
- `stage text not null default 'open'`
- `job_stage text not null default 'construction'` — `construction | pre_handover | handover | dlp | warranty`
- `owner_user_id varchar` + `owner_name text` — internal person responsible
- `location_id varchar` → `project_locations.id` (keep text `location` as display fallback; when location_id is set, `location` = its full path text)
- `client_request_id varchar` — `unique(project_id, client_request_id)` for offline idempotency
- `closed_at timestamp`, `closed_by varchar`, `closed_by_name text`
- attachments json items gain optional `kind: 'before' | 'after' | 'trade'`

New tables:
- `project_locations(id, company_id, project_id, parent_id null, name, sort_order, created_at)` — tree, e.g. Level 1 › Kitchen › Island
- `defect_watchers(defect_id, user_id, created_at)` PK (defect_id,user_id)
- `defect_events(id, company_id, defect_id, type, actor_user_id, actor_name, data jsonb, created_at)` — type: `created | updated | transition | comment | photo | watcher_added | watcher_removed`. `data` for transition: `{from,to,note}`; comment: `{text, mentions: userId[]}`; updated: `{fields: {name: [old,new]}}`.

Default due date by job_stage when not given: construction 14d, pre_handover 7d, handover 10d, dlp 28d, warranty 28d.

## Permission

`projects.defects` with actions `view, add, edit, close, delete`.
Seed (insert-only seeder — see memory note): existing team roles get view/add/edit/close; admin-like roles all; delete only admin-like / Owner / GM. Clients and suppliers: none.
Every defect route: `requireAuth` + team member + permission + `enforceProjectCompany` + the user's project access (same rule the rest of the app uses).

## API (JSON; money: none)

Defect object (list & detail):
```
{ id, projectId, projectName, number, ref: "D-014", title, description,
  stage, jobStage, priority, trade, location, locationId,
  assignedContactId, assignedContactName,          // responsible trade
  ownerUserId, ownerName,
  dueDate, dateIdentified, closedAt, closedByName,
  attachments: [{url,name,type,kind}],
  createdBy, createdByName, createdAt, updatedAt,
  overdue: boolean, watcherCount: number, isWatching: boolean }
```
Detail adds `events: DefectEvent[]` (newest last) and `watchers: [{userId,name}]`.

- `GET /api/projects/:projectId/defects?stage=a,b&jobStage=&ownerUserId=&trade=&locationId=&q=&overdue=1&limit=50&cursor=` → `{ items, nextCursor, counts: {open,sent,accepted,fixed,closed,rejected} }`
- `GET /api/defects/mine?stage=…` → same shape; defects where I'm owner, creator, or watcher, across projects I can access
- `GET /api/defects/:id` → detail
- `POST /api/projects/:projectId/defects` body: defect fields + optional `clientRequestId`, `photos: [{url,name,type,kind}]`. Same clientRequestId again → 200 with the existing defect (no duplicate). Creator auto-watches; owner auto-watches.
- `PATCH /api/defects/:id` — edit fields (not stage)
- `POST /api/defects/:id/transition` `{ to, note?, photos? }` → updated detail; event logged; legacy `status` synced; `closed_*` set/cleared
- `POST /api/defects/:id/comments` `{ text, mentions?: userId[] }`
- `POST /api/defects/:id/photos` `{ photos: [{url,name,type,kind}] }`
- `POST /api/defects/:id/watch` / `DELETE /api/defects/:id/watch` (self)
- `DELETE /api/defects/:id` (delete permission)
- `GET /api/projects/:projectId/locations` → flat list `{id,parentId,name,path,sortOrder}`; `POST` `{name,parentId?}`; `PATCH /api/project-locations/:id`; `DELETE` (only if unused)
- Old `/api/defects…` routes used by the web keep working (now permission-checked) or are replaced by the above — web is migrated in the same PR.

Photos: upload with the existing upload routes first, then send the object URL/path in `photos`.

Notifications (existing notification + push services): owner and watchers (minus the actor) on transition, comment, and @mention; type `defect`, payload `{projectId, defectId}` so the phone can route to it.

## Phone (stage 1)

- Project screen tile **Defects** → list (grouped by stage, counts, filters remembered with `usePersistedState`), TwoPane detail when wide.
- More menu **My defects** → `/api/defects/mine`.
- **Walkthrough capture**: camera first → title (optional; defaults "Defect at {location}") → location / trade / job stage / owner stay sticky → Save & next. Optional markup (`usePhotoMarkup`). Works offline (queue type `create-defect` with `clientRequestId` + persisted photos).
- Detail: photos (before/after), stage chip, actions for allowed transitions, history + comments, watch toggle.
- Notification tap → defect detail.
