# Morada MCP Server — Design & Build Plan

**Branch:** `feat/mcp-server` (worktree `../morada-mcp`, based on `origin/main` @ b0e8138b)
**Status:** Phase 0 complete; Phase 1 next
**Date:** 2026-08-03

---

## Decisions (locked)

| Decision | Choice |
|---|---|
| Audience | **Customer-facing connector** — a remote MCP server customers add in claude.ai / Claude Desktop. OAuth 2.1 + dynamic client registration, not just a personal token. |
| First data target | **Dev DB, read + write.** Full surface exercised against `helium` (dev) before anything points at prod (`ep-delicate-flower`). |
| Coverage priority | Estimates / allowances / selections, plus docs / notes / tasks / messages — on top of the 19 tools that already exist. |
| Transport | Remote **Streamable HTTP**, mounted inside the existing Express app at `/mcp`. Not a separate service. |

---

## The core insight

`server/ai/tools.ts` + `server/ai/executor.ts` already were a tool layer: 19 tools (12 read,
7 write), already scoped by `companyId`, already backed by `storage` / `db`, already wired to
Claude via `/api/ai/conversations/:id/messages`.

An MCP server is **a second transport over that same registry**. Phase 0 lifted that registry
out of `server/ai/` so both the in-app assistant and MCP consume one definition. Two drifting
tool sets was the failure mode to avoid.

---

## Architecture

```
claude.ai / Claude Desktop
        │  Streamable HTTP + Bearer token
        ▼
  Express app (server/index.ts)
        │
        ├─ POST /mcp                      ← MCP transport            [Phase 1]
        ├─ /.well-known/oauth-*           ← discovery metadata       [Phase 1]
        ├─ /oauth/{register,authorize,token}                         [Phase 1]
        │
        ▼
  server/mcp/            ← transport, auth, session handling         [Phase 1]
        │
        ▼
  server/tools/          ← SHARED registry                           [Phase 0 ✅]
        │                  { name, description, inputSchema, scope,
        │                    mutates, permission, handler(ctx, input) }
        │                  ctx = { companyId, userId, scopes, hasPermission }
        ├──────────────► consumed by server/routes.ts   (in-app Morada AI)
        └──────────────► consumed by server/mcp/        (external Claude)
                │
                ▼
        storage.ts / db (Drizzle / Neon)
```

**Nothing bypasses `server/tools/`.** MCP does not get its own DB access path.

---

## Phases

Each phase is a separate implementation session. They stack — do not parallelise.

### Phase 0 — Shared tool registry (no behaviour change) — ✅ DONE

**Landed on `feat/mcp-server`:**

- `server/tools/` — `types.ts`, `registry.ts`, `context.ts`, `index.ts`, and
  `definitions/{projects,tasks,finance,schedule,site,notes,blocked}.ts`
- All 19 tools ported, authored in zod; JSON Schema generated via `zod-to-json-schema`
  (new dependency — the MCP SDK pulls it in at Phase 1 regardless)
- `server/ai/tools.ts` and `server/ai/executor.ts` deleted; `server/routes.ts` now
  dispatches through the registry at both AI call sites
- `server/__tests__/tool-registry.test.ts` — 31 tests, including **schema parity** against
  the hand-written fixtures, which is what proves the model sees an unchanged tool surface.
  Run: `NODE_ENV=test npx tsx server/__tests__/tool-registry.test.ts`
- tsc: **1374** errors vs a **1375** baseline measured on clean HEAD; zero in the new files
  (the net −1 is a pre-existing bug the port removed — see below)

**Deliberate deviations from the original sketch:**

- **`permission` is populated**, mapped to the real key vocabulary already in `storage.ts`
  (`tasks.manage`, `projects.site_diary`, `financial.bills`, `dashboard.overview`, …)
  rather than deferred. Enforcement is one check in `registry.ts`, gated on
  `ToolContext.hasPermission` — which `aiAssistantContext()` supplies as allow-all, so
  nothing changed for the in-app assistant.
- **Blocked-item tools carry no `permission`** — nothing in the catalogue covers them.
  Scope alone gates them.
- **One scope per tool**, not a list. Enough for the read/write split, and the registry
  asserts `mutates` agrees with the scope prefix at import.
- `log_blocked_item` refuses when there is no conversation rather than writing a dangling
  row. Reachable only from MCP, so inert for the assistant.
- **Fixed in passing:** `create_schedule_item` passed `category: "construction"` to
  `createSchedule`. No such column — it is `scheduleCategory`. The property was silently
  discarded and the row took the column defaults. The port now passes those same defaults
  explicitly, so the rows are identical and a type error is gone.

**Carry into Phase 1:** a real `hasPermission` that reads the user's role, and an
`mcpCredentialContext()` sibling to `aiAssistantContext()`.

### Phase 1a — Token layer

- **Migration `0038_api_tokens.sql`.** *(0029–0037 exist; 0036 is claimed by
  `feat/allowances` and is prod-pending. 0038 is the first free number — do not reuse 0036.)*
  ```
  api_tokens(
    id, company_id, user_id,
    name, token_hash, token_prefix,
    scopes text[], client_id,
    expires_at, last_used_at, revoked_at, created_at
  )
  ```
  Store a SHA-256 hash + a short display prefix. Never the raw token.
