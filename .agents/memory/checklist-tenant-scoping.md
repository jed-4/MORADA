---
name: Checklist template tenant scoping
description: Why company-scoping checklist templates means touching many routes, not one.
---

Checklist templates are a 3-level hierarchy (template → group → item) and the
ownership column (`company_id`) lives ONLY on the top-level `checklist_templates`
row. Group and item ownership must be resolved by walking up the chain
(item → group → group.templateId → template.companyId).

**Why:** A future "scope X by company" change that only guards the obvious
GET/POST/PATCH/DELETE by-id routes will still leak, because the surface also
includes: duplicate, group move-to, group move-to-template, groups reorder,
item create (verify target group), item move (verify target group), list,
and import/export. Reorder takes an array of ids — filter it to ids that
actually belong to the owned template instead of trusting the body.

**How to apply:** Use a getOwned* helper chain (template→group→item) and apply
it to EVERY route in the family. Create/import/duplicate must STAMP companyId
from req.user (the insert schema omits it); list/export must FILTER by companyId.
