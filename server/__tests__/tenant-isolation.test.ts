/**
 * Cross-tenant isolation integration tests.
 *
 * Verifies that the server-side ownership checks added for the estimate /
 * selection / schedule by-id routes (enforceProjectCompany) and the checklist
 * template / group / item routes (getOwnedTemplate / getOwnedGroup /
 * getOwnedItem) actually prevent one company from reading or mutating another
 * company's data:
 *   - a user in company B gets 404 when targeting company A's record (we return
 *     404 rather than 403 so the existence of another tenant's record is never
 *     confirmed to an outside caller)
 *   - any user gets 404 when targeting a non-existent id
 *   - created / imported / duplicated checklist templates are stamped with the
 *     caller's companyId
 *
 * The test boots the real Express app (registerRoutes) on an ephemeral port
 * with NODE_ENV=test so authentication and the ownership guards are strictly
 * enforced (the development auth bypass only fires for NODE_ENV=development,
 * and the production DB guard only fires for NODE_ENV=production — so "test"
 * gives us strict auth against the dev database). It creates two companies with
 * their own users + records directly through the storage layer, logs in over
 * HTTP, and exercises every protected route as company B.
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/tenant-isolation.test.ts
 *
 * NOTE: this is an integration test — it talks to the same database the dev
 * server uses. All rows it creates are namespaced to two throwaway companies
 * and are deleted again in the cleanup phase.
 */

process.env.NODE_ENV = process.env.NODE_ENV || "test";

import express from "express";
import assert from "node:assert";
import { registerRoutes } from "../routes";
import { storage } from "../storage";
import { pool } from "../db";

const NONE = "00000000-0000-0000-0000-000000000000";

let baseUrl = "";
let httpServer: any = null;

// ---------------------------------------------------------------------------
// Tiny test harness (custom, so we control process exit — the session store's
// internal prune timer + pg pool would otherwise keep node:test from exiting).
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (err: any) {
    failed++;
    failures.push(name);
    console.error(`  \u2717 ${name}\n      ${err?.message || err}`);
  }
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
function extractCookie(res: Response): string | null {
  const setCookies = (res.headers as any).getSetCookie?.() ?? [];
  for (const c of setCookies) {
    if (c.startsWith("connect.sid=")) return c.split(";")[0];
  }
  return null;
}

async function api(
  method: string,
  path: string,
  opts: { cookie?: string | null; body?: any } = {},
): Promise<{ status: number; body: any; raw: Response }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      // Required: cookie is `secure` + app uses `trust proxy`, so express-session
      // only issues / accepts the session cookie when it believes the connection
      // is HTTPS. Spoof the proxy header so the session is established over the
      // plain-HTTP test connection.
      "X-Forwarded-Proto": "https",
      ...(opts.cookie ? { Cookie: opts.cookie } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, raw: res };
}

interface Tenant {
  userId: string;
  email: string;
  password: string;
  companyId: string;
  cookie: string;
}

