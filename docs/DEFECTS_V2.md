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
- **As built:** open → closed also needs `close` — any move INTO closed does,
  otherwise someone without `close` could skip the check by closing straight
  from open. Every other move needs `edit` (or `close`).

Legacy `status` column stays and is kept in sync for old reports:
open→`open`, sent/accepted/rejected→`in_progress`, fixed→`resolved`,
closed→`closed`. Backfill `stage` from `status` the reverse way
(unknown custom keys → `open`).

## Data (migration — number: next free after 0130 at merge time; Defects takes the FIRST free number)

**As built: `migrations/0131_defects_v2.sql`.**

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

## Server as built (stage 1) — details and deviations

The phone can rely on these. Rules live in `shared/defects.ts` (pure, tested in
`server/__tests__/defects-v2.test.ts`); routes in `server/routes.ts`, DB work in
`server/services/defects.ts`.

- **Close rule:** any move into `closed` needs `close` (see Workflow above).
- **Permission per route:** list/detail/mine/locations GET, comments, watch/unwatch
  → `view`. Create and adding a location → `add`. PATCH, photos, location
  PATCH/DELETE → `edit`. Transition → `view` to reach it, then `edit` or `close`
  per move (403 with a message otherwise). DELETE → `delete`.
- **Project access:** team users can reach every project in their own company
  (that is the app-wide rule; `user_project_access` only confines clients).
  Another company's defect or project is a 404.
- **Overdue** = `dueDate` in the past and stage is not `fixed` or `closed`.
- **List filters:** `locationId` also matches locations inside it; `ownerUserId=none`
  = no owner; `q` also matches the number (`14`, `D-014`). `limit` max 200,
  default 50. `counts` ignore the `stage` filter (so the tabs still show totals)
  but honour every other filter. Sorted newest first.
- **Create:** `title` is optional — defaults to `Defect at {location path}`, or
  `Defect`. `dueDate` omitted → job-stage default; `dueDate: null` → no due date.
  New defects always start `open`. A repeat `clientRequestId` → 200 with the
  existing defect; a fresh one → 201. `photos` and `attachments` are both
  accepted and stored together.
- **Photos** must already be uploaded: `url` has to start with
  `/objects/company/<the caller's companyId>/` (what the upload routes return),
  otherwise 400. Photos already on a defect are kept as they are.
- **PATCH:** sending `stage` → 400 (use `/transition`). The legacy `status` key is
  ignored. `projectId` can't be changed. Setting a free-text `location` without
  a `locationId` unlinks the picked location. A new owner auto-watches.
- **Transition** to `fixed` also stamps the legacy `date_resolved` / `resolved_by`;
  moving anywhere but `closed`/`fixed` clears them and `closed_*`. Two people
  moving the same defect at once → the second gets 409.
- **Comments:** mentions are filtered to team users of the same company, and
  mentioned people auto-watch. A mentioned person gets one "mentioned you"
  notification, not a second "new comment" one. 201 with the updated detail.
- **Watch / unwatch** return the updated detail.
- **Extra notification:** the owner is told when they are made owner (create or
  PATCH), unless they did it themselves.
- **Push payload:** `data` carries `type: "defect"`, `entityType: "defect"`,
  `entityId`, `defectId`, `projectId` and `link`
  (`/projects/:projectId/defects?defect=:id`, which the web opens).
- **Defect objects also carry** legacy `status`, `type`, `notes`, `dateResolved`.
- **Legacy routes:** `GET /api/defects?projectId=` (array of defect objects, no
  paging) and `POST /api/defects` (projectId in body) still work, now
  permission-checked. The web uses the v2 routes.
- **Locations:** POST with a name that already exists under the same parent
  returns that location (200-style body, 201 status). DELETE → 409 if any defect
  uses it or it has locations inside it. Renaming/moving a location rewrites the
  `location` text on every defect in it and below it.
- **Migration backfill:** `company_id` from the project; `stage` from `status`;
  `number` per project in `created_at` order; already-closed rows get `closed_at`
  from `date_resolved` (else `updated_at`); creators watch their own defects.

## Phone (stage 1)

- Project screen tile **Defects** → list (grouped by stage, counts, filters remembered with `usePersistedState`), TwoPane detail when wide.
- More menu **My defects** → `/api/defects/mine`.
- **Walkthrough capture**: camera first → title (optional; defaults "Defect at {location}") → location / trade / job stage / owner stay sticky → Save & next. Optional markup (`usePhotoMarkup`). Works offline (queue type `create-defect` with `clientRequestId` + persisted photos).
- Detail: photos (before/after), stage chip, actions for allowed transitions, history + comments, watch toggle.
- Notification tap → defect detail.

## Stage 2 — trades (as built, migration 0135)

