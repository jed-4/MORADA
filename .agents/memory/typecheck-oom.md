---
name: Full tsc OOMs in this workspace
description: Typecheck command and the fact that a whole-project tsc runs out of memory here.
---

# Typechecking BuildPro

The typecheck script is `npm run check` (= `tsc`), NOT `npm run typecheck` (that script does not exist despite replit.md mentioning it). A full whole-project `tsc --noEmit` reliably runs out of JS heap / times out in this workspace, even with `--max-old-space-size` raised — it is an infra limit, not a code error.

**How to apply:** to validate edits, rely on the `tsx` dev workflow ("Start application") booting cleanly (it fails fast on syntax/import errors) rather than waiting on a full tsc. server/routes.ts is ~31.8k lines; the `read` tool miscounts its line numbers — use `sed -n`/`rg` to locate code reliably.
