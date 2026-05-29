---
name: BillDetail TDZ in hook dependency arrays
description: Why a "Cannot access X before initialization" / spurious "Invalid hook call" can appear in large React components
---

A hook's dependency array is evaluated DURING render, at the line where the hook
is called. If a dep references a `const`/`let` declared LOWER in the same
component body, you hit a temporal dead zone: "Cannot access 'X' before
initialization". In dev this sometimes surfaces first as React's generic
"Invalid hook call" before the real TDZ message appears.

**Why:** `const` is not hoisted with a value (unlike `function`/`var`). A
`useEffect(..., [foo?.id])` placed above `const foo = ...` reads `foo` before it
exists.

**How to apply:** In big components (e.g. `client/src/pages/BillDetail.tsx`,
3800+ lines), declare derived consts that feed hook dependency arrays ABOVE the
hooks that use them. When adding/moving effects, check the dep array identifiers
are all declared earlier in the render scope.
