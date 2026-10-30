// Operations starter pack: a generic set of SOPs and operational tasks any
// residential builder can start from. Nothing here belongs to one company —
// installing COPIES every item into the caller's company with its own id, so
// a company's edits never reach anyone else, and the pack can change without
// touching what companies already have.
//
// What a company gets:
//   - SOPs land as DRAFT. Nobody has signed them off for this business yet,
//     so they show "not approved yet" until someone with approve permission
//     reads and approves them.
//   - Tasks land INACTIVE and unassigned. Roles differ per company, and an
//     active recurring template with nobody on it would just generate noise.
//     Turning one on is a deliberate act in Operations → Tasks.
//
// Item keys are permanent. To change the pack, ADD items with new keys and
// bump STARTER_PACK_VERSION; never rename a key, or companies that already
// have it would be offered a second copy.

import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import * as schema from "@shared/schema";

export const STARTER_PACK_VERSION = 1;

type StarterFolder = { key: string; name: string; sortOrder: number };
type StarterDoc = { key: string; folderKey: string; docType: "sop" | "checklist" | "policy"; title: string; html: string };
type StarterTask = {
  key: string;
  title: string;
  goal: string;
  sopKey: string;
  category: string;
  // Only daily and weekly recur: that is all the generator understands
  // (server/utils/recurringTasks.ts reads recurringDays only).
  frequency: "daily" | "weekly";
  days: number[]; // 0 = Sunday … 6 = Saturday
  startTime: string; // HH:MM
  minutes: number;
  checklist: string[];
};

export const STARTER_FOLDERS: StarterFolder[] = [
  { key: "folder.accounts", name: "Accounts", sortOrder: 0 },
  { key: "folder.site", name: "Site", sortOrder: 1 },
  { key: "folder.safety", name: "Safety", sortOrder: 2 },
  { key: "folder.clients", name: "Clients", sortOrder: 3 },
];

