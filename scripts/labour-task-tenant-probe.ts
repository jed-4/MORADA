/**
 * Live cross-tenant probe for the four labour-estimate task routes.
 *
 * Unlike scripts/price-list-tenant-probe.ts, which calls storage directly, the
 * fix under test lives in the ROUTE layer — storage still trusts whatever id it
 * is handed. So this boots the real Express app via registerRoutes() and drives
 * the endpoints over HTTP, through the real session store, the real requireAuth,
 * and the real ownership guards. A storage-level probe would prove nothing here.
 *
 * It creates its own two throwaway companies rather than borrowing real ones,
 * and removes everything it made in a finally block.
 *
 * Run: npx tsx --env-file-if-exists=.env scripts/labour-task-tenant-probe.ts
 */
import express from "express";
import { db } from "../server/db";
import * as schema from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { registerRoutes } from "../server/routes";

let failures = 0;
function check(name: string, pass: boolean, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!pass) { failures++; process.exitCode = 1; }
}

const stamp = process.env.PROBE_STAMP ?? String(Date.now());
const tag = `__labour-tenancy-probe-${stamp}`;

// Session ids must satisfy mobileSessionMiddleware's /^[a-zA-Z0-9_-]{20,}$/, which
// signs them into a connect.sid cookie with SESSION_SECRET. That is a real
// production code path, so the probe authenticates exactly as a mobile client does.
const sidA = `probeA${stamp}${"0".repeat(20)}`.slice(0, 40);
const sidB = `probeB${stamp}${"0".repeat(20)}`.slice(0, 40);

const created = {
  companies: [] as string[],
  users: [] as string[],
  projects: [] as string[],
  labourEstimates: [] as string[],
  sids: [sidA, sidB],
};

async function makeTenant(label: string, sid: string) {
  const [company] = await db.insert(schema.companies).values({
    name: `${tag} ${label}`,
    planStatus: "trialing",
    trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  } as any).returning();
  created.companies.push(company.id);

  const [user] = await db.insert(schema.users).values({
    email: `${tag}-${label}@example.invalid`,
    firstName: "Probe", lastName: label,
    companyId: company.id, userCategory: "team", isActive: true,
  } as any).returning();
  created.users.push(user.id);

  const [project] = await db.insert(schema.projects).values({
    name: `${tag} project ${label}`, companyId: company.id,
  } as any).returning();
  created.projects.push(project.id);

  const [estimate] = await db.insert(schema.labourEstimates).values({
    projectId: project.id, companyId: company.id, title: `${tag} estimate ${label}`,
  } as any).returning();
  created.labourEstimates.push(estimate.id);

  const [category] = await db.insert(schema.labourEstimateCategories).values({
    labourEstimateId: estimate.id, name: `${tag} category ${label}`,
  } as any).returning();

  await db.insert(schema.sessions).values({
    sid,
    sess: { userId: user.id, cookie: { originalMaxAge: 604800000, httpOnly: true, path: "/" } } as any,
    expire: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  } as any);

  return { company, user, project, estimate, category };
}

const app = express();
// Same body parsers server/index.ts mounts ahead of registerRoutes. Without
// them req.body is undefined and every write probe is a false negative.
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: false, limit: "50mb" }));
const server = await registerRoutes(app);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as any).port;
const base = `http://127.0.0.1:${port}`;

async function call(sid: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-client": "mobile",
      "x-session-id": sid,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
  return { status: res.status, json, text };
}

const taskRow = (id: string) =>
  db.select().from(schema.labourEstimateTasks)
    .where(eq(schema.labourEstimateTasks.id, id)).limit(1).then((r) => r[0]);
const tasksIn = (catId: string) =>
  db.select().from(schema.labourEstimateTasks)
    .where(eq(schema.labourEstimateTasks.categoryId, catId));

