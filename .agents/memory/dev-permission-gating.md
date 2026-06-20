---
name: Dev permission gating
description: Why a dev/demo account "can't access" a gated feature even though the API works in development.
---

In **development**, the server's `requirePermission` middleware is bypassed (`NODE_ENV==='development'` → `next()`). So a gated feature being missing/blocked in dev is almost always the **frontend** gate, not the API: the client reads `effectivePermissions` (from `GET /api/auth/user`, built from `role_permissions`) plus the `isAdminLike` flag.

**Why a manager-named role can still have zero access:** the admin bypass (`isAdminRole`) requires BOTH `is_built_in = true` AND a name containing admin/owner/general manager. The demo company seeds some admin-sounding roles (e.g. a custom **"General Manager"**) as `is_built_in = false` with **zero `role_permissions` rows** — so the account has no access at all despite the name, and gets no admin bypass.

**How to apply / unblock a dev account:**
- Don't chase the API (it works in dev). Check the user's role: its `is_built_in` flag and its `role_permissions` rows.
- To grant just financial visibility: insert `role_permissions` rows (`allowed_actions ["view"]`, `view_scope 'all'`) for the relevant permission keys — financial gating needs one of `financial.budget_actuals` / `financial.budget_labour` / `financial.bills` / `dashboard.financial` (see `useFinancialPermission`).
- Alternatively flip the role's `is_built_in = true` for a full admin bypass (broader; affects all gated features).
- The user must **refresh / re-login** afterwards so the client refetches `effectivePermissions`.
- This is a dev/demo-DB data quirk; production roles are seeded separately.