export const STARTER_DOCS: StarterDoc[] = [
  {
    key: "sop.weekly-bills-review",
    folderKey: "folder.accounts",
    docType: "sop",
    title: "Weekly bills review",
    html: `<h2>Purpose</h2>
<p>Every supplier and subcontractor bill is checked, coded to the right job and approved (or queried) within a week of arriving, so job costs are current and nobody is paid for work that wasn't done.</p>
<h2>When</h2>
<p>Every Monday morning, before the week's payment run.</p>
<h2>Steps</h2>
<ol>
<li>Open Bills and filter to bills awaiting review.</li>
<li>For each bill, check the supplier, invoice number, date and total against the PDF.</li>
<li>Check it is on the right project and cost code. Split it across codes if it covers more than one.</li>
<li>Match it to its purchase order where there is one. Query any amount over the PO before approving.</li>
<li>Check GST: the bill's GST should be 1/11 of the total for a taxable supply. Flag any bill without an ABN.</li>
<li>Approve the bills that are right. For the rest, add a note saying what's wrong and who you've asked.</li>
<li>Look for duplicates: same supplier, same invoice number, or the same amount on the same day.</li>
</ol>
<h2>Done when</h2>
<ul>
<li>No bill older than seven days is still awaiting review.</li>
<li>Every queried bill has a note and an owner.</li>
</ul>`,
  },
  {
    key: "sop.supplier-statement-reconciliation",
    folderKey: "folder.accounts",
    docType: "sop",
    title: "Supplier statement reconciliation",
    html: `<h2>Purpose</h2>
<p>Each month, every supplier's statement agrees with the bills we hold, so missing bills, double entries and unapplied credits are found before they turn into overpayments or overdue accounts.</p>
<h2>When</h2>
<p>In the first week of each month, once statements for the previous month have arrived.</p>
<h2>Steps</h2>
<ol>
<li>Collect the month's statements from the accounts inbox.</li>
<li>For each supplier, list the invoices and credits on the statement next to the bills recorded for that supplier.</li>
<li>Any invoice on the statement that we don't have: request a copy and enter it.</li>
<li>Any bill we have that isn't on the statement: check whether it was already paid, or entered twice.</li>
<li>Check credits on the statement have been entered and applied.</li>
<li>Check payments on the statement match the payments we made, by date and amount.</li>
<li>Record the reconciled closing balance and the date you checked it.</li>
</ol>
<h2>Done when</h2>
<ul>
<li>Every supplier's balance agrees, or each difference is listed with a reason and a follow-up.</li>
</ul>`,
  },
  {
    key: "sop.timesheet-approval",
    folderKey: "folder.accounts",
    docType: "sop",
    title: "Timesheet approval",
    html: `<h2>Purpose</h2>
<p>Labour is approved against the right job and cost code every week, so payroll is right and job costs include labour while it still matters.</p>
<h2>When</h2>
<p>Every Monday, for the week just ended.</p>
<h2>Steps</h2>
<ol>
<li>Open Timesheets and filter to the previous week, awaiting approval.</li>
<li>Check each person's hours against the site diary and what you know of the week.</li>
<li>Check each entry is on the right project and cost code. Split days that covered two jobs.</li>
<li>Query anything unusual (long days, weekend work, a job the person wasn't on) before approving.</li>
<li>Approve the rest.</li>
<li>Chase anyone who hasn't submitted.</li>
</ol>
<h2>Done when</h2>
<ul>
<li>Every timesheet for the week is approved or has an open query.</li>
</ul>`,
  },
  {
    key: "sop.weekly-site-inspection",
    folderKey: "folder.site",
    docType: "sop",
    title: "Weekly site inspection",
    html: `<h2>Purpose</h2>
<p>Each active site is walked once a week by the person responsible for it, so quality, safety and progress problems are seen early and written down.</p>
<h2>When</h2>
<p>Every Friday, on every site with work in progress.</p>
<h2>Steps</h2>
<ol>
<li>Walk the whole site, inside and out.</li>
<li>Check the work done this week against the plans, specification and any approved variations.</li>
<li>Note defects, with a photo and who needs to fix them.</li>
<li>Check site safety: fencing and signage, edge protection, scaffold tags, housekeeping, amenities, first aid kit.</li>
<li>Check progress against the programme. Note anything that will hold up next week's trades.</li>
<li>Check deliveries and materials on site are protected and stored safely.</li>
<li>Write it up in the site diary with photos, and raise tasks for every defect.</li>
</ol>
<h2>Done when</h2>
<ul>
<li>A diary entry exists for the inspection, and every defect found has a task with an owner.</li>
</ul>`,
  },
  {
    key: "sop.daily-site-diary",
    folderKey: "folder.site",
    docType: "sop",
    title: "Daily site diary",
    html: `<h2>Purpose</h2>
<p>A record of every working day on every site: who was there, what was done, and anything that went wrong. It is the evidence for delays, variations and disputes, so it has to be written on the day.</p>
<h2>When</h2>
<p>Before leaving site, every working day.</p>
<h2>What to record</h2>
<ul>
<li>Weather, and any time lost to it.</li>
<li>Trades and workers on site.</li>
<li>Work done today.</li>
<li>Deliveries received, and anything missing or damaged.</li>
<li>Visitors and inspections (certifier, council, client).</li>
<li>Instructions given or received, especially from the client.</li>
<li>Incidents, near misses and hazards.</li>
<li>Photos of progress.</li>
</ul>
<h2>Done when</h2>
<ul>
<li>Today's entry is saved, with photos.</li>
</ul>`,
  },
  {
    key: "sop.toolbox-talk",
    folderKey: "folder.safety",
    docType: "sop",
    title: "Toolbox talk",
    html: `<h2>Purpose</h2>
<p>A short safety meeting on site at the start of each week, so everyone knows this week's hazards and has had the chance to raise their own.</p>
<h2>When</h2>
<p>Monday morning, before work starts. Hold an extra one whenever the work or the site changes a lot.</p>
<h2>Steps</h2>
<ol>
<li>Gather everyone on site, including subcontractors.</li>
<li>Run through this week's work and its main hazards (heights, excavations, plant, electrical, hot works, manual handling).</li>
<li>Cover any incident or near miss since the last talk, and what changes because of it.</li>
<li>Check everyone has the PPE and inductions the work needs.</li>
<li>Ask for hazards or concerns from the group, and agree who will deal with each.</li>
<li>Record the topic, the attendees and the actions, and have attendees sign.</li>
</ol>
<h2>Done when</h2>
<ul>
<li>The talk is recorded with attendees, and every action has an owner.</li>
</ul>`,
  },
  {
    key: "checklist.site-induction",
    folderKey: "folder.safety",
    docType: "checklist",
    title: "Site induction checklist",
    html: `<p>Every person starting on site is inducted before they start work. Keep a signed record for each person.</p>
<ul>
<li>Name, company and contact number recorded</li>
<li>White card (general construction induction) sighted</li>
<li>Trade licence and insurance sighted, where relevant</li>
<li>Site layout: entry and exit, amenities, first aid kit, fire extinguishers, assembly point</li>
<li>Emergency procedures and site contact</li>
<li>Site rules: hours, PPE, smoking, parking, housekeeping</li>
<li>Known site hazards and controls for their work</li>
<li>How to report incidents, injuries and hazards</li>
<li>Safe work method statement received for high-risk work</li>
<li>Signed by the worker and the person giving the induction</li>
</ul>`,
  },
  {
    key: "sop.weekly-client-update",
    folderKey: "folder.clients",
    docType: "sop",
    title: "Weekly client update",
    html: `<h2>Purpose</h2>
<p>Every client hears from us at least once a week, so they always know where their build is up to and what decisions are coming, and never have to chase us.</p>
<h2>When</h2>
<p>Every Friday afternoon, for every active job.</p>
<h2>What to include</h2>
<ol>
<li>What was done this week, with two or three good photos.</li>
<li>What's planned for next week.</li>
<li>Any decisions or selections we need from them, and the date we need them by.</li>
<li>Any variations raised or awaiting their approval.</li>
<li>Anything that has changed the programme, and why.</li>
</ol>
<h2>Done when</h2>
<ul>
<li>Every active job's client has had an update this week, and any decision we need is in writing with a due date.</li>
</ul>`,
  },
  {
    key: "sop.variations",
    folderKey: "folder.clients",
    docType: "sop",
    title: "Variations",
    html: `<h2>Purpose</h2>
<p>Every change to the contracted work is priced and approved in writing by the client before the work is done, so the contract price stays clear and nobody argues about it at the end.</p>
<h2>When</h2>
<p>As soon as a change is asked for, by the client, a consultant or because of something found on site.</p>
<h2>Steps</h2>
<ol>
<li>Write down what is changing and why, with drawings or photos.</li>
<li>Price it: materials, labour, subcontractors and margin. Include any time it adds to the programme.</li>
<li>Send the variation to the client for approval.</li>
<li>Don't start the varied work until it is approved, unless it is urgent for safety. If it is, record the instruction in the site diary and send the variation the same day.</li>
<li>Once approved, update the job budget, programme and purchase orders.</li>
<li>Claim it in the next progress claim.</li>
</ol>
<h2>Done when</h2>
<ul>
<li>The variation is approved in writing and included in the contract total.</li>
</ul>`,
  },
];