- **One link per trade per job:** `defect_trade_links(company_id, project_id,
  contact_id, token, created_at, revoked_at, last_viewed_at, last_digest_at,
  last_emailed_at)`. Token = 32 random bytes, base64url (43 chars); a partial
  unique index allows one LIVE link per (project, contact). Revoked links are
  kept. Rules: `shared/defectTrades.ts`; DB work: `server/services/defectTrades.ts`.
- **Defect columns:** `sent_to_trade_at` (first send only), `trade_viewed_at`
  (first time the trade opens their link), `trade_marked_fixed_at`,
  `owner_overdue_reminded_at`. The defect object now carries
  `sentToTradeAt`, `tradeViewedAt`, `tradeMarkedFixedAt`.
- **Send:** `POST /api/defects/:id/send-to-trade {contactId?, emailNow?, message?}`
  (`edit`). Sets/changes the trade contact, moves `open → sent` (other live
  stages keep theirs), logs `transition` + `sent_to_trade`, notifies owner and
  watchers, and with `emailNow` emails the trade their link (urgent). Without
  it the trade hears in the 7am digest. Response `{contactId, contactName,
  sent, emailed, emailError, linkUrl, defect}`.
  `POST /api/projects/:projectId/defect-trades/:contactId/send {emailNow?}` =
  "Send all open for this trade".
- **Staff views:** `GET /api/defects/:id/trade-status`,
  `GET /api/projects/:projectId/defect-trades` (per trade: counts by stage,
  overdue, link; `backchargeCents` only with `financial.bills:view`),
  `POST …/defect-trades/:contactId/link` (copy link; creates one if needed),
  `POST …/defect-trades/:contactId/revoke`.
- **Public page** `/portal/defects/:token` → `GET /api/portal/defects/:token`
  (404 unknown, 410 revoked). Only that trade's defects on that job in
  `sent / accepted / rejected / fixed`, with photos (served through
  `/api/portal/defects/:token/photos/:defectId/:index`), location, due date,
  priority and the "sent back" note. No money, no other trades.
  `POST /api/portal/defects/:token/defects/:defectId/action {action: accept|fixed, note?, photo? (image data URL ≤10 MB)}`:
  accept = sent/rejected → accepted; fixed = sent/accepted/rejected → fixed
  (photo stored as kind `trade`, shown as "after"). Logged as `transition` with
  actor = trade name and `data.via = "trade_link"`; owner + watchers notified.
  Trades can never close, reject or reopen.
- **Revoke:** automatically when none of the trade's defects on the job are in
  sent/accepted/rejected/fixed (checked after every office transition and in
  the daily sweep), or on demand. Logged as `link_revoked` on their defects.
- **Digest:** hourly sweep (`startDefectDigestScheduler`, server/index.ts). Per
  live link, once per local day at/after 07:00 in the company's time zone
  (`system_configuration.timezone`, fallback Australia/Sydney): new (sent since
  the last digest) + overdue. Nothing in either → no email. The day is claimed
  before sending, so two instances can't double-send.
- **Owner overdue reminders:** same sweep, one in-app/push notification per
  overdue defect per local day (from 7am) to its owner.
- **Emails** go through `sendGenericEmail` and the email delivery log as
  `defect_trade` / `defect_digest`, from "<Company> via Morada
  <noreply@moradaco.com.au>", reply-to the sender.

## Stage 3 — handover + backcharges (as built, migration 0135)

- **Handover list:** `GET /api/projects/:projectId/handover?jobStages=a,b`
  (default `pre_handover,handover`) → project, branding, defects (ref, title,
  location, stage, closed date, up to 2 before + 2 after photo URLs), counts,
  sign-offs. Photos: `/api/projects/:projectId/handover/photos/:defectId/:index`.
  PDF built in the browser with the shared @react-pdf kit
  (`client/src/components/defects/pdf/HandoverPdfDocument.tsx`).
- **Client:** new portal key `portal.handover` (view, approve). The client's
  project "Defects" tab shows the read-only list + PDF, only when
  `projects.share_handover_with_client` is on (`PATCH …/handover/settings
  {shareWithClient}`, `edit`). Client copies have no trade names and no money.
  On the boot that creates the key, client roles that can see variations get it.
- **Sign-off:** `POST /api/projects/:projectId/handover/signoff {name, agree:true}`
  — client logins only. Stored in `defect_handover_signoffs` (typed name, user,
  time, IP, browser, counts and a snapshot of the list) — the same evidence a
  portal-signed variation keeps. A `handover_signed` event goes on every listed
  defect.
- **Backcharges:** on the defect (`backcharge_cents` INC GST, `_reason`,
  `_contact_id`, `_cost_code_id`, `backcharged_at/_by/_by_name`).
  `GET|PUT|DELETE /api/defects/:id/backcharge` and
  `GET /api/defect-backcharges?projectId=` (rows + totals per trade with the
  GST split). Reading needs `financial.bills:view`; writing needs defects
  `edit` + `financial.bills:edit`. The `backcharge` event never carries the
  amount. No Xero document is created.
