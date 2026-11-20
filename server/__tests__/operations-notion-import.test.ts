/**
 * Notion → Operations import: how Notion blocks become Library HTML, that a
 * read follows pagination and nesting, that a dry run keeps nothing, that an
 * import lands in ONE company only (roles, folders, docs), and that a second
 * run adds only what is new.
 *
 * Notion itself is never called: NotionClient is handed a fake fetch that
 * serves fixture responses shaped like the real API.
 *
 * Same harness as operations-starter-pack.test.ts (real app, dev database,
 * throwaway companies deleted at the end).
 *
 * Run with:  NODE_ENV=test npx tsx --env-file-if-exists=.env server/__tests__/operations-notion-import.test.ts
 */

process.env.NODE_ENV = process.env.NODE_ENV || "test";

import express from "express";
import assert from "node:assert";
import { registerRoutes } from "../routes";
import { storage } from "../storage";
import { pool } from "../db";
import {
  NotionClient, readNotion, applyNotionImport, blocksToHtml, emptyStats,
  type NotionBlock, type NotionImportData,
} from "../services/notionImport";

let baseUrl = "";
let httpServer: any = null;
let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  ✗ ${name}\n      ${err?.message || err}`);
  }
}

const HEADERS = { "Content-Type": "application/json", "X-Forwarded-Proto": "https" };

async function api(method: string, path: string, cookie: string) {
  const res = await fetch(`${baseUrl}${path}`, { method, headers: { ...HEADERS, Cookie: cookie } });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function createTenant(label: string) {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `ops-notion-${label}-${unique}@tenanttest.local`;
  const password = "TenantTest123!";
  const reg = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ email, password, firstName: label, lastName: "OpsNotion", agreeToTerms: true }),
  });
  const regText = await reg.text();
  assert.strictEqual(reg.status, 200, `register ${label}: ${regText}`);
  const userId = JSON.parse(regText).user.id as string;
  const company = await storage.createCompany({ name: `Ops Notion Co ${label} ${unique}` } as any, userId);
  const res = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: HEADERS, body: JSON.stringify({ email, password }) });
  const cookie = ((res.headers as any).getSetCookie?.() ?? []).find((c: string) => c.startsWith("connect.sid="))?.split(";")[0];
  assert.ok(cookie, `no session cookie for ${email}`);
  return { userId, companyId: company.id as string, cookie: cookie as string };
}

// New companies are seeded with roles (Admin among them): reuse one if it
// exists, but pin its category so the test knows what it is matching.
async function addRole(companyId: string, name: string, userCategory: string) {
  const { rows } = await pool.query(
    `INSERT INTO user_roles (company_id, name, user_category) VALUES ($1, $2, $3)
       ON CONFLICT (company_id, name) DO UPDATE SET user_category = EXCLUDED.user_category RETURNING id`,
    [companyId, name, userCategory],
  );
  return rows[0].id as string;
}

// ---------------------------------------------------------------------------
// Fixtures shaped like the Notion API

const rt = (text: string, extra: Record<string, any> = {}) => [{ type: "text", plain_text: text, href: null, annotations: {}, ...extra }];
const block = (type: string, value: Record<string, any>, children?: NotionBlock[]): NotionBlock => ({
  id: `b-${Math.random().toString(36).slice(2)}`,
  type,
  has_children: !!children?.length,
  [type]: value,
  ...(children ? { _kids: children } : {}),
});

const TASK_DB = "task-db";
const ASSET_DB = "asset-db";

function taskRow(id: string, name: string, extra: Record<string, any> = {}) {
  return {
    object: "page",
    id,
    url: `https://www.notion.so/${id}`,
    properties: {
      "Task Name": { type: "title", title: rt(name) },
      "Task Description": { type: "rich_text", rich_text: rt(`Why ${name} matters`) },
      Notes: { type: "rich_text", rich_text: [] },
      Frequency: { type: "select", select: extra.frequency ? { name: extra.frequency } : null },
      Stage: { type: "select", select: { name: extra.stage ?? "OPERATIONS" } },
      Role: { type: "select", select: extra.role ? { name: extra.role } : null },
      Minutes: { type: "number", number: extra.minutes ?? null },
      Video: { type: "url", url: extra.video ?? null },
      "SOP Link": { type: "url", url: null },
      "Google File": { type: "relation", relation: (extra.files ?? []).map((fid: string) => ({ id: fid })) },
    },
  };
}

