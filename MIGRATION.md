# Migrating Morada off Replit

Target: **Render** (app, from `Dockerfile`) + **Cloudflare R2** (files) + **our own Neon** (database).
`app.moradaco.com.au` does not change.

This branch is the **code** half. It changes nothing on any host and touches no
database. The runbook below is the operational half, and is deliberately a
checklist rather than a procedure — the ordering that matters is called out,
the rest is yours to schedule.

---

## What this branch already did

| | |
|---|---|
| Object storage | Replit sidecar (GCS via `127.0.0.1:1106`) → S3 API against R2 |
| Stored paths | **unchanged** — still `/objects/company/<id>/uploads/<uuid>` |
| Local-disk uploads | enote attachments, gear photos, contact avatars now go to R2 |
| OAuth callbacks | Xero + both Google flows derive from one `APP_BASE_URL` resolver |
| Dead code | `server/replitAuth.ts`, `objectAcl.ts`, `searchPublicObject` deleted |
| Production bundle | no longer imports Vite or any other devDependency |
| Host config | `Dockerfile`, `.dockerignore`, `render.yaml`, `.nvmrc`, `.env.example` |

Replit keeps working while this sits unmerged, and keeps working after it
merges **provided the R2 variables are set there too** — see the warning below.

---

## ⚠️ Read this before merging

**Object storage becomes R2-only.** There is no dual-write and no GCS
fallback. The moment this branch is deployed anywhere — including Replit, if
`main` deploys before cutover — that instance reads and writes R2.

So either:

- **merge and cut over together**, or
- **merge first, and set the four `R2_*` variables plus `PRIVATE_OBJECT_DIR` in
  Replit Secrets at the same time**, after the bucket copy in step 2.

Everything else on this branch is backwards compatible: the base-URL resolver
still falls back to `REPLIT_DOMAINS`, so Replit's OAuth callbacks are unchanged.

---

## 1. Beforehand — confirm the two things that are not in your control

- [ ] **Read access to the Replit-managed GCS bucket.** The file copy depends
      on it and there is no way around it. Confirm before booking a date.
- [ ] **Neon.** Either transfer the project to our own account, or confirm we
      can `pg_dump` it.
- [ ] **Identify production by row counts, not hostname.** The workspace shell
      and the deployment connect to different databases, and the recorded
      production endpoint has been disputed before.
- [ ] **Check Neon's WebSocket endpoint is reachable from Render.** The app
      uses `@neondatabase/serverless` over WebSockets, not the HTTP driver, and
      that endpoint is not reachable from every network.

## 2. Files — copy the bucket, preserving keys

This is the whole reason no database rows change. Stored paths carry no bucket
and no host; the key is `<PRIVATE_OBJECT_DIR prefix>/uploads/<uuid>`, and the
service resolves it against whatever bucket is configured.

```bash
# rclone remotes: `gcs` (source, Replit's bucket) and `r2` (destination).
# --immutable so a re-run can never overwrite an object that already landed.
rclone copy gcs:<source-bucket> r2:<dest-bucket> \
  --checksum --immutable --transfers 16 --progress

# Then verify — this must print nothing.
rclone check gcs:<source-bucket> r2:<dest-bucket> --one-way
```

- [ ] Copy complete, `rclone check --one-way` clean
- [ ] `R2_BUCKET` set to the destination bucket
- [ ] `PRIVATE_OBJECT_DIR` left as-is — its leading `/​<bucket>` segment is
      ignored once `R2_BUCKET` is set, and its **prefix must still match** the
      keys you just copied
- [ ] R2 API token is scoped to that one bucket, read+write

> Files written between the copy and the cutover will be missed. Either run a
> second `rclone copy` immediately before the DNS switch, or accept a short
> upload freeze.

## 3. Database

- [ ] `pg_dump` → restore into the new Neon project
- [ ] **The `sessions` table must come across.** The store is created with
      `createTableIfMissing: false`, so without it every login fails.
- [ ] Apply any prod-pending migrations **by hand**, before cutover:
      `npx tsx scripts/apply-migration.ts <file>.sql --apply --var=DATABASE_URL`
- [ ] Never run `npm run db:push`. Drizzle resolves a column it cannot account
      for by proposing `DROP COLUMN`, and this schema is full of hand-applied
      columns. The Dockerfile does not run it; keep it that way.
- [ ] On first boot, confirm the `[DB] connected — host=… db=…` log line names
      the endpoint you expect.