export const STARTER_TASKS: StarterTask[] = [
  {
    key: "task.weekly-bills-review",
    title: "Weekly bills review",
    goal: "Every bill checked, coded and approved or queried within a week.",
    sopKey: "sop.weekly-bills-review",
    category: "Accounts",
    frequency: "weekly",
    days: [1],
    startTime: "08:30",
    minutes: 60,
    checklist: ["Review every bill awaiting approval", "Match bills to purchase orders", "Note and chase every query", "Check for duplicates"],
  },
  {
    key: "task.timesheet-approval",
    title: "Approve last week's timesheets",
    goal: "Every timesheet approved or queried before payroll.",
    sopKey: "sop.timesheet-approval",
    category: "Accounts",
    frequency: "weekly",
    days: [1],
    startTime: "09:30",
    minutes: 30,
    checklist: ["Check hours against the site diary", "Check projects and cost codes", "Query anything unusual", "Chase missing timesheets"],
  },
  {
    key: "task.weekly-site-inspection",
    title: "Weekly site inspection",
    goal: "Every active site walked, written up and its defects assigned.",
    sopKey: "sop.weekly-site-inspection",
    category: "Site",
    frequency: "weekly",
    days: [5],
    startTime: "07:30",
    minutes: 60,
    checklist: ["Walk the whole site", "Check work against plans and variations", "Photograph and assign defects", "Check site safety", "Write it up in the site diary"],
  },
  {
    key: "task.daily-site-diary",
    title: "Site diary entry",
    goal: "Today's diary written before leaving site.",
    sopKey: "sop.daily-site-diary",
    category: "Site",
    frequency: "daily",
    days: [1, 2, 3, 4, 5],
    startTime: "15:30",
    minutes: 15,
    checklist: ["Weather and trades on site", "Work done and deliveries", "Visitors and instructions", "Incidents and hazards", "Photos"],
  },
  {
    key: "task.toolbox-talk",
    title: "Toolbox talk",
    goal: "Everyone on site knows this week's hazards.",
    sopKey: "sop.toolbox-talk",
    category: "Safety",
    frequency: "weekly",
    days: [1],
    startTime: "07:00",
    minutes: 15,
    checklist: ["Run through this week's work and hazards", "Cover incidents since last talk", "Check PPE and inductions", "Record attendees and actions"],
  },
  {
    key: "task.weekly-client-update",
    title: "Weekly client update",
    goal: "Every active client hears from us this week.",
    sopKey: "sop.weekly-client-update",
    category: "Clients",
    frequency: "weekly",
    days: [5],
    startTime: "14:00",
    minutes: 45,
    checklist: ["This week's progress with photos", "Next week's plan", "Decisions needed and due dates", "Variations awaiting approval"],
  },
];

