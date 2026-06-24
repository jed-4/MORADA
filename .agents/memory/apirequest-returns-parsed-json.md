---
name: apiRequest returns parsed JSON
description: Silent "save didn't work" reports caused by calling .json()/.ok on the shared apiRequest() result.
---

The shared `apiRequest()` helper (in `shared/api.ts`, re-exported from `client/src/lib/queryClient`)
already returns PARSED JSON (or `null` for 204) and THROWS on non-OK via `throwIfResNotOk`,
with the server's `error`/`message` field preserved in `Error.message`.

So in a mutation/queryFn you must use its result directly. Never call `.json()`, `.ok`,
`.status`, or `.text()` on it.

**Symptom this causes:** a save that the SERVER accepts (prod logs show `200`) but the
UI reports as failed. Calling `result.json()` on a plain object throws
`x.json is not a function`, which rejects the mutation → `onError` toast fires and
`onSuccess` (query invalidation / dialog close) never runs, so the change is persisted
on the server but the screen looks unchanged until a hard refresh.

**Why:** `apiRequest` was moved into shared code (web+mobile) and changed to return parsed
JSON; many older callers were written against the previous Response-returning contract and
still call `.json()`/`.ok`. This is a recurring footgun scattered across the web client.

**How to apply / debug heuristic:** when a user says an edit "didn't work" but deployment
logs show a 2xx for that endpoint, grep for the leftover anti-pattern:
`rg "= await apiRequest" client/src -A8 | rg "\.(json|ok)\b"` and remove the `.json()`/`.ok`.
Defensive `response.json?.() || response` is fine (returns the parsed object); raw
`fetch(...).json()` is fine (real Response).

**Argument ORDER differs from older Express templates:** web `apiRequest(url, method, data)`
— URL FIRST, then method. Calling it method-first (`apiRequest("GET", "/api/...")`) silently
hits the wrong URL/method and the query resolves empty (looks like "no data" / a backend bug)
rather than erroring loudly. Mobile (`expo-mobile/src/services/api.ts`) is also `(path, method, body)`
BUT returns a raw `Response` and does NOT throw on non-2xx — mobile callers must check
`response.ok` themselves or a failed POST still shows a success Alert.
