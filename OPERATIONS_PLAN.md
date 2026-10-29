# Operations — plan

Status: DRAFT for Jed's review, 2026-10-28. Branch `feat/operations`, worktree `morada-operations`, off origin/main c920d437. No code yet.

Generic Morada feature for every company. Lighthouse's Notion content is just the first company to load in — nothing in the design is Lighthouse-specific.

## Where things stand (origin/main)

| Piece | Storage | Where it shows | State |
|---|---|---|---|
| Operational tasks / task templates | `task_templates` (one table) | Operations → Operational Tasks (`TaskLibrary.tsx`) AND Templates → Task Templates (`TaskTemplates.tsx`) | Two editors over one table; generates real To-Dos into `notes` daily |
| Dead third editor | — | `SystemTaskTemplates.tsx` | Imported nowhere |
| Folders | `system_folders` / `system_documents` | Operations → Folders | A document is only a pasted URL, no body |
| Docs | `doc_folders` / `docs` (company-scoped, `contentHtml`) | `/docs` with NotionEditor | Only nav link was in a dead sidebar; reachable via one dashboard quick action |
| Workflows | `workflow_templates` | Operations → Workflows | CRUD only, nothing fires them |
| Checklists | `checklist_templates` / `checklist_instances` | Templates hub + project tab | Instances are project-only (`projectId` NOT NULL) |
| Permissions | — | — | No Operations key; any team member can edit everything |

## Target shape

```
Operations
├── Overview      who has what this week, overdue, default diaries per person
├── Tasks         task templates (the definitions)            ← one editor
├── Library       SOPs, templates, policies, checklists, refs  ← Docs, promoted
├── Workflows     "when X happens → do Y" automations
└── Reminders     (existing)
```

- **Task template** = what / who / how often / checklist / estimated time / **linked SOP**.
- **Library document** = a rich page written IN Morada (same NotionEditor as Notes), with a type (SOP, Template, Policy, Checklist, Reference), owner, status Draft → In review → Approved → Archived, version history.
- A To-Do generated from a template shows **View SOP**.
- Templates hub's "Task Templates" card opens Operations → Tasks (same screen, not a second editor).

## Phases (one PR each)

1. **Permissions + cleanup.** Keys `operations.view`, `operations.manage`, `library.view`, `library.edit`, `library.approve`; backfill onto existing roles (seeder is insert-only — see permission-seeder memory) and guard every `/api/systems/*` + `/api/docs*` route. Delete `SystemTaskTemplates.tsx`, `SystemDocuments.tsx`, `SystemProcesses.tsx`, dead `AppSidebar`/`ResizableSidebar`. Templates card → Operations. Tenancy test for every touched route.
2. **Library.** Promote `docs` into Operations → Library: type, status, owner, tags, `requiresApproval`; `doc_versions` table (snapshot on approve); approve/reject with approver + date. Fold `system_documents` in (move rows, keep a URL-type doc for link-only entries), then drop the Folders tab.
3. **SOP ↔ task link.** `task_templates.sopDocId`; picker in the task editor ("link existing" / "create new SOP"); View SOP on generated To-Dos (web + mobile); Library doc shows "Used by N tasks".
4. **Starter pack.** A versioned set of generic SOPs + task templates (bills hygiene, supplier statement match, weekly site review, toolbox talk, etc.) cloned INTO a company — on signup (opt-in) and from an "Add starter pack" button. Clones, never shared rows, so edits never leak between companies.
5. **Workflows engine.** Triggers: project stage/status change, task completed, checklist completed, doc approved, date. Actions: create task(s) from templates, start a checklist, notify/remind. Run log per firing; idempotent (no double-fire on retries). Existing `workflow_templates.taskTemplateIds` becomes one action type.
6. **Notion import (Lighthouse, one-off).** Admin script via the Notion API into ONE company id: Task Library rows → task templates (created INACTIVE until reviewed) + page body → SOP doc linked to it; Asset Library rows → Library docs (Drive files stay as links). Owner → a single role for now. Notion read-only after.

Migrations start at **0117** (0114–0116 are held by the open asset-register PRs).

## Tenancy rules (every phase)

- Every new table carries `companyId NOT NULL`; every query filters on it at the storage layer, not only the route.
- Cross-reference checks: a task's `sopDocId`, a workflow's template ids, a doc's folder — must all belong to the caller's company (shadowed-route + id-guessing traps from the tenant audit).
- Starter pack = copies with the new company's id.
- Clients/trades never see Operations or Library.

## Open question

- **Operational tasks vs task templates were meant to be different things.** Proposed split: *Tasks* = the definitions (authoring), *Overview* = the operating view (who's got what, default diaries, overdue). Same data, two lenses. Confirm, or describe the original difference.