function assetRow(id: string, name: string, category: string, files: string[] = []) {
  return {
    object: "page",
    id,
    url: `https://www.notion.so/${id}`,
    properties: {
      Name: { type: "title", title: rt(name) },
      Category: { type: "select", select: { name: category } },
      Stage: { type: "select", select: { name: "Client Flow" } },
      "Google Drive File": { type: "relation", relation: files.map((fid) => ({ id: fid })) },
    },
  };
}

// Builds a fake fetch over: database rows (paged in twos), page bodies (block
// trees, children served from their own /children endpoint) and relation pages.
function fakeNotion(dbs: Record<string, any[]>, bodies: Record<string, NotionBlock[]>, pages: Record<string, any>) {
  const calls: string[] = [];
  const childrenOf = new Map<string, NotionBlock[]>();
  const index = (blocks: NotionBlock[]) => {
    for (const b of blocks) {
      const kids = (b as any)._kids as NotionBlock[] | undefined;
      if (kids) { childrenOf.set(b.id, kids); delete (b as any)._kids; index(kids); }
    }
  };
  for (const [id, blocks] of Object.entries(bodies)) { childrenOf.set(id, blocks); index(blocks); }

  const json = (body: any, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const impl = (async (input: any, init?: any) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/v1", "");
    calls.push(`${init?.method ?? "GET"} ${path}`);
    let m = /^\/databases\/([^/]+)\/query$/.exec(path);
    if (m) {
      const rows = dbs[m[1]];
      if (!rows) return json({ message: "Could not find database" }, 404);
      const start = Number(JSON.parse(init.body).start_cursor ?? 0);
      const slice = rows.slice(start, start + 2);
      const more = start + 2 < rows.length;
      return json({ results: slice, has_more: more, next_cursor: more ? String(start + 2) : null });
    }
    m = /^\/blocks\/([^/]+)\/children$/.exec(path);
    if (m) return json({ results: childrenOf.get(m[1]) ?? [], has_more: false, next_cursor: null });
    m = /^\/pages\/([^/]+)$/.exec(path);
    if (m) return pages[m[1]] ? json(pages[m[1]]) : json({ message: "not found" }, 404);
    return json({ message: `unexpected ${path}` }, 400);
  }) as typeof fetch;
  return { impl, calls };
}

function sopBody(): NotionBlock[] {
  return [
    block("paragraph", { rich_text: rt("Description:", { annotations: { bold: true } }) }),
    block("paragraph", { rich_text: rt("Keep <bills@> clean & tidy") }),
    block("heading_2", { rich_text: rt("Deliverables Checklist") }),
    block("to_do", { rich_text: rt("Every forward is a real bill"), checked: false }),
    block("to_do", { rich_text: rt("Job tag in the subject"), checked: false }),
    block("heading_2", { rich_text: rt("📋 PROCESS"), is_toggleable: true }, [
      block("numbered_list_item", { rich_text: rt("Open the message") }, [
        block("numbered_list_item", { rich_text: rt("Check jed@") }),
      ]),
      block("numbered_list_item", { rich_text: rt("Classify it") }),
    ]),
    block("table", { table_width: 2, has_column_header: true }, [
      block("table_row", { cells: [rt("Role"), rt("Member")] }),
      block("table_row", { cells: [rt("Responsible"), rt("Admin")] }),
      block("table_row", { cells: [[], rt("Escalated")] }), // template's blank row
    ]),
    block("image", { type: "file", file: { url: "https://s3.example/signed?x=1" }, caption: [] }),
    block("toggle", { rich_text: rt("FAQs") }, [block("paragraph", { rich_text: rt("Q: Forward shipping?") })]),
  ];
}

// ---------------------------------------------------------------------------

