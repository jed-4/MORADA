---
name: ErrorBoundary navigation recovery
description: Why a router-level React ErrorBoundary must reset on navigation and why dashboard widgets each need their own boundary.
---

# ErrorBoundary must recover on navigation, and widgets need per-widget boundaries

A single React `ErrorBoundary` wrapping the router does NOT reset itself when the
route changes. Once any descendant throws during render, the boundary stays in its
errored state across every subsequent client-side navigation, so the user sees
"Something went wrong" on EVERY page until a hard browser reload. This presents as
"I can't open any page in this project" even though only one widget/page is broken.

**Why:** A project-specific dashboard widget threw during render (data-dependent —
e.g. a project with all-null dates / specific invoice data). With only one top-level
boundary and no reset, that single throw wedged the entire app shell.

**How to apply (the durable rules):**
1. The router-level boundary must reset on navigation. Pass the current location as a
   reset key (`resetKeys={[location]}`) and reset only when `hasError` is already true
   AND a reset key changed (do the comparison in `componentDidUpdate`; do NOT reset
   while healthy, or you risk churn). Keying the boundary by location works too but
   remounts the whole subtree on every navigation — prefer resetKeys.
2. Wrap each dashboard widget in its OWN boundary (inside the widget container so the
   chrome survives) with a compact fallback, so one bad widget degrades to a small card
   instead of nuking the whole dashboard.
3. React swallows render-time throws into the boundary — they never reach the inline
   `window.onerror` reporter. So `componentDidCatch` must forward the error (message +
   stack + componentStack + a context label) to the server (`POST /api/_client-error`)
   or prod logs show nothing. Keep chunk/dynamic-import errors short-circuiting to the
   reload path BEFORE forwarding.

Note: boundaries only catch render-phase throws, not event handlers or async callbacks.
