---
name: Diagnosing "prod crashed" reports that are really stale browser tabs
description: How to tell a live production code bug from a stale-client-after-redeploy artifact before changing any code.
---

A "prod just crashed" report can be a stale browser tab running the *previous*
build, not a defect in the currently-deployed code.

**Tell-tale signature in deployment logs:** a client render error whose stack
points at a hashed chunk (e.g. `VariationDetail-XVzxnq6k.js`) arrives together
with `resource-load-error` 404s for OTHER hashed assets from the same era
(e.g. `index-<hash>.css`, `index-<hash>.js`). The 404s mean the browser is
holding an old `index.html` and requesting asset hashes the redeployed server
no longer has — i.e. the whole tab is stale, including the chunk that threw.

**Why:** Vite emits content-hashed filenames per build. After a republish the
server only serves the new hashes; a tab opened before the deploy keeps running
old cached chunks and 404s on any new chunk it tries to fetch.

**How to apply before touching code:**
1. Find the fix commit for the error, then run
   `git merge-base --is-ancestor <fixCommit> <publishCommit>`. If the publish
   ("Published your App") is a descendant, the fix is already live → don't
   re-fix; the user just needs a hard refresh (Cmd/Ctrl+Shift+R).
2. Confirm the current served build is healthy (recent requests returning 200,
   no healthcheck 500s except a brief redeploy-boot window).
3. Only treat it as a live bug if a client on the CURRENT build (its own assets
   load fine, no 404s) still crashes.

**Durable product gap:** stale tabs get a broken experience (chunk 404 → blank/
crash) until manual refresh. A real fix is client-side handling of chunk-load
errors that forces a reload (see error-boundary-recovery.md).
