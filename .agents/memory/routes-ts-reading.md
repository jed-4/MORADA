---
name: Reading server/routes.ts
description: The monolithic routes file is large enough to trip the read tool. Use shell tools for anything past ~line 26000.
---

`server/routes.ts` is ~31.8k lines. The `read` tool has been observed to cache it at ~26.3k lines and then reject `offset` past that point ("Requested view_range start N exceeds file length 26306"). `wc -l` reports the real length.

**How to apply:** for any read past line ~26000 use `sed -n 'A,Bp' server/routes.ts` or `rg -n PATTERN server/routes.ts`. Don't waste turns retrying the read tool.
