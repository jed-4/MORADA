---
name: Sentry ESM express instrumentation
description: Why backend Express auto-tracing prints "express is not instrumented" even with instrument imported first
---

Sentry Node v8+/v10 auto-instrumentation (HTTP/Express performance spans via OpenTelemetry + import-in-the-middle) needs the loader hooks registered at Node startup via `--import ./instrument.mjs`. Just making `import "./instrument"` the FIRST import in the entry file is NOT enough under ESM — the boot log still shows `[Sentry] express is not instrumented`.

**Why:** BuildPro runs ESM (`type: module`): dev = `tsx server/index.ts`, build = esbuild `--bundle --format=esm --packages=external`, start = `node dist/index.js`. In all three, external packages (express, @sentry/node) are hoisted/instantiated before the entry-module body runs, so the OTEL patches can't attach. The fix requires changing the run/build commands (package.json) to add `--import`, which is a protected file here — do not edit without asking.

**Important:** This warning ONLY degrades automatic performance tracing of API routes. **Error capture still works fully** — `Sentry.setupExpressErrorHandler(app)` is a plain error middleware that calls captureException regardless of OTEL instrumentation. Web + mobile tracing are unaffected (no `--import` requirement on those surfaces).

**How to apply:** If asked to enable full backend route tracing, the change is package.json scripts: dev `tsx --import ./server/instrument.ts server/index.ts`, and a separate built instrument file `--import`ed before `dist/index.js`. Tracked as follow-up; gated on user permission to edit package.json.
