---
name: Web queryClient stale-cache defaults
description: The web app's global TanStack Query defaults make any "show current remote state" view serve a stale cache unless overridden.
---

The web `queryClient` (shared/api.ts) sets global defaults `staleTime: Infinity`
and `refetchOnWindowFocus: false`. Once a query has loaded, it is treated as
fresh forever and will NOT refetch on remount, focus, or dialog reopen.

**Why:** This is great for mostly-static reference data, but it silently breaks
any view that must reflect state changed *elsewhere* — another browser tab, the
mobile app, or a background job. The view shows the first-loaded snapshot, and a
"Save" built on that snapshot will POST the stale value and overwrite newer
remote state (a real cross-device data-loss bug, not just a display lag).

**How to apply:** For any dialog/panel that reads shared cross-device/cross-tab
state (e.g. settings backed by `/api/user-view-preferences`), override the
defaults locally: set `staleTime: 0` on that `useQuery`, and force a fresh pull
when the view opens (`refetch()` in an `open` effect) and seed local form state
from that fresh response — never from the cache. Gate the form on `isFetching`
so the user can't edit a stale snapshot mid-refresh.
