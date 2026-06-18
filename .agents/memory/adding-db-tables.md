---
name: Adding DB tables to BuildPro (dev + prod propagation)
description: How to safely add a new Postgres table so it reaches BOTH the dev DB and production, given db:push is unsafe here and deploy never runs migrations.
---

# Adding a new DB table to BuildPro

Two non-obvious traps make "just add it to schema.ts and push" fail in this repo.

## 1. Do NOT run a full `npm run db:push` in the workspace
`drizzle-kit push` diffs the WHOLE schema, and this DB carries pre-existing
unrelated drift (e.g. a `projects_trades_portal_token_unique` constraint) that
makes push drop into an **interactive prompt offering to TRUNCATE `projects`**.
That is a data-loss footgun and it also blocks non-interactively.

**How to apply:** create the new table in the dev DB with direct additive SQL
(`CREATE TABLE IF NOT EXISTS ...` + `CREATE INDEX IF NOT EXISTS ...`) via the
executeSql callback, not `db:push`. Match the drizzle column types exactly
(`varchar` ids default `gen_random_uuid()`, `timestamp` defaults `now()`).

## 2. The deploy build does NOT run any migration
`npm run build` (the deploy build) never runs `drizzle-kit push`, so a new table
will simply **not exist in production** — registration/inserts then fail with
`relation "<table>" does not exist`, and because such hooks are usually
fire-and-forget/try-caught, the failure is silent.

**Why:** replit.md mandates additive-only, never-destructive prod DB changes, so
there is no migration step in deploy.

**How to apply:** add an idempotent `ensure<Table>Table()` storage method that
runs `CREATE TABLE/INDEX IF NOT EXISTS` and call it once at server startup in
`server/index.ts` alongside the other idempotent boot hooks
(`seedMissingBuiltInCategories`, etc.). This is additive, safe, and guarantees
prod gets the table on the first boot after the feature ships — the only
reliable way to propagate new tables to prod here.