function htmlToText(html: string): string {
  return html
    .replace(/<\/(p|li|h2)>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export type StarterPackStatus = {
  version: number;
  total: { docs: number; tasks: number };
  available: { docs: number; tasks: number };
};

// How much of the pack this company hasn't been given yet. An item counts as
// given once installed, even if the company has since deleted its copy.
export async function getStarterPackStatus(companyId: string): Promise<StarterPackStatus> {
  const rows = await db.select({ itemKey: schema.operationsStarterInstalls.itemKey })
    .from(schema.operationsStarterInstalls)
    .where(eq(schema.operationsStarterInstalls.companyId, companyId));
  const have = new Set(rows.map((r) => r.itemKey));
  return {
    version: STARTER_PACK_VERSION,
    total: { docs: STARTER_DOCS.length, tasks: STARTER_TASKS.length },
    available: {
      docs: STARTER_DOCS.filter((d) => !have.has(d.key)).length,
      tasks: STARTER_TASKS.filter((t) => !have.has(t.key)).length,
    },
  };
}

export type StarterPackResult = { folders: number; docs: number; tasks: number };

// Copies every pack item the company doesn't have yet. Safe to call twice, or
// twice at once: items are claimed by inserting their install rows first
// (unique on company + key), and only the rows this call actually inserted
// get a copy. Ids are generated up front so the whole install is a handful of
// batched statements — one per table — not a round trip per item.
export async function installStarterPack(
  companyId: string,
  user: { id: string; name: string },
): Promise<StarterPackResult> {
  return db.transaction(async (tx) => {
    const T = schema.operationsStarterInstalls;
    const planned = [
      ...STARTER_FOLDERS.map((i) => ({ key: i.key, kind: "folder" })),
      ...STARTER_DOCS.map((i) => ({ key: i.key, kind: "doc" })),
      ...STARTER_TASKS.map((i) => ({ key: i.key, kind: "task" })),
    ].map((i) => ({ ...i, id: randomUUID() }));

    const claimed = await tx.insert(T)
      .values(planned.map((i) => ({ companyId, itemKey: i.key, kind: i.kind, targetId: i.id, packVersion: STARTER_PACK_VERSION })))
      .onConflictDoNothing()
      .returning({ itemKey: T.itemKey, targetId: T.targetId });
    const mine = new Map(claimed.map((r) => [r.itemKey, r.targetId!]));
    if (mine.size === 0) return { folders: 0, docs: 0, tasks: 0 };

    // Parents (folders for docs, SOPs for tasks) resolve to this company's
    // copy, whether made now or in an earlier install. A copy the company has
    // since deleted resolves to nothing, so the child lands unfiled / without
    // an SOP rather than pointing at a dead id.
    const needsEarlier = STARTER_DOCS.some((d) => mine.has(d.key) && !mine.has(d.folderKey))
      || STARTER_TASKS.some((t) => mine.has(t.key) && !mine.has(t.sopKey));
    const parentIds = new Map<string, string>();
    mine.forEach((id, key) => parentIds.set(key, id));
    if (needsEarlier) {
      const earlier = await tx.select({ itemKey: T.itemKey, targetId: T.targetId, kind: T.kind }).from(T)
        .where(and(eq(T.companyId, companyId), inArray(T.kind, ["folder", "doc"])));
      const folderIds = earlier.filter((r) => r.kind === "folder" && r.targetId && !mine.has(r.itemKey)).map((r) => r.targetId!);
      const docIds = earlier.filter((r) => r.kind === "doc" && r.targetId && !mine.has(r.itemKey)).map((r) => r.targetId!);
      const [liveFolders, liveDocs] = await Promise.all([
        folderIds.length
          ? tx.select({ id: schema.docFolders.id }).from(schema.docFolders)
              .where(and(eq(schema.docFolders.companyId, companyId), inArray(schema.docFolders.id, folderIds)))
          : Promise.resolve([]),
        docIds.length
          ? tx.select({ id: schema.docs.id }).from(schema.docs)
              .where(and(eq(schema.docs.companyId, companyId), inArray(schema.docs.id, docIds)))
          : Promise.resolve([]),
      ]);
      const live = new Set([...liveFolders, ...liveDocs].map((r) => r.id));
      for (const r of earlier) {
        if (r.targetId && live.has(r.targetId)) parentIds.set(r.itemKey, r.targetId);
      }
    }

    const folders = STARTER_FOLDERS.filter((f) => mine.has(f.key));
    const docs = STARTER_DOCS.filter((d) => mine.has(d.key));
    const tasks = STARTER_TASKS.filter((t) => mine.has(t.key));

    // In dependency order: docs reference folders, tasks reference docs.
    if (folders.length) {
      await tx.insert(schema.docFolders).values(folders.map((f) => ({
        id: mine.get(f.key)!,
        companyId,
        name: f.name,
        parentFolderId: null,
        sortOrder: f.sortOrder,
      })));
    }
    if (docs.length) {
      await tx.insert(schema.docs).values(docs.map((d) => ({
        id: mine.get(d.key)!,
        companyId,
        folderId: parentIds.get(d.folderKey) ?? null,
        title: d.title,
        contentHtml: d.html,
        contentText: htmlToText(d.html),
        ownerId: user.id,
        ownerName: user.name,
        docType: d.docType,
        status: "draft",
      })));
    }
    if (tasks.length) {
      await tx.insert(schema.taskTemplates).values(tasks.map((t) => ({
        id: mine.get(t.key)!,
        companyId,
        scope: "business",
        title: t.title,
        goal: t.goal,
        assigneeType: "role",
        frequency: t.frequency,
        dueDayOfWeek: t.frequency === "weekly" ? t.days : [],
        dueTime: t.startTime,
        isRecurringTemplate: true,
        recurringDays: t.days,
        recurringSchedule: t.days.map((dayOfWeek) => ({ dayOfWeek, startTime: t.startTime, duration: t.minutes })),
        estimatedDuration: t.minutes,
        checklist: t.checklist.map((text) => ({ text, completed: false })),
        externalLinks: [],
        sopDocId: parentIds.get(t.sopKey) ?? null,
        isActive: false,
        category: t.category,
        createdBy: user.id,
        createdByName: user.name,
      })));
    }

    return { folders: folders.length, docs: docs.length, tasks: tasks.length };
  });
}