> The app runs idempotent `ensure*` schema calls at every boot. A first deploy
> against a freshly restored database will do a little additive work on the way
> up; that is expected.

## 4. Render service

- [ ] Create from `render.yaml` (Docker runtime, region **ohio** — closest to
      the Neon endpoint)
- [ ] **`numInstances: 1`, autoscaling off.** Nine in-process schedulers with
      no leader election, plus Socket.IO with no Redis adapter. A second
      instance sends duplicate supplier emails and double-pushes to Xero.
- [ ] Health check `/api/health` (process-only; it does not touch the database
      on purpose)
- [ ] Confirm the build log installs `poppler-utils` and `chromium`
- [ ] Point `app.moradaco.com.au` at Render; TLS issued

## 5. Environment

Full list with purposes: [`.env.example`](.env.example).

- [ ] **`SESSION_SECRET` copied across verbatim.** It signs sessions *and*
      upload grants — a new value logs everyone out and invalidates in-flight
      uploads.
- [ ] `RESEND_API_KEY` set — the app **will not boot** without it
- [ ] `APP_BASE_URL` = `https://app.moradaco.com.au` (all OAuth callbacks
      derive from it)
- [ ] `SENTRY_RELEASE` set — replaces `REPLIT_DEPLOYMENT_ID`
- [ ] **Build-time** vars present in the Docker build: `VITE_CRISP_WEBSITE_ID`
      (today it lives in `.replit`'s `[userenv]`, not in Secrets — the easiest
      one to lose), `VITE_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`,
      `SENTRY_PROJECT`
- [ ] `DEV_USER_EMAIL` and `NEON_DATABASE_URL` are **not** set

## 6. OAuth callbacks — register before cutover

All three now derive from `APP_BASE_URL`.

| Provider | URI to register |
|---|---|
| Xero developer portal | `https://app.moradaco.com.au/api/xero/callback` |
| Google Cloud Console | `https://app.moradaco.com.au/api/google-calendar/callback` |
| Google Cloud Console | `https://app.moradaco.com.au/api/bill-inbox/callback` |

- [ ] Xero redirect URI registered
- [ ] Both Google redirect URIs registered
- [ ] Google authorised JavaScript origins include `https://app.moradaco.com.au`

## 7. Webhooks

The domain does not change, so these should survive — verify rather than assume.

- [ ] Xero webhook still delivering to `/api/xero/webhook` (HMAC uses
      `XERO_WEBHOOK_KEY`)
- [ ] Stripe webhook endpoint + signing secret
- [ ] Whatever posts to `/api/webhooks/email-invoice` — identify it and
      repoint if needed
- [ ] Resend domain verification intact

## 8. Smoke test after cutover

- [ ] Log in; session survives a reload
- [ ] Upload **and re-open** a file on every surface: bills, RFQ, selections,
      takeoff, site diary, invoices, variations, messages, product images,
      contact avatars, estimate-note attachments, gear photos
- [ ] Open an **old** attachment uploaded before the move (proves the key copy)
- [ ] AI-read a PDF bill (proves `pdftoppm`)
- [ ] Export the Selections Schedule PDF (proves Chromium)
- [ ] Reconnect Xero end to end; push a bill; confirm a webhook arrives
- [ ] Reconnect Google Calendar and the Gmail bill inbox
- [ ] Send a test email; links point at `app.moradaco.com.au`
- [ ] Real-time updates arrive (Socket.IO through Render's proxy)
- [ ] Watch logs for a full hour so every scheduler ticks at least once
- [ ] Open the Expo mobile app against the new host

---

## Known gaps, deliberately not addressed here

- **Legacy `/uploads/...` rows.** Enote attachments, gear photos and contact
  avatars written before this branch still hold local-disk paths. Those files
  are already gone — the tree was ephemeral on Replit too — and the read path
  404s cleanly. A backfill would have nothing to point at. Worth a one-off
  query to see how many rows are affected and whether they are worth nulling.
- **Nothing cleans up orphaned objects.** Deleting a bill does not delete its
  attachments from storage (this was true on GCS too).
- **Single instance is a ceiling.** Scaling needs the schedulers split into a
  Render background worker and a Redis adapter for Socket.IO.
- **The image ships devDependencies.** Now that production imports none of
  them, a multi-stage build could drop them — a separate change, verified on
  its own.
- **`.replit` and `replit.md` are still in the repo.** Delete them once the
  cutover is done and Replit is decommissioned, not before.