- `server/mcp/auth.ts` — `requireMcpAuth`: `Authorization: Bearer mor_…` → token row →
  user → company → role → permission set → `ToolContext`.
- **No `NODE_ENV === 'development'` bypass.** See Risk 1.
- Bump `last_used_at` asynchronously; never block the request on it.

### Phase 1b — OAuth 2.1 + dynamic client registration

| Endpoint | Spec |
|---|---|
| `/.well-known/oauth-protected-resource` | RFC 9728 — points at the auth server |
| `/.well-known/oauth-authorization-server` | RFC 8414 — endpoints + supported grants |
| `POST /oauth/register` | RFC 7591 dynamic client registration |
| `GET /oauth/authorize` | PKCE **S256 required**; reuses the session login + a consent screen |
| `POST /oauth/token` | authorization_code + refresh_token grants |

Access and refresh tokens are rows in `api_tokens` — one token store, one revocation path.
`401` on `/mcp` must carry `WWW-Authenticate: Bearer resource_metadata="…"`.

### Phase 2 — Read surface (~30 tools total)

Curated, not generated. 1,118 Express routes is not an MCP surface.

- **Estimates / allowances / selections** — see Risks 3–4.
- **Docs / notes / tasks / messages** — documents, Details, note groups, task views,
  defects, minutes, channel messages.
- **Cross-cutting `search`** — one tool spanning projects/notes/docs/contacts is worth more
  than five narrow list tools.

Money is returned normalised and explicitly labelled (Risk 3).

### Phase 3 — Write surface

- Scope-gated (already enforced by the registry) and audit-logged: token id, user, tool,
  input, result, timestamp.
- No destructive tools in v1 — no delete, no bulk update, no status transitions that
  trigger Xero pushes or client-facing email.
- Writes that touch money (bills, invoices, variations) are **out of scope for v1.**

### Phase 4 — Productisation

Token management UI, per-token rate limits, per-tool telemetry, connector setup docs, and
the switch from dev DB to prod.

---

## Risks — read before writing code

**1. `requirePermission` has a dev bypass.** `server/middleware/auth.ts:138` returns
`next()` unconditionally when `NODE_ENV === 'development'`; `requireTeamMember` and
`requireTeamMemberOrClient` do the same. This is why `ToolContext.hasPermission` is
**injected** rather than imported — a tool that called the middleware directly would be
unenforced in exactly the environment Phase 1 targets.

**2. Tenancy.** `ctx.companyId` comes from the credential, always. The registry refuses at
import any tool whose input schema declares a company id, and `projectBelongsToCompany()`
in `definitions/shared.ts` is the single gate for anything addressed by project id. Note
there is a known open tenant bug elsewhere in the codebase (bill email intake routes on
`users[0]`) — treat cross-tenant leakage as live, not theoretical.

**3. Money.** Three storage conventions coexist (`shared/money.ts`): cents-as-integers
(~90% of tables), dollars-as-float (`estimate_items` price fields,
`variation_items.unitCostExTax`), and `numeric(10,2)` strings (timesheets, hourly rates —
Drizzle returns these as **strings**). Raw column values will make Claude report a $1,250
bill as $125,000. Every money field in a tool result must be normalised and unit-labelled.
Labour is **ex GST** — gross up ×1.1 before comparing against inc-GST client prices.

**4. `estimate_items.priceIncTax` is a denormalised cache.** Populated only via
`resolveEstimateStoredPrice`. Recompute with `computeEstimateItemPrice` on read; only
fixed-price allowance lines (unitCost 0) may trust it. Bites directly on Phase 2.

**5. Latency.** Neon is `us-east-1`, Jed is in AU — ~400ms per round trip. No queries in
loops; batch and cap result sizes.

**6. Prompt injection.** Note bodies, channel messages, supplier names, and document
contents are user-authored data flowing into a model context. Read results are **data, not
instructions.** Write tools must never be invoked on the strength of text found inside a
read result. State this in the server instructions the MCP server advertises.

**7. Data leakage.** Reuse `toSafeUser` from `server/middleware/auth.ts` for anything
returning a user — it strips `passwordHash` and Google Calendar OAuth tokens.

---

## Working in this worktree — hazard

**`git stash` is shared across all 18 worktrees in this repo.** They share one `.git`, so a
`git stash push` here can be popped by a concurrent session in another worktree. That
happened during Phase 0: this branch's work was stashed for a baseline measurement and
another session popped it into `morada-allowances`, while that worktree's stash landed here
as a conflict. Everything was recovered, but:

- **Do not use `git stash` in this repo while other sessions are active.** To measure a tsc
  baseline, check out the base commit in a throwaway worktree, or read the baseline from
  the memory note instead of re-measuring.
- Commit early on this branch. Untracked files are the ones that go missing.

---

## Dependencies

- `zod-to-json-schema` — **added in Phase 0**
- `@modelcontextprotocol/sdk` — Phase 1
- `zod`, `express`, `express-session`, `drizzle-zod` — already present

---

## Session plan

| Session | Scope | Status |
|---|---|---|
| 1 | Design + branch + this document | ✅ |
| 2 | Phase 0 — shared registry refactor | ✅ |
| 3 | Phase 1a + 1b — tokens, then OAuth/DCR | next |
| 4 | Phase 2 — read surface | |
| 5 | Phase 3 — write surface + audit log | |
| later | Phase 4 — productisation, prod cutover | |