async function createTenant(label: string): Promise<Tenant> {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `tenant-test-${label}-${unique}@tenanttest.local`;
  const password = "TenantTest123!";

  const reg = await api("POST", "/api/auth/register", {
    body: { email, password, firstName: label, lastName: "TenantTest" },
  });
  assert.strictEqual(reg.status, 200, `register ${label} failed: ${JSON.stringify(reg.body)}`);
  const userId = reg.body.user.id;

  // Attaching a company also assigns the user the General Manager (admin) role,
  // which clears requirePermission gates so the ownership checks are what's
  // actually under test.
  const company = await storage.createCompany(
    { name: `Tenant Test Co ${label} ${unique}` } as any,
    userId,
  );

  const login = await api("POST", "/api/auth/login", { body: { email, password } });
  assert.strictEqual(login.status, 200, `login ${label} failed: ${JSON.stringify(login.body)}`);
  const cookie = extractCookie(login.raw);
  assert.ok(cookie, `no session cookie for ${label}`);

  return { userId, email, password, companyId: company.id, cookie: cookie! };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: false }));
  httpServer = await registerRoutes(app);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = httpServer.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;

  console.log(`\nCross-tenant isolation tests (server on ${baseUrl})\n`);

  const A = await createTenant("A");
  const B = await createTenant("B");

  // --- Company A's records (the "victim" data B will try to reach) ---
  const projectA = await storage.createProject({
    name: "Tenant A Project",
    companyId: A.companyId,
    ownerId: A.userId,
    projectSubStatus: "lead_new",
  } as any);
  const estimateA = await storage.createEstimate({ name: "Estimate A", projectId: projectA.id } as any);
  const selectionA = await storage.createSelection({ name: "Selection A", projectId: projectA.id } as any);
  const scheduleA = await storage.createSchedule({ projectId: projectA.id } as any);
  const templateA = await storage.createChecklistTemplate({
    name: "Template A",
    type: "Job",
    companyId: A.companyId,
  } as any);
  const groupA = await storage.createChecklistTemplateGroup({ templateId: templateA.id, name: "Group A" } as any);
  const itemA = await storage.createChecklistTemplateItem({ groupId: groupA.id, description: "Item A" } as any);

  // Financial / sub-resource records owned by company A (the second wave of
  // by-id routes hardened in this audit: bills, variations, client invoices,
  // proposals, RFQs).
  const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const billA = await storage.createBill({
    billNumber: `TT-BILL-A-${uniq}`,
    companyId: A.companyId,
    projectId: projectA.id,
    billDate: new Date(),
  } as any);
  // A bill genuinely owned by company B — used to prove the parent/child IDOR is
  // closed: B owns billB but cannot mutate A's line item by passing its id.
  const billB = await storage.createBill({
    billNumber: `TT-BILL-B-${uniq}`,
    companyId: B.companyId,
    billDate: new Date(),
  } as any);
  const variationA = await storage.createVariation({
    variationNumber: `TT-VO-A-${uniq}`,
    projectId: projectA.id,
    name: "Variation A",
  } as any);
  const clientInvoiceA = await storage.createClientInvoice({
    name: "Client Invoice A",
    projectId: projectA.id,
    invoiceDate: new Date(),
  } as any);
  const proposalA = await storage.createProposal({
    proposalNumber: `TT-PROP-A-${uniq}`,
    name: "Proposal A",
    projectId: projectA.id,
  } as any);
  const rfqA = await storage.createRFQ({
    rfqNumber: `TT-RFQ-A-${uniq}`,
    projectId: projectA.id,
    companyId: A.companyId,
    title: "RFQ A",
    createdBy: A.userId,
    createdByName: "Tenant A",
  } as any);
  const rfiA = await storage.createRFI(
    { projectId: projectA.id, subject: "RFI A", question: "Q A", directedToType: "client" } as any,
    A.companyId,
    A.userId,
    "Tenant A",
  );
  // Bill payment owned by A (via billA). Cross-tenant void/delete must 404.
  const billPaymentA = await storage.createBillPayment({
    billId: billA.id,
    amount: 100,
    paymentDate: new Date(),
  } as any);

  // Deeply-nested sub-resources owned by company A. These are reached by id
  // only (no project/company in the path), so they must resolve ownership via
  // their parent (variation / bill line item / proposal) before mutating.
  const variationItemA = await storage.createVariationItem({
    variationId: variationA.id,
    description: "Variation Item A",
    quantity: 1,
    unitPrice: 100,
    totalPrice: 100,
  } as any);
  const estimateItemA = await storage.createEstimateItem({
    estimateId: estimateA.id,
    name: "Estimate Item A",
  } as any);
  const billLineItemA = await storage.createBillLineItem({
    billId: billA.id,
    description: "Bill Line Item A",
    quantity: 1,
    unitPrice: 100,
  } as any);
  const billLineItemAllowanceA = await storage.createBillLineItemAllowance({
    billLineItemId: billLineItemA.id,
    estimateItemId: estimateItemA.id,
    amount: 100,
  } as any);
  const proposalSectionA = await storage.createProposalSection({
    proposalId: proposalA.id,
    name: "Proposal Section A",
  } as any);
  const proposalItemA = await storage.createProposalItem({
    proposalId: proposalA.id,
    name: "Proposal Item A",
  } as any);
  const proposalMilestoneA = await storage.createProposalPaymentMilestone({
    proposalId: proposalA.id,
    name: "Proposal Milestone A",
  } as any);

  // --- by-id resource families hardened in earlier sessions (suppliers,
  //     defects, minutes, docs, tasks, site-diary entries, timesheets,
  //     schedule-items). Each is reached by id only and resolves ownership via
  //     a getOwned* helper, so we cover them here to keep the whole audited
  //     surface under test. ---
  const supplierA = await storage.createSupplier({
    name: "Supplier A",
    companyId: A.companyId,
  } as any);
  const defectA = await storage.createDefect({
    projectId: projectA.id,
    title: "Defect A",
  } as any);
  const minuteA = await storage.createMinute({
    title: "Minute A",
    meetingDate: new Date(),
    projectId: projectA.id,
  } as any);
  const docA = await storage.createDoc({
    companyId: A.companyId,
    title: "Doc A",
  } as any);
  const taskA = await storage.createTask({
    companyId: A.companyId,
    title: "Task A",
    content: "Task A content",
    author: "Tenant A",
    type: "task",
    taskContextType: "project",
    taskContextId: projectA.id,
  } as any);
  const timesheetA = await storage.createTimesheet({
    userId: A.userId,
    projectId: projectA.id,
    date: new Date(),
  } as any);
  const siteDiaryTemplateA = await storage.createSiteDiaryTemplate({
    companyId: A.companyId,
    name: "Site Diary Template A",
    fields: [],
  } as any);
  const siteDiaryEntryA = await storage.createSiteDiaryEntry({
    templateId: siteDiaryTemplateA.id,
    projectId: projectA.id,
    title: "Site Diary Entry A",
    entryDateTime: new Date(),
    fieldValues: {},
  } as any);
  const scheduleItemA = await storage.createScheduleItem({
    scheduleId: scheduleA.id,
    name: "Schedule Item A",
    startDate: new Date(),
    endDate: new Date(),
  } as any);

  // --- Company B owns its own template/group so we can prove that even when
  //     the *source* is owned, a cross-tenant *target* is rejected. ---
  const templateB = await storage.createChecklistTemplate({
    name: "Template B",
    type: "Job",
    companyId: B.companyId,
  } as any);
  const groupB = await storage.createChecklistTemplateGroup({ templateId: templateB.id, name: "Group B" } as any);

  // Helper: assert a route returns 404 for A's record (cross-tenant access is
  // masked as "not found") and 404 for a missing id, when called as company B.
  async function crossTenant(
    label: string,
    method: string,
    pathForA: string,
    pathForMissing: string,
    body?: any,
  ) {
    await test(`${label}: company B \u2192 404 on company A's record`, async () => {
      const r = await api(method, pathForA, { cookie: B.cookie, body });
      assert.strictEqual(r.status, 404, `expected 404, got ${r.status}: ${JSON.stringify(r.body)}`);
    });
    await test(`${label}: \u2192 404 on non-existent id`, async () => {
      const r = await api(method, pathForMissing, { cookie: B.cookie, body });
      assert.strictEqual(r.status, 404, `expected 404, got ${r.status}: ${JSON.stringify(r.body)}`);
    });
  }

  // Positive control: company A reaches/mutates its OWN record successfully.
  // Proves the new ownership guards don't break legitimate same-company access.
  async function controlOk(
    label: string,
    method: string,
    pathForA: string,
    body?: any,
  ) {
    await test(`control: company A can ${label} its own record`, async () => {
      const r = await api(method, pathForA, { cookie: A.cookie, body });
      assert.ok(
        r.status >= 200 && r.status < 300,
        `expected 2xx, got ${r.status}: ${JSON.stringify(r.body)}`,
      );
    });
  }

  try {
    // ---- Positive controls: company A reaches its own data ----
    await test("control: company A can GET its own estimate", async () => {
      const r = await api("GET", `/api/estimates/${estimateA.id}`, { cookie: A.cookie });
      assert.strictEqual(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    });
    await test("control: company A can GET its own checklist template", async () => {
      const r = await api("GET", `/api/checklist-templates/${templateA.id}`, { cookie: A.cookie });
      assert.strictEqual(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    });
    await test("control: unauthenticated request is rejected (401)", async () => {
      const r = await api("GET", `/api/estimates/${estimateA.id}`);
      assert.strictEqual(r.status, 401, `expected 401, got ${r.status}: ${JSON.stringify(r.body)}`);
    });

    // Same-company positive controls for every audited resource family: prove
    // the ownership guards return 2xx for the legitimate owner (no regressions).
    await controlOk("GET /api/bills/:id", "GET", `/api/bills/${billA.id}`);
    await controlOk("GET /api/bills/:id/line-item-allowances", "GET", `/api/bills/${billA.id}/line-item-allowances`);
    await controlOk("PATCH /api/bills/:billId/line-items/:id", "PATCH", `/api/bills/${billA.id}/line-items/${billLineItemA.id}`, { description: "A's line edit" });
    await controlOk("PATCH /api/bill-line-item-allowances/:id", "PATCH", `/api/bill-line-item-allowances/${billLineItemAllowanceA.id}`, { amount: 123 });
    await controlOk("GET /api/variations/:id", "GET", `/api/variations/${variationA.id}`);
    await controlOk("GET /api/variations/:id/items", "GET", `/api/variations/${variationA.id}/items`);
    await controlOk("PATCH /api/variation-items/:id", "PATCH", `/api/variation-items/${variationItemA.id}`, { description: "A's edit" });
    await controlOk("GET /api/client-invoices/:id", "GET", `/api/client-invoices/${clientInvoiceA.id}`);
    await controlOk("GET /api/proposals/:id", "GET", `/api/proposals/${proposalA.id}`);
    await controlOk("GET /api/proposals/:id/sections", "GET", `/api/proposals/${proposalA.id}/sections`);
    await controlOk("PATCH /api/proposal-sections/:id", "PATCH", `/api/proposal-sections/${proposalSectionA.id}`, { name: "A's section" });
    await controlOk("PATCH /api/proposal-items/:id", "PATCH", `/api/proposal-items/${proposalItemA.id}`, { name: "A's item" });
    await controlOk("PATCH /api/proposal-milestones/:id", "PATCH", `/api/proposal-milestones/${proposalMilestoneA.id}`, { name: "A's milestone" });
    await controlOk("GET /api/rfqs/:id/items", "GET", `/api/rfqs/${rfqA.id}/items`);
    await controlOk("GET /api/rfis/:id", "GET", `/api/rfis/${rfiA.id}`);
    await controlOk("PATCH /api/rfis/:id", "PATCH", `/api/rfis/${rfiA.id}`, { subject: "RFI A edit" });
    await controlOk("GET /api/rfis/:rfiId/comments", "GET", `/api/rfis/${rfiA.id}/comments`);
    await controlOk("PATCH /api/projects/:id", "PATCH", `/api/projects/${projectA.id}`, { clientName: "A's client" });
    // Prior-session by-id families: same-company owner still reaches its data.
    await controlOk("GET /api/suppliers/:id", "GET", `/api/suppliers/${supplierA.id}`);
    await controlOk("PATCH /api/suppliers/:id", "PATCH", `/api/suppliers/${supplierA.id}`, { name: "Supplier A edit" });
    await controlOk("GET /api/defects/:id", "GET", `/api/defects/${defectA.id}`);
    await controlOk("PATCH /api/defects/:id", "PATCH", `/api/defects/${defectA.id}`, { title: "Defect A edit" });
    await controlOk("GET /api/minutes/:id", "GET", `/api/minutes/${minuteA.id}`);
    await controlOk("PATCH /api/minutes/:id", "PATCH", `/api/minutes/${minuteA.id}`, { title: "Minute A edit" });
    await controlOk("GET /api/docs/:id", "GET", `/api/docs/${docA.id}`);
    await controlOk("PATCH /api/docs/:id", "PATCH", `/api/docs/${docA.id}`, { title: "Doc A edit" });
    await controlOk("GET /api/tasks/:id", "GET", `/api/tasks/${taskA.id}`);
    await controlOk("PATCH /api/tasks/:id", "PATCH", `/api/tasks/${taskA.id}`, { title: "Task A edit" });
    await controlOk("PATCH /api/tasks/:id/status", "PATCH", `/api/tasks/${taskA.id}/status`, { status: "in-progress" });
    await controlOk("GET /api/timesheets/:id", "GET", `/api/timesheets/${timesheetA.id}`);
    await controlOk("PATCH /api/timesheets/:id", "PATCH", `/api/timesheets/${timesheetA.id}`, { description: "Timesheet A edit" });
    await controlOk("GET /api/site-diary-entries/:id", "GET", `/api/site-diary-entries/${siteDiaryEntryA.id}`);
    await controlOk("PATCH /api/site-diary-entries/:id", "PATCH", `/api/site-diary-entries/${siteDiaryEntryA.id}`, { title: "Site Diary Entry A edit" });
    await controlOk("GET /api/schedule-items/:id", "GET", `/api/schedule-items/${scheduleItemA.id}`);
    await controlOk("PATCH /api/schedule-items/:id", "PATCH", `/api/schedule-items/${scheduleItemA.id}`, { name: "Schedule Item A edit" });

    // ---- Projects (enforceProjectCompany; gate applies to ANY patch) ----
    // Includes a name-less patch to prove the gate fires outside the name branch.
    await crossTenant("PATCH /api/projects/:id (no name)", "PATCH", `/api/projects/${projectA.id}`, `/api/projects/${NONE}`, { clientName: "hacked" });
    await crossTenant("PATCH /api/projects/:id (rename)", "PATCH", `/api/projects/${projectA.id}`, `/api/projects/${NONE}`, { name: "hacked" });

    // ---- Estimates (enforceProjectCompany) ----
    await crossTenant("GET /api/estimates/:id", "GET", `/api/estimates/${estimateA.id}`, `/api/estimates/${NONE}`);
    await crossTenant("PATCH /api/estimates/:id", "PATCH", `/api/estimates/${estimateA.id}`, `/api/estimates/${NONE}`, { notes: "hacked" });
    await crossTenant("DELETE /api/estimates/:id", "DELETE", `/api/estimates/${estimateA.id}`, `/api/estimates/${NONE}`);

    // ---- Selections (enforceProjectCompany) ----
    await crossTenant("GET /api/selections/:id", "GET", `/api/selections/${selectionA.id}`, `/api/selections/${NONE}`);
    await crossTenant("PATCH /api/selections/:id", "PATCH", `/api/selections/${selectionA.id}`, `/api/selections/${NONE}`, { notes: "hacked" });
    await crossTenant("DELETE /api/selections/:id", "DELETE", `/api/selections/${selectionA.id}`, `/api/selections/${NONE}`);

    // ---- Schedules (enforceProjectCompany) ----
    await crossTenant("PATCH /api/schedules/:id", "PATCH", `/api/schedules/${scheduleA.id}`, `/api/schedules/${NONE}`, { notes: "hacked" });
    await crossTenant("PATCH /api/schedules/:id/working-days", "PATCH", `/api/schedules/${scheduleA.id}/working-days`, `/api/schedules/${NONE}/working-days`, { includeSaturday: true });
    await crossTenant("PUT /api/schedules/:id/status", "PUT", `/api/schedules/${scheduleA.id}/status`, `/api/schedules/${NONE}/status`, { status: "online" });
    await crossTenant("PATCH /api/schedules/:id/online", "PATCH", `/api/schedules/${scheduleA.id}/online`, `/api/schedules/${NONE}/online`, { isOnline: true });
    await crossTenant("DELETE /api/schedules/:id", "DELETE", `/api/schedules/${scheduleA.id}`, `/api/schedules/${NONE}`);

    // ---- Checklist templates (getOwnedTemplate) ----
    await crossTenant("GET /api/checklist-templates/:id", "GET", `/api/checklist-templates/${templateA.id}`, `/api/checklist-templates/${NONE}`);
    await crossTenant("PATCH /api/checklist-templates/:id", "PATCH", `/api/checklist-templates/${templateA.id}`, `/api/checklist-templates/${NONE}`, { name: "hacked" });
    await crossTenant("DELETE /api/checklist-templates/:id", "DELETE", `/api/checklist-templates/${templateA.id}`, `/api/checklist-templates/${NONE}`);
    await crossTenant("POST /api/checklist-templates/:id/duplicate", "POST", `/api/checklist-templates/${templateA.id}/duplicate`, `/api/checklist-templates/${NONE}/duplicate`);
    await crossTenant("GET /api/checklist-templates/:templateId/groups", "GET", `/api/checklist-templates/${templateA.id}/groups`, `/api/checklist-templates/${NONE}/groups`);
    await crossTenant("POST /api/checklist-templates/:templateId/groups/reorder", "POST", `/api/checklist-templates/${templateA.id}/groups/reorder`, `/api/checklist-templates/${NONE}/groups/reorder`, { orderedGroupIds: [groupA.id] });

    // ---- Checklist groups (getOwnedGroup; create takes templateId in the body) ----
    await test("POST /api/checklist-template-groups: company B \u2192 404 targeting company A's template", async () => {
      const r = await api("POST", "/api/checklist-template-groups", { cookie: B.cookie, body: { templateId: templateA.id, name: "x" } });
      assert.strictEqual(r.status, 404, `expected 404, got ${r.status}: ${JSON.stringify(r.body)}`);
    });
    await test("POST /api/checklist-template-groups: \u2192 404 non-existent template", async () => {
      const r = await api("POST", "/api/checklist-template-groups", { cookie: B.cookie, body: { templateId: NONE, name: "x" } });
      assert.strictEqual(r.status, 404, `expected 404, got ${r.status}: ${JSON.stringify(r.body)}`);
    });

    await crossTenant("PATCH /api/checklist-template-groups/:id", "PATCH", `/api/checklist-template-groups/${groupA.id}`, `/api/checklist-template-groups/${NONE}`, { name: "hacked" });
    await crossTenant("DELETE /api/checklist-template-groups/:id", "DELETE", `/api/checklist-template-groups/${groupA.id}`, `/api/checklist-template-groups/${NONE}`);

    // move-to: source in path, target in body
    await crossTenant("POST /api/checklist-template-groups/:id/move-to (source A)", "POST", `/api/checklist-template-groups/${groupA.id}/move-to`, `/api/checklist-template-groups/${NONE}/move-to`, { targetGroupId: groupB.id });
    await test("POST move-to: company B \u2192 404 when target group belongs to A", async () => {
      const r = await api("POST", `/api/checklist-template-groups/${groupB.id}/move-to`, { cookie: B.cookie, body: { targetGroupId: groupA.id } });
      assert.strictEqual(r.status, 404, `expected 404, got ${r.status}: ${JSON.stringify(r.body)}`);
    });

    // move-to-template: source group in path, target template in body
    await crossTenant("POST /api/checklist-template-groups/:id/move-to-template (source A)", "POST", `/api/checklist-template-groups/${groupA.id}/move-to-template`, `/api/checklist-template-groups/${NONE}/move-to-template`, { targetTemplateId: templateB.id });
    await test("POST move-to-template: company B \u2192 404 when target template belongs to A", async () => {
      const r = await api("POST", `/api/checklist-template-groups/${groupB.id}/move-to-template`, { cookie: B.cookie, body: { targetTemplateId: templateA.id } });
      assert.strictEqual(r.status, 404, `expected 404, got ${r.status}: ${JSON.stringify(r.body)}`);
    });

    // ---- Checklist items (getOwnedItem; create takes groupId in body) ----
    await crossTenant("GET /api/checklist-template-groups/:groupId/items", "GET", `/api/checklist-template-groups/${groupA.id}/items`, `/api/checklist-template-groups/${NONE}/items`);
    await test("POST /api/checklist-template-items: company B \u2192 404 targeting company A's group", async () => {
      const r = await api("POST", "/api/checklist-template-items", { cookie: B.cookie, body: { groupId: groupA.id, description: "x" } });
      assert.strictEqual(r.status, 404, `expected 404, got ${r.status}: ${JSON.stringify(r.body)}`);
    });
    await test("POST /api/checklist-template-items: \u2192 404 non-existent group", async () => {
      const r = await api("POST", "/api/checklist-template-items", { cookie: B.cookie, body: { groupId: NONE, description: "x" } });
      assert.strictEqual(r.status, 404, `expected 404, got ${r.status}: ${JSON.stringify(r.body)}`);
    });
    await crossTenant("PATCH /api/checklist-template-items/:id", "PATCH", `/api/checklist-template-items/${itemA.id}`, `/api/checklist-template-items/${NONE}`, { description: "hacked" });
    await crossTenant("DELETE /api/checklist-template-items/:id", "DELETE", `/api/checklist-template-items/${itemA.id}`, `/api/checklist-template-items/${NONE}`);

    // ---- Bills (getOwnedBill) ----
    await crossTenant("GET /api/bills/:id", "GET", `/api/bills/${billA.id}`, `/api/bills/${NONE}`);
    // IDOR guard: B owns billB but targets A's line item id — must 404 (the
    // parent is resolved from the line item itself, not from the URL :billId).
    await crossTenant("PATCH /api/bills/:billId/line-items/:id (B's bill, A's item)", "PATCH", `/api/bills/${billB.id}/line-items/${billLineItemA.id}`, `/api/bills/${billB.id}/line-items/${NONE}`, { description: "hacked" });
    await crossTenant("DELETE /api/bills/:billId/line-items/:id (B's bill, A's item)", "DELETE", `/api/bills/${billB.id}/line-items/${billLineItemA.id}`, `/api/bills/${billB.id}/line-items/${NONE}`);
    await crossTenant("PATCH /api/bills/:id", "PATCH", `/api/bills/${billA.id}`, `/api/bills/${NONE}`, { notes: "hacked" });
    await crossTenant("DELETE /api/bills/:id", "DELETE", `/api/bills/${billA.id}`, `/api/bills/${NONE}`);
    await crossTenant("POST /api/bills/:id/duplicate", "POST", `/api/bills/${billA.id}/duplicate`, `/api/bills/${NONE}/duplicate`);
    await crossTenant("GET /api/bills/:id/line-items", "GET", `/api/bills/${billA.id}/line-items`, `/api/bills/${NONE}/line-items`);
    await crossTenant("POST /api/bills/:id/line-items", "POST", `/api/bills/${billA.id}/line-items`, `/api/bills/${NONE}/line-items`, { description: "x", quantity: 1, unitPrice: 100 });
    await crossTenant("GET /api/bills/:id/payments", "GET", `/api/bills/${billA.id}/payments`, `/api/bills/${NONE}/payments`);
    // Bill payments by id (payment -> bill -> getOwnedBill).
    await crossTenant("PATCH /api/bill-payments/:id/void", "PATCH", `/api/bill-payments/${billPaymentA.id}/void`, `/api/bill-payments/${NONE}/void`);
    await crossTenant("DELETE /api/bill-payments/:id", "DELETE", `/api/bill-payments/${billPaymentA.id}`, `/api/bill-payments/${NONE}`);
    await crossTenant("GET /api/bills/:billId/line-item-allowances", "GET", `/api/bills/${billA.id}/line-item-allowances`, `/api/bills/${NONE}/line-item-allowances`);
    await crossTenant("POST /api/bills/:id/confirm-extraction", "POST", `/api/bills/${billA.id}/confirm-extraction`, `/api/bills/${NONE}/confirm-extraction`);

    // ---- Variations (getOwnedVariation) ----
    await crossTenant("GET /api/variations/:id", "GET", `/api/variations/${variationA.id}`, `/api/variations/${NONE}`);
    await crossTenant("PATCH /api/variations/:id", "PATCH", `/api/variations/${variationA.id}`, `/api/variations/${NONE}`, { name: "hacked" });
    await crossTenant("DELETE /api/variations/:id", "DELETE", `/api/variations/${variationA.id}`, `/api/variations/${NONE}`);
    await crossTenant("GET /api/variations/:id/items", "GET", `/api/variations/${variationA.id}/items`, `/api/variations/${NONE}/items`);
    await crossTenant("PATCH /api/variation-items/:id", "PATCH", `/api/variation-items/${variationItemA.id}`, `/api/variation-items/${NONE}`, { description: "hacked" });
    await crossTenant("DELETE /api/variation-items/:id", "DELETE", `/api/variation-items/${variationItemA.id}`, `/api/variation-items/${NONE}`);

    // ---- Bill line item allowances (parent: bill line item -> bill) ----
    await crossTenant("PATCH /api/bill-line-item-allowances/:id", "PATCH", `/api/bill-line-item-allowances/${billLineItemAllowanceA.id}`, `/api/bill-line-item-allowances/${NONE}`, { amount: 999 });
    await crossTenant("DELETE /api/bill-line-item-allowances/:id", "DELETE", `/api/bill-line-item-allowances/${billLineItemAllowanceA.id}`, `/api/bill-line-item-allowances/${NONE}`);

    // ---- Client invoices (getOwnedClientInvoice) ----
    await crossTenant("GET /api/client-invoices/:id", "GET", `/api/client-invoices/${clientInvoiceA.id}`, `/api/client-invoices/${NONE}`);
    await crossTenant("PATCH /api/client-invoices/:id", "PATCH", `/api/client-invoices/${clientInvoiceA.id}`, `/api/client-invoices/${NONE}`, { name: "hacked" });
    await crossTenant("DELETE /api/client-invoices/:id", "DELETE", `/api/client-invoices/${clientInvoiceA.id}`, `/api/client-invoices/${NONE}`);
    await crossTenant("GET /api/client-invoices/:id/items", "GET", `/api/client-invoices/${clientInvoiceA.id}/items`, `/api/client-invoices/${NONE}/items`);

    // ---- Proposals (getOwnedProposal) ----
    await crossTenant("GET /api/proposals/:id", "GET", `/api/proposals/${proposalA.id}`, `/api/proposals/${NONE}`);
    await crossTenant("PATCH /api/proposals/:id", "PATCH", `/api/proposals/${proposalA.id}`, `/api/proposals/${NONE}`, { name: "hacked" });
    await crossTenant("DELETE /api/proposals/:id", "DELETE", `/api/proposals/${proposalA.id}`, `/api/proposals/${NONE}`);
    await crossTenant("GET /api/proposals/:id/sections", "GET", `/api/proposals/${proposalA.id}/sections`, `/api/proposals/${NONE}/sections`);
    await crossTenant("PATCH /api/proposal-sections/:id", "PATCH", `/api/proposal-sections/${proposalSectionA.id}`, `/api/proposal-sections/${NONE}`, { name: "hacked" });
    await crossTenant("DELETE /api/proposal-sections/:id", "DELETE", `/api/proposal-sections/${proposalSectionA.id}`, `/api/proposal-sections/${NONE}`);
    await crossTenant("PATCH /api/proposal-items/:id", "PATCH", `/api/proposal-items/${proposalItemA.id}`, `/api/proposal-items/${NONE}`, { name: "hacked" });
    await crossTenant("DELETE /api/proposal-items/:id", "DELETE", `/api/proposal-items/${proposalItemA.id}`, `/api/proposal-items/${NONE}`);
    await crossTenant("PATCH /api/proposal-milestones/:id", "PATCH", `/api/proposal-milestones/${proposalMilestoneA.id}`, `/api/proposal-milestones/${NONE}`, { name: "hacked" });
    await crossTenant("DELETE /api/proposal-milestones/:id", "DELETE", `/api/proposal-milestones/${proposalMilestoneA.id}`, `/api/proposal-milestones/${NONE}`);

    // ---- RFQs (getOwnedRFQ) ----
    await crossTenant("GET /api/rfqs/:id/items", "GET", `/api/rfqs/${rfqA.id}/items`, `/api/rfqs/${NONE}/items`);
    await crossTenant("GET /api/rfqs/:id/follow-ups", "GET", `/api/rfqs/${rfqA.id}/follow-ups`, `/api/rfqs/${NONE}/follow-ups`);

    // ---- RFIs (getOwnedRFI; direct companyId) ----
    await crossTenant("GET /api/rfis/:id", "GET", `/api/rfis/${rfiA.id}`, `/api/rfis/${NONE}`);
    await crossTenant("PATCH /api/rfis/:id", "PATCH", `/api/rfis/${rfiA.id}`, `/api/rfis/${NONE}`, { subject: "hacked" });
    await crossTenant("DELETE /api/rfis/:id", "DELETE", `/api/rfis/${rfiA.id}`, `/api/rfis/${NONE}`);
    await crossTenant("GET /api/rfis/:rfiId/comments", "GET", `/api/rfis/${rfiA.id}/comments`, `/api/rfis/${NONE}/comments`);
    // POST /api/rfi-comments resolves the RFI from the body, not the URL, so it
    // needs explicit assertions (crossTenant only varies the path).
    await test("POST /api/rfi-comments: company B \u2192 404 on company A's RFI", async () => {
      const r = await api("POST", `/api/rfi-comments`, { cookie: B.cookie, body: { rfiId: rfiA.id, content: "hacked" } });
      assert.strictEqual(r.status, 404, `expected 404, got ${r.status}: ${JSON.stringify(r.body)}`);
    });
    await test("POST /api/rfi-comments: \u2192 404 on non-existent RFI", async () => {
      const r = await api("POST", `/api/rfi-comments`, { cookie: B.cookie, body: { rfiId: NONE, content: "x" } });
      assert.strictEqual(r.status, 404, `expected 404, got ${r.status}: ${JSON.stringify(r.body)}`);
    });

    // ---- Suppliers (getOwnedSupplier; direct companyId) ----
    await crossTenant("GET /api/suppliers/:id", "GET", `/api/suppliers/${supplierA.id}`, `/api/suppliers/${NONE}`);
    await crossTenant("PATCH /api/suppliers/:id", "PATCH", `/api/suppliers/${supplierA.id}`, `/api/suppliers/${NONE}`, { name: "hacked" });
    await crossTenant("DELETE /api/suppliers/:id", "DELETE", `/api/suppliers/${supplierA.id}`, `/api/suppliers/${NONE}`);

    // ---- Defects (getOwnedDefect; via project) ----
    await crossTenant("GET /api/defects/:id", "GET", `/api/defects/${defectA.id}`, `/api/defects/${NONE}`);
    await crossTenant("PATCH /api/defects/:id", "PATCH", `/api/defects/${defectA.id}`, `/api/defects/${NONE}`, { subject: "hacked" });
    await crossTenant("DELETE /api/defects/:id", "DELETE", `/api/defects/${defectA.id}`, `/api/defects/${NONE}`);

    // ---- Minutes (getOwnedMinute; via project else owner's company) ----
    await crossTenant("GET /api/minutes/:id", "GET", `/api/minutes/${minuteA.id}`, `/api/minutes/${NONE}`);
    await crossTenant("PATCH /api/minutes/:id", "PATCH", `/api/minutes/${minuteA.id}`, `/api/minutes/${NONE}`, { subject: "hacked" });
    await crossTenant("DELETE /api/minutes/:id", "DELETE", `/api/minutes/${minuteA.id}`, `/api/minutes/${NONE}`);
    await crossTenant("POST /api/minutes/:id/summarize", "POST", `/api/minutes/${minuteA.id}/summarize`, `/api/minutes/${NONE}/summarize`);

    // ---- Docs (getOwnedDoc; direct companyId) ----
    await crossTenant("GET /api/docs/:id", "GET", `/api/docs/${docA.id}`, `/api/docs/${NONE}`);
    await crossTenant("PATCH /api/docs/:id", "PATCH", `/api/docs/${docA.id}`, `/api/docs/${NONE}`, { subject: "hacked" });
    await crossTenant("DELETE /api/docs/:id", "DELETE", `/api/docs/${docA.id}`, `/api/docs/${NONE}`);

    // ---- Tasks (getOwnedTask; direct companyId) ----
    await crossTenant("GET /api/tasks/:id", "GET", `/api/tasks/${taskA.id}`, `/api/tasks/${NONE}`);
    await crossTenant("PATCH /api/tasks/:id", "PATCH", `/api/tasks/${taskA.id}`, `/api/tasks/${NONE}`, { subject: "hacked" });
    await crossTenant("PATCH /api/tasks/:id/status", "PATCH", `/api/tasks/${taskA.id}/status`, `/api/tasks/${NONE}/status`, { status: "done" });
    await crossTenant("DELETE /api/tasks/:id", "DELETE", `/api/tasks/${taskA.id}`, `/api/tasks/${NONE}`);
    // createSubtask is a not-implemented stub in DatabaseStorage (would 500),
    // but getOwnedTask runs BEFORE that stub, so cross-tenant still masks as 404.
    await crossTenant("POST /api/tasks/:id/subtasks", "POST", `/api/tasks/${taskA.id}/subtasks`, `/api/tasks/${NONE}/subtasks`, { title: "hacked subtask", content: "x" });

    // ---- Site diary entries (getOwnedSiteDiaryEntry; via project) ----
    await crossTenant("GET /api/site-diary-entries/:id", "GET", `/api/site-diary-entries/${siteDiaryEntryA.id}`, `/api/site-diary-entries/${NONE}`, undefined);
    await crossTenant("PATCH /api/site-diary-entries/:id", "PATCH", `/api/site-diary-entries/${siteDiaryEntryA.id}`, `/api/site-diary-entries/${NONE}`, { subject: "hacked" });
    await crossTenant("DELETE /api/site-diary-entries/:id", "DELETE", `/api/site-diary-entries/${siteDiaryEntryA.id}`, `/api/site-diary-entries/${NONE}`);

    // ---- Timesheets (getOwnedTimesheet; via owning user's company else project) ----
    await crossTenant("GET /api/timesheets/:id", "GET", `/api/timesheets/${timesheetA.id}`, `/api/timesheets/${NONE}`);
    await crossTenant("PATCH /api/timesheets/:id", "PATCH", `/api/timesheets/${timesheetA.id}`, `/api/timesheets/${NONE}`, { description: "hacked" });
    await crossTenant("DELETE /api/timesheets/:id", "DELETE", `/api/timesheets/${timesheetA.id}`, `/api/timesheets/${NONE}`);

    // ---- Schedule items (getOwnedScheduleItem; via schedule -> project) ----
    await crossTenant("GET /api/schedule-items/:id", "GET", `/api/schedule-items/${scheduleItemA.id}`, `/api/schedule-items/${NONE}`);
    await crossTenant("PATCH /api/schedule-items/:id", "PATCH", `/api/schedule-items/${scheduleItemA.id}`, `/api/schedule-items/${NONE}`, { name: "hacked" });
    await crossTenant("DELETE /api/schedule-items/:id", "DELETE", `/api/schedule-items/${scheduleItemA.id}`, `/api/schedule-items/${NONE}`);
    await crossTenant("POST /api/schedule-items/:id/duplicate", "POST", `/api/schedule-items/${scheduleItemA.id}/duplicate`, `/api/schedule-items/${NONE}/duplicate`);

    // ---- Stamping: created / imported / duplicated templates carry caller's company ----
    await test("POST /api/checklist-templates stamps the caller's companyId", async () => {
      const r = await api("POST", "/api/checklist-templates", { cookie: B.cookie, body: { name: `B Created ${Date.now()}`, type: "Job" } });
      assert.strictEqual(r.status, 201, `expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.companyId, B.companyId, "created template not stamped with company B");
    });

    await test("POST /api/checklist-templates/import stamps the caller's companyId (and is invisible to A)", async () => {
      const name = `B Imported ${Date.now()}`;
      const r = await api("POST", "/api/checklist-templates/import", {
        cookie: B.cookie,
        body: { items: [{ templateName: name, type: "Job", groupName: "G1", itemDescription: "I1" }] },
      });
      assert.strictEqual(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.templatesCreated, 1, "import did not create the template");
      const bTemplates = await storage.getChecklistTemplates(undefined, B.companyId);
      const found = bTemplates.find((t) => t.name === name);
      assert.ok(found, "imported template not visible to company B");
      assert.strictEqual(found!.companyId, B.companyId, "imported template not stamped with company B");
      const aTemplates = await storage.getChecklistTemplates(undefined, A.companyId);
      assert.ok(!aTemplates.find((t) => t.name === name), "imported template leaked to company A");
    });

    await test("POST /api/checklist-templates/:id/duplicate stamps the caller's companyId", async () => {
      const r = await api("POST", `/api/checklist-templates/${templateB.id}/duplicate`, { cookie: B.cookie });
      assert.strictEqual(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.companyId, B.companyId, "duplicated template not stamped with company B");
    });

    // ---- Export is company-scoped: B's export must not leak A's templates/items ----
    await test("GET /api/checklist-templates/export: company B export excludes company A's data", async () => {
      const r = await api("GET", "/api/checklist-templates/export", { cookie: B.cookie });
      assert.strictEqual(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
      assert.ok(Array.isArray(r.body), "export did not return an array");
      const leakedTemplate = r.body.some((row: any) => row.templateName === templateA.name);
      assert.ok(!leakedTemplate, "company A's template name leaked into company B's export");
      const leakedItem = r.body.some((row: any) => row.itemDescription === itemA.description);
      assert.ok(!leakedItem, "company A's item leaked into company B's export");
    });

    // ---- Final proof company A's records were never mutated/deleted by B ----
    await test("company A's estimate still exists after B's attempts", async () => {
      const e = await storage.getEstimate(estimateA.id);
      assert.ok(e, "company A's estimate was deleted by company B");
    });
    await test("company A's checklist template still exists after B's attempts", async () => {
      const t = await storage.getChecklistTemplate(templateA.id);
      assert.ok(t, "company A's template was deleted by company B");
    });
    await test("company A's bill / variation / invoice / proposal still exist after B's attempts", async () => {
      assert.ok(await storage.getBillById(billA.id), "company A's bill was deleted by company B");
      assert.ok(await storage.getVariation(variationA.id), "company A's variation was deleted by company B");
      assert.ok(await storage.getClientInvoice(clientInvoiceA.id), "company A's invoice was deleted by company B");
      assert.ok(await storage.getProposal(proposalA.id), "company A's proposal was deleted by company B");
    });
    await test("company A's nested sub-resources still exist after B's attempts", async () => {
      const vItems = await storage.getVariationItems(variationA.id);
      assert.ok(vItems.some((i: any) => i.id === variationItemA.id), "company A's variation item was deleted by company B");
      const lineItems = await storage.getBillLineItems(billA.id);
      assert.ok(lineItems.some((li: any) => li.id === billLineItemA.id), "company A's bill line item was deleted by company B");
      const allowances = await storage.getBillLineItemAllowances(billLineItemA.id);
      assert.ok(allowances.some((a: any) => a.id === billLineItemAllowanceA.id), "company A's bill line item allowance was deleted by company B");
      const sections = await storage.getProposalSections(proposalA.id);
      assert.ok(sections.some((s: any) => s.id === proposalSectionA.id), "company A's proposal section was deleted by company B");
      const pItems = await storage.getProposalItems(proposalA.id);
      assert.ok(pItems.some((i: any) => i.id === proposalItemA.id), "company A's proposal item was deleted by company B");
      const milestones = await storage.getProposalPaymentMilestones(proposalA.id);
      assert.ok(milestones.some((m: any) => m.id === proposalMilestoneA.id), "company A's proposal milestone was deleted by company B");
    });
    await test("company A's prior-session by-id records still exist after B's attempts", async () => {
      assert.ok(await storage.getSupplierById(supplierA.id), "company A's supplier was deleted by company B");
      assert.ok(await storage.getDefectById(defectA.id), "company A's defect was deleted by company B");
      assert.ok(await storage.getMinute(minuteA.id), "company A's minute was deleted by company B");
      assert.ok(await storage.getDoc(docA.id), "company A's doc was deleted by company B");
      assert.ok(await storage.getTask(taskA.id), "company A's task was deleted by company B");
      assert.ok(await storage.getTimesheet(timesheetA.id), "company A's timesheet was deleted by company B");
      assert.ok(await storage.getSiteDiaryEntry(siteDiaryEntryA.id), "company A's site diary entry was deleted by company B");
      assert.ok(await storage.getScheduleItem(scheduleItemA.id), "company A's schedule item was deleted by company B");
      assert.ok(await storage.getRFI(rfiA.id), "company A's RFI was deleted by company B");
      const paymentSurvivor = await storage.getBillPaymentById(billPaymentA.id);
      assert.ok(paymentSurvivor && !(paymentSurvivor as any).isVoided, "company A's bill payment was voided/deleted by company B");
    });
  } finally {
    await cleanup([A.companyId, B.companyId], [A.userId, B.userId]);
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    console.error("Failed tests:\n  - " + failures.join("\n  - "));
  }
}

async function cleanup(companyIds: string[], userIds: string[]) {
  const stmts: Array<[string, any[]]> = [
    [`DELETE FROM checklist_template_items WHERE group_id IN (SELECT g.id FROM checklist_template_groups g JOIN checklist_templates t ON g.template_id = t.id WHERE t.company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM checklist_template_groups WHERE template_id IN (SELECT id FROM checklist_templates WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM checklist_templates WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM suppliers WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM defects WHERE project_id IN (SELECT id FROM projects WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM minutes WHERE project_id IN (SELECT id FROM projects WHERE company_id = ANY($1)) OR owner_id = ANY($2)`, [companyIds, userIds]],
    [`DELETE FROM docs WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM notes WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM timesheets WHERE user_id = ANY($2) OR project_id IN (SELECT id FROM projects WHERE company_id = ANY($1))`, [companyIds, userIds]],
    [`DELETE FROM site_diary_entries WHERE project_id IN (SELECT id FROM projects WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM site_diary_templates WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM schedule_items WHERE schedule_id IN (SELECT id FROM schedules WHERE project_id IN (SELECT id FROM projects WHERE company_id = ANY($1)))`, [companyIds]],
    [`DELETE FROM bill_payments WHERE bill_id IN (SELECT id FROM bills WHERE company_id = ANY($1) OR project_id IN (SELECT id FROM projects WHERE company_id = ANY($1)))`, [companyIds]],
    [`DELETE FROM bills WHERE company_id = ANY($1) OR project_id IN (SELECT id FROM projects WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM rfi_comments WHERE rfi_id IN (SELECT id FROM rfis WHERE company_id = ANY($1) OR project_id IN (SELECT id FROM projects WHERE company_id = ANY($1)))`, [companyIds]],
    [`DELETE FROM rfis WHERE company_id = ANY($1) OR project_id IN (SELECT id FROM projects WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM rfqs WHERE company_id = ANY($1) OR project_id IN (SELECT id FROM projects WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM variations WHERE project_id IN (SELECT id FROM projects WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM client_invoices WHERE project_id IN (SELECT id FROM projects WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM proposals WHERE project_id IN (SELECT id FROM projects WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM estimates WHERE project_id IN (SELECT id FROM projects WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM schedules WHERE project_id IN (SELECT id FROM projects WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM selections WHERE project_id IN (SELECT id FROM projects WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM projects WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM user_roles WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM sessions WHERE sess->>'userId' = ANY($1)`, [userIds]],
    [`DELETE FROM users WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM user_roles WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM companies WHERE id = ANY($1)`, [companyIds]],
  ];
  for (const [sql, params] of stmts) {
    try {
      await pool.query(sql, params);
    } catch (err: any) {
      console.warn(`[cleanup] skipped: ${err?.message || err}`);
    }
  }
}

main()
  .then(async () => {
    try {
      await new Promise<void>((resolve) => httpServer?.close(() => resolve()));
    } catch {}
    try {
      await pool.end();
    } catch {}
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(async (err) => {
    console.error("\nFATAL: test harness crashed\n", err);
    try {
      await new Promise<void>((resolve) => httpServer?.close(() => resolve()));
    } catch {}
    try {
      await pool.end();
    } catch {}
    process.exit(1);
  });