async function main() {
  const app = express();
  app.use(express.json());
  httpServer = await registerRoutes(app);
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", () => resolve()));
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
  console.log(`\nNotion import tests (server on ${baseUrl})\n`);

  const A = await createTenant("A");
  const B = await createTenant("B");
  const companyIds = [A.companyId, B.companyId];
  try {
    const adminA = await addRole(A.companyId, "Admin", "team");
    await addRole(A.companyId, "Client Liaison", "client"); // not a team role: must not match
    const adminB = await addRole(B.companyId, "Admin", "team");
    // A folder A already has, named like a Notion stage: reused, not doubled.
    const { rows: [ownFolder] } = await pool.query(
      `INSERT INTO doc_folders (company_id, name, sort_order) VALUES ($1, 'Operations', 0) RETURNING id`, [A.companyId]);

    await test("blocks → HTML the Library editor can hold", async () => {
      const stats = emptyStats();
      const checklist: string[] = [];
      const html = blocksToHtml(sopBody().map(function strip(b): NotionBlock {
        const kids = (b as any)._kids as NotionBlock[] | undefined;
        return kids ? { ...b, children: kids.map(strip) } : b;
      }), stats, checklist);
      assert.ok(html.includes("<p><strong>Description:</strong></p>"), "bold text kept");
      assert.ok(html.includes("Keep &lt;bills@&gt; clean &amp; tidy"), "text is escaped, never raw HTML");
      assert.ok(html.includes(`<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Every forward is a real bill</p></li>`), "to-dos are a task list");
      assert.ok(html.includes("<h2>📋 PROCESS</h2><ol><li><p>Open the message</p><ol><li><p>Check jed@</p></li></ol></li><li><p>Classify it</p></li></ol>"), "toggle heading keeps its nested list");
      assert.ok(html.includes("<ul><li><p>Role: Responsible · Member: Admin</p></li></ul>"), "table row → bullet with headers");
      assert.ok(!html.includes("Escalated"), "blank template row dropped");
      assert.ok(!html.includes("<table"), "no table markup (editor would drop it)");
      assert.ok(!html.includes("s3.example"), "expiring Notion file URL is not saved");
      assert.ok(html.includes("[Image left in Notion]"));
      assert.ok(html.includes("<p><strong>FAQs</strong></p><p>Q: Forward shipping?</p>"), "toggle → bold line + contents");
      assert.deepStrictEqual(checklist, ["Every forward is a real bill", "Job tag in the subject"]);
      assert.strictEqual(stats.images, 1);
    });

    const dbs = {
      [TASK_DB]: [
        taskRow("t1", "bills@ Forwarding Hygiene", { frequency: "Daily", role: "Admin", minutes: 15, video: "https://loom.com/v/1", files: ["g1"] }),
        taskRow("t2", "Weekly job costing", { frequency: "Weekly", role: "Client Liaison", stage: "CONSTRUCTION" }),
        taskRow("t3", "Lead onboarding", { frequency: "Project", stage: "SALES" }),
      ],
      [ASSET_DB]: [
        assetRow("a1", "Project Commencement Pack", "Management"),
        assetRow("a2", "Site Checklist", "Checklist", ["g2"]),
      ],
    };
    const bodies: Record<string, NotionBlock[]> = {
      t1: sopBody(),
      t2: [block("paragraph", { rich_text: [] })], // no SOP written yet
      t3: [block("paragraph", { rich_text: rt("Call the lead within a day") })],
      a1: [block("heading_1", { rich_text: rt("Welcome to Your Project") })],
      a2: [],
    };
    const pages = {
      g1: { id: "g1", properties: { Name: { type: "title", title: rt("Bills sheet") }, URL: { type: "url", url: "https://docs.google.com/spreadsheets/d/bills" } } },
      g2: { id: "g2", properties: { Link: { type: "url", url: "https://drive.google.com/file/d/site" } } },
    };

    let data!: NotionImportData;
    await test("read follows pagination, nesting and relations", async () => {
      const fake = fakeNotion(dbs, bodies, pages);
      data = await readNotion(new NotionClient("secret_test", fake.impl), { taskDatabaseId: TASK_DB, assetDatabaseId: ASSET_DB });
      assert.strictEqual(data.tasks.length, 3, "3 rows across 2 pages");
      assert.strictEqual(data.assets.length, 2);
      assert.ok(fake.calls.every((c) => !c.startsWith("PATCH") && !c.startsWith("DELETE")), "read-only on Notion");
      const t1 = data.tasks.find((t) => t.notionId === "t1")!;
      assert.ok(t1.sopHtml.includes("Check jed@"), "nested child blocks fetched");
      assert.deepStrictEqual(t1.links, ["https://loom.com/v/1", "https://docs.google.com/spreadsheets/d/bills"]);
      assert.strictEqual(data.tasks.find((t) => t.notionId === "t2")!.sopHtml, "", "an empty body makes no SOP");
      assert.strictEqual(data.assets.find((a) => a.notionId === "a2")!.linkUrl, "https://drive.google.com/file/d/site");
    });

    const user = { id: A.userId, name: "A OpsNotion" };

    await test("dry run reports and keeps nothing", async () => {
      const r = await applyNotionImport(A.companyId, user, data, { dryRun: true });
      assert.deepStrictEqual({ sops: r.sops, tasks: r.tasks, assets: r.assets }, { sops: 2, tasks: 3, assets: 2 });
      const { rows } = await pool.query(
        `SELECT (SELECT count(*) FROM task_templates WHERE company_id = $1)::int AS t,
                (SELECT count(*) FROM docs WHERE company_id = $1)::int AS d,
                (SELECT count(*) FROM operations_starter_installs WHERE company_id = $1)::int AS l,
                (SELECT count(*) FROM doc_folders WHERE company_id = $1)::int AS f`, [A.companyId]);
      assert.deepStrictEqual(rows[0], { t: 0, d: 0, l: 0, f: 1 });
    });

    await test("import lands in company A: inactive tasks linked to draft SOPs", async () => {
      const r = await applyNotionImport(A.companyId, user, data);
      assert.deepStrictEqual(r.unmatchedRoles, ["Client Liaison"], "client-category role is not a match");
      assert.strictEqual(r.folders, 3, "Sales + 2 asset folders; Operations reused");

      const { rows: tasks } = await pool.query(
        `SELECT title, is_active, frequency, recurring_days, default_role_id, sop_doc_id, checklist, external_links, category, estimated_duration
           FROM task_templates WHERE company_id = $1 ORDER BY title`, [A.companyId]);
      assert.strictEqual(tasks.length, 3);
      assert.ok(tasks.every((t: any) => t.is_active === false), "every task is OFF");
      const hygiene = tasks.find((t: any) => t.title === "bills@ Forwarding Hygiene");
      assert.strictEqual(hygiene.frequency, "daily");
      assert.deepStrictEqual(hygiene.recurring_days, [1, 2, 3, 4, 5]);
      assert.strictEqual(hygiene.default_role_id, adminA, "matched to A's own Admin role");
      assert.notStrictEqual(hygiene.default_role_id, adminB);
      assert.strictEqual(hygiene.estimated_duration, 15);
      assert.deepStrictEqual(hygiene.checklist.map((c: any) => c.text), ["Every forward is a real bill", "Job tag in the subject"]);
      const lead = tasks.find((t: any) => t.title === "Lead onboarding");
      assert.strictEqual(lead.frequency, "once", "Project / As Needed → one-off");
      assert.strictEqual(lead.category, "Sales");
      assert.strictEqual(tasks.find((t: any) => t.title === "Weekly job costing").sop_doc_id, null);

      const { rows: [sop] } = await pool.query(`SELECT company_id, status, doc_type, folder_id, tags FROM docs WHERE id = $1`, [hygiene.sop_doc_id]);
      assert.strictEqual(sop.company_id, A.companyId);
      assert.strictEqual(sop.status, "draft", "nothing arrives approved");
      assert.strictEqual(sop.doc_type, "sop");
      assert.strictEqual(sop.folder_id, ownFolder.id, "existing 'Operations' folder reused");
      assert.ok(sop.tags.includes("Notion import"));

      const { rows: assets } = await pool.query(
        `SELECT title, doc_type, link_url FROM docs WHERE company_id = $1 AND doc_type <> 'sop' ORDER BY title`, [A.companyId]);
      assert.deepStrictEqual(assets.map((a: any) => [a.title, a.doc_type, a.link_url]), [
        ["Project Commencement Pack", "template", null],
        ["Site Checklist", "checklist", "https://drive.google.com/file/d/site"],
      ]);
    });

    await test("company B sees none of it", async () => {
      const { rows } = await pool.query(
        `SELECT (SELECT count(*) FROM task_templates WHERE company_id = $1)::int AS t,
                (SELECT count(*) FROM docs WHERE company_id = $1)::int AS d,
                (SELECT count(*) FROM doc_folders WHERE company_id = $1)::int AS f`, [B.companyId]);
      assert.deepStrictEqual(rows[0], { t: 0, d: 0, f: 0 });
      const res = await api("GET", "/api/docs", B.cookie);
      assert.strictEqual(res.status, 200);
      assert.ok(!(res.body as any[]).some((d) => d.title === "Project Commencement Pack"));
      const mine = await api("GET", "/api/docs", A.cookie);
      assert.ok((mine.body as any[]).some((d) => d.title === "Project Commencement Pack"), "A's own Library shows it");
    });

    await test("second run adds only new rows and leaves edits alone", async () => {
      await pool.query(`UPDATE docs SET title = 'Edited in Morada' WHERE company_id = $1 AND title = 'Project Commencement Pack'`, [A.companyId]);
      const again: NotionImportData = {
        ...data,
        tasks: [...data.tasks, { ...data.tasks[2], notionId: "t4", title: "New in Notion", sopHtml: "" }],
      };
      const r = await applyNotionImport(A.companyId, user, again);
      assert.deepStrictEqual({ tasks: r.tasks, sops: r.sops, assets: r.assets, folders: r.folders }, { tasks: 1, sops: 0, assets: 0, folders: 0 });
      assert.strictEqual(r.skipped, 7, "3 tasks + 2 SOPs + 2 assets already there");
      const { rows } = await pool.query(
        `SELECT (SELECT count(*) FROM task_templates WHERE company_id = $1)::int AS t,
                (SELECT count(*) FROM docs WHERE company_id = $1)::int AS d,
                (SELECT count(*) FROM doc_folders WHERE company_id = $1)::int AS f,
                (SELECT count(*) FROM docs WHERE company_id = $1 AND title = 'Edited in Morada')::int AS e`, [A.companyId]);
      assert.deepStrictEqual(rows[0], { t: 4, d: 4, f: 4, e: 1 });
    });

    await test("the same Notion data into company B is a separate copy", async () => {
      const r = await applyNotionImport(B.companyId, { id: B.userId, name: "B" }, data);
      assert.strictEqual(r.tasks, 3, "A's ledger does not block B");
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM task_templates t JOIN docs d ON d.id = t.sop_doc_id
          WHERE t.company_id = $1 AND d.company_id <> $1`, [B.companyId]);
      assert.strictEqual(rows[0].n, 0, "no B task points at an A doc");
      const { rows: [role] } = await pool.query(
        `SELECT default_role_id FROM task_templates WHERE company_id = $1 AND title = 'bills@ Forwarding Hygiene'`, [B.companyId]);
      assert.strictEqual(role.default_role_id, adminB);
    });

    await test("role map points a Notion role at a differently named role", async () => {
      await pool.query(`DELETE FROM operations_starter_installs WHERE company_id = $1 AND item_key = 'notion:task:t2'`, [B.companyId]);
      await pool.query(`DELETE FROM task_templates WHERE company_id = $1 AND title = 'Weekly job costing'`, [B.companyId]);
      const r = await applyNotionImport(B.companyId, { id: B.userId, name: "B" }, data, { roleMap: { "Client Liaison": "admin" } });
      assert.strictEqual(r.tasks, 1);
      assert.deepStrictEqual(r.unmatchedRoles, []);
      const { rows: [t] } = await pool.query(
        `SELECT default_role_id FROM task_templates WHERE company_id = $1 AND title = 'Weekly job costing'`, [B.companyId]);
      assert.strictEqual(t.default_role_id, adminB);
    });

    await test("a Notion error stops the read before anything is written", async () => {
      const fake = fakeNotion({}, {}, {});
      await assert.rejects(
        readNotion(new NotionClient("secret_test", fake.impl), { taskDatabaseId: "not-shared" }),
        /404: Could not find database/,
      );
    });
  } finally {
    await cleanup(companyIds);
  }
}

async function cleanup(companyIds: string[]) {
  const stmts: Array<[string, any[]]> = [
    [`DELETE FROM operations_starter_installs WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM notes WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM task_templates WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM doc_versions WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM docs WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM doc_folders WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM activities WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM user_roles WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM sessions WHERE sess->>'userId' IN (SELECT id FROM users WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM company_settings WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM users WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM user_roles WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM companies WHERE id = ANY($1)`, [companyIds]],
  ];
  for (const [sql, params] of stmts) {
    try { await pool.query(sql, params); } catch (err: any) { console.warn(`[cleanup] skipped: ${err?.message || err}`); }
  }
}

async function shutdown(code: number) {
  try { await new Promise<void>((resolve) => httpServer?.close(() => resolve())); } catch {}
  try { await pool.end(); } catch {}
  console.log(`\noperations-notion-import: ${passed} passed, ${failed} failed`);
  process.exit(code);
}

main()
  .then(() => shutdown(failed > 0 ? 1 : 0))
  .catch((err) => { console.error("\nFATAL: test harness crashed\n", err); shutdown(1); });
