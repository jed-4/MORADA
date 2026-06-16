---
name: Two-stage estimate approval lifecycle
description: Approve vs Mark-as-Contract state machine and the guards that keep lock/freeze semantics intact.
---

BuildPro estimates have a two-stage approval:
- **Approve** (`POST /api/estimates/:id/approve`): status=`approved`, `isLocked=false`,
  becomes the project's `selectedEstimateId`, stamps canonical total onto
  `projects.contractPrice`. LIVE/editable — contract price tracks further edits.
- **Mark as Contract** (`POST /api/estimates/:id/contract`): only from `approved`;
  status=`contract`, `isLocked=true`, freezes the price; estimate + Costings read-only.
- **Revert** (`POST /api/estimates/:id/revert`, body `{target:"approved"|"draft"}`):
  contract→approved unlocks + clears contracted audit fields; →draft also clears the
  project's `selectedEstimateId`/`contractPrice` when it pointed at this estimate.

**Guards (do NOT remove):**
- `approveEstimate` must REFUSE when the target's status is already `contract`
  (throws `ALREADY_CONTRACT`; route returns 409). A locked contract may only be
  unlocked via the explicit revert flow — re-approving must never silently demote it.
- `approveEstimate` refuses (`LOCKED_CONTRACT_EXISTS`, 409) if a DIFFERENT estimate on
  the same project is already locked as `contract`.
- approve, contract AND revert all enforce company authorization
  (`project.companyId === req.user.companyId`, else 403) — these mutate lifecycle by
  estimate ID, so a missing check is a cross-company state-change hole.

**Why:** the lock/freeze stage is the legal contract baseline; silent unlock or
cross-company mutation would corrupt the frozen contract price and audit trail.

**How to apply:** keep the same guards mirrored in MemStorage and DbStorage
(`approveEstimate`/`markEstimateAsContract`) and on every lifecycle route. The
Mark-as-Contract confirm dialog must display ex-GST + inc-GST totals (from the target
revision's `/summary`) so the user confirms the exact price being frozen.