try {
  const A = await makeTenant("A", sidA);
  const B = await makeTenant("B", sidB);
  console.log(`company A = ${A.company.id}  category A = ${A.category.id}`);
  console.log(`company B = ${B.company.id}  category B = ${B.category.id}\n`);

  const [taskA] = await db.insert(schema.labourEstimateTasks).values({
    categoryId: A.category.id, description: "A's secret task",
    numMen: 2, hoursPerMan: 3, totalHours: 6, sortOrder: 0,
  } as any).returning();

  // ── sanity: both sessions really are authenticated, as different tenants ──
  const meA = await call(sidA, "GET", "/api/auth/user");
  const meB = await call(sidB, "GET", "/api/auth/user");
  check("session A authenticates", meA.status === 200, `status ${meA.status}`);
  check("session B authenticates", meB.status === 200, `status ${meB.status}`);
  check("A and B are different companies",
        meA.json?.companyId !== meB.json?.companyId && !!meA.json?.companyId,
        `${meA.json?.companyId} vs ${meB.json?.companyId}`);
  if (failures) throw new Error("probe cannot run: sessions did not authenticate as two tenants");

  // ── the four routes, as the FOREIGN tenant B ─────────────────────────────
  const read = await call(sidB, "GET", `/api/labour-estimate-categories/${A.category.id}/tasks`);
  check("GET tasks as B is refused", read.status === 404, `status ${read.status}`);
  check("GET tasks as B leaks no rows",
        !read.text.includes("A's secret task"), read.text.slice(0, 120));

  const append = await call(sidB, "POST", `/api/labour-estimate-categories/${A.category.id}/tasks`,
                            { description: "injected by B", numMen: 1, hoursPerMan: 1 });
  check("POST task as B is refused", append.status === 404, `status ${append.status}`);
  check("POST task as B appended nothing",
        (await tasksIn(A.category.id)).length === 1);

  const patch = await call(sidB, "PATCH", `/api/labour-estimate-tasks/${taskA.id}`,
                           { description: "hijacked", numMen: 99 });
  check("PATCH task as B is refused", patch.status === 404, `status ${patch.status}`);
  const afterPatch = await taskRow(taskA.id);
  check("PATCH task as B changed nothing",
        afterPatch?.description === "A's secret task" && Number(afterPatch?.numMen) === 2,
        `description=${afterPatch?.description} numMen=${afterPatch?.numMen}`);

  const del = await call(sidB, "DELETE", `/api/labour-estimate-tasks/${taskA.id}`);
  check("DELETE task as B is refused", del.status === 404, `status ${del.status}`);
  check("DELETE task as B left the row intact", !!(await taskRow(taskA.id)));

  // ── body-level escape: A re-parenting its own task into B's category ─────
  const reparent = await call(sidA, "PATCH", `/api/labour-estimate-tasks/${taskA.id}`,
                              { categoryId: B.category.id });
  const afterReparent = await taskRow(taskA.id);
  check("PATCH cannot move a task into another company's category",
        afterReparent?.categoryId === A.category.id,
        `status ${reparent.status}, categoryId=${afterReparent?.categoryId}`);

  // ── regression: the OWNER must still be able to use all four ─────────────
  const readA = await call(sidA, "GET", `/api/labour-estimate-categories/${A.category.id}/tasks`);
  check("GET tasks as A works", readA.status === 200 && readA.json?.length === 1,
        `status ${readA.status}, ${readA.json?.length} row(s)`);

  const addA = await call(sidA, "POST", `/api/labour-estimate-categories/${A.category.id}/tasks`,
                          { description: "A's second task", numMen: 1, hoursPerMan: 4 });
  check("POST task as A works", addA.status === 201 && !!addA.json?.id, `status ${addA.status}`);

  const patchA = await call(sidA, "PATCH", `/api/labour-estimate-tasks/${taskA.id}`,
                            { description: "renamed by A", numMen: 3, hoursPerMan: 4 });
  const renamed = await taskRow(taskA.id);
  check("PATCH task as A works", patchA.status === 200 && renamed?.description === "renamed by A",
        `status ${patchA.status}, description=${renamed?.description}`);
  check("PATCH as A recomputes totalHours", Number(renamed?.totalHours) === 12,
        `totalHours=${renamed?.totalHours}`);

  const delA = await call(sidA, "DELETE", `/api/labour-estimate-tasks/${addA.json?.id}`);
  check("DELETE task as A works", delA.status === 204 && !(await taskRow(addA.json?.id)),
        `status ${delA.status}`);
} finally {
  // Remove everything this probe made, deepest first.
  if (created.labourEstimates.length) {
    const cats = await db.select({ id: schema.labourEstimateCategories.id })
      .from(schema.labourEstimateCategories)
      .where(inArray(schema.labourEstimateCategories.labourEstimateId, created.labourEstimates));
    const catIds = cats.map((c) => c.id);
    if (catIds.length) {
      await db.delete(schema.labourEstimateTasks)
        .where(inArray(schema.labourEstimateTasks.categoryId, catIds));
      await db.delete(schema.labourEstimateCategories)
        .where(inArray(schema.labourEstimateCategories.id, catIds));
    }
    await db.delete(schema.labourEstimates)
      .where(inArray(schema.labourEstimates.id, created.labourEstimates));
  }
  if (created.projects.length) {
    await db.delete(schema.projects).where(inArray(schema.projects.id, created.projects));
  }
  if (created.users.length) {
    await db.delete(schema.users).where(inArray(schema.users.id, created.users));
  }
  await db.delete(schema.sessions).where(inArray(schema.sessions.sid, created.sids));
  if (created.companies.length) {
    await db.delete(schema.companies).where(inArray(schema.companies.id, created.companies));
  }
  console.log(`\ncleaned up ${tag}`);
  console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
  server.close();
  process.exit(failures === 0 ? 0 : 1);
}
