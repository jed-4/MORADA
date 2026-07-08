---
name: Duplicate /api/auth/register handler
description: Two handlers are registered on POST /api/auth/register; only the first (server/auth.ts) ever runs. Explains surprising register response shape when writing integration tests.
---

`POST /api/auth/register` is registered twice: once in `server/auth.ts` (early, during `setupAuth`) and once in `server/routes.ts` (later, during `registerRoutes`). Express dispatches to the first matching handler and the `auth.ts` one never calls `next()`, so the `routes.ts` handler is dead code — it never runs.

The live handler (`server/auth.ts`) only accepts `{ email, password, firstName, lastName }`, creates a user with **no company**, and responds `200` (not `201`). Attaching a company requires a separate explicit call to `storage.createCompany({ name }, userId)` after registering — this also assigns the built-in admin role, clearing `requirePermission` gates.

**Why:** the dead `routes.ts` handler accepts a different shape (`name`/`companyName`) and returns `201` with a `companyId` already set, which is what you'd naturally guess from reading that file alone — writing a test against that shape fails confusingly (500/200 mismatches) because it never executes.

**How to apply:** when writing integration tests or debugging registration, follow the `server/auth.ts` handler's contract (see `server/__tests__/note-title-autosave.test.ts` for the working `createTenant` pattern), not `server/routes.ts`'s.
