---
name: Permissions gotchas
description: Two silent bypasses that make BuildPro permission checks "work" without the user's role actually having the perm — check these before debugging "user sees something they shouldn't".
---

# Two silent bypasses in `requirePermission` / `usePermission`

Both client `usePermission` and server `requirePermission` (`server/middleware/auth.ts`) short-circuit `true` in two situations that look like real permission grants but aren't:

1. **`NODE_ENV === 'development'`** — server `requirePermission` returns `next()` unconditionally. Any "is this gated?" test must be done in production or in a build with `NODE_ENV=production`.
2. **`isAdminLike`** — true when the user's role is built-in AND its name matches admin/owner/general-manage semantics. Set on the user object in `/api/auth/user` (search routes.ts for `isAdminLike`). Both client hook and server middleware bypass on this flag.

**Why:** users on the seeded "Owner" / "Admin" / "General Manager" built-in roles get full access regardless of what the role's permission map actually says. Editing those roles' perms in the UI does nothing for those users.

**How to diagnose "user X can see page Y they shouldn't":**
- Hit `GET /api/auth/user` as that user and inspect `effectivePermissions[<key>]` AND `isAdminLike`.
- If `isAdminLike: true`, move the user off the built-in admin-like role (or rename the role so it no longer matches).
- If `effectivePermissions[<key>].view: true`, revoke that action from their role in the admin UI.
- If neither — the route or page is ungated. Grep for the API path and confirm `requirePermission` is present.

**How to apply:** before assuming a permission system bug, rule out these two bypasses first. They are the most common cause of "leak in prod".
