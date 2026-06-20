---
name: Dev permission gating
description: Why a dev/demo account "can't access" a gated feature even though the API works in development.
---

A "can't access X in dev" report is almost always the **frontend** gate, not the API: in development the server's permission middleware is bypassed, so gated features are blocked only by the client's effective-permissions check (derived from the user's role + its permission rows) plus the admin-bypass flag.

**Non-obvious trap:** the admin bypass only applies to **built-in** roles. The demo/dev company seeds some admin-sounding roles (e.g. a custom **"General Manager"**) as *non*-built-in with **no permission rows**, so the account has zero access despite the name — and gets no bypass.

**Why this matters:** don't chase the API when a dev account can't see something. Check the role's built-in flag and its permission rows.

**How to unblock:** either grant the role the relevant view permission rows (financial visibility keys live in `useFinancialPermission`), or flip the role to built-in for full admin (broader). The user must refresh / re-login so the client refetches its permissions. This is a dev/demo-DB data quirk; production roles are seeded separately.
