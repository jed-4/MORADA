/**
 * Registry tests for the shared tool layer (server/tools/).
 *
 * The headline test is SCHEMA PARITY: the JSON Schema now generated from each
 * tool's zod definition must deep-equal the hand-written schema the tool layer
 * shipped before the refactor. Tool schemas are the model's entire basis for
 * deciding what to call and with what, so a silent change there is a silent
 * behaviour change in the in-app assistant. The fixture below is a verbatim
 * copy of the schemas from the deleted server/ai/tools.ts.
 *
 * The rest are structural: tenancy, scope gating, and input validation.
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/tool-registry.test.ts
 *
 * NOTE: unit test — no database required. Only dispatch guards that reject
 * before the handler runs are exercised, so no handler ever issues a query.
 * The registry pulls in server/db.ts transitively, which throws at import
 * unless DATABASE_URL is set, so a placeholder is supplied below and the
 * registry is imported dynamically afterwards (ESM evaluates static imports
 * before the module body, so assigning process.env at the top would be too
 * late). Nothing connects to it.
 */
process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgres://unit-test:unit-test@127.0.0.1:5432/unit-test";

import assert from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ToolContext } from "../tools";

type Registry = typeof import("../tools");
let ALL_TOOL_SCOPES: Registry["ALL_TOOL_SCOPES"];
let READ_ONLY_TOOL_SCOPES: Registry["READ_ONLY_TOOL_SCOPES"];
let TOOL_SCOPES: Registry["TOOL_SCOPES"];
let allTools: Registry["allTools"];
let executeTool: Registry["executeTool"];
let getTool: Registry["getTool"];
let listTools: Registry["listTools"];
let toAnthropicTools: Registry["toAnthropicTools"];
let toolInputJsonSchema: Registry["toolInputJsonSchema"];

let passed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`  ✓ ${name}`);
    })
    .catch((err: any) => {
      failures.push(`${name}: ${err?.message || err}`);
      console.log(`  ✗ ${name}`);
      console.log(`      ${err?.message || err}`);
    });
}

// ── Fixture: the pre-refactor hand-written schemas ──────────────────────────

const LEGACY_SCHEMAS: Record<string, unknown> = {
  get_business_overview: { type: "object", properties: {}, required: [] },
  get_projects: {
    type: "object",
    properties: {
      include_leads: { type: "boolean", description: "Include pipeline/lead projects." },
    },
    required: [],
  },
  get_project_detail: {
    type: "object",
    properties: {
      project_id: { type: "string", description: "The project ID to look up." },
    },
    required: ["project_id"],
  },
  get_tasks: {
    type: "object",
    properties: {
      filter: { type: "string", enum: ["overdue", "due_this_week", "all"] },
      project_id: { type: "string", description: "Optional: scope to one project." },
      limit: { type: "number", description: "Max number to return (default 20)." },
    },
    required: [],
  },
  get_bills: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["all", "unpaid", "overdue"] },
      project_id: { type: "string", description: "Optional: scope to one project." },
      limit: { type: "number" },
    },
    required: [],
  },
  get_client_invoices: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["all", "overdue", "sent", "draft", "paid"] },
      project_id: { type: "string", description: "Optional: scope to one project." },
    },
    required: [],
  },
  get_estimates: {
    type: "object",
    properties: {
      project_id: { type: "string", description: "Project ID (required)." },
    },
    required: ["project_id"],
  },
  get_team: { type: "object", properties: {}, required: [] },
  get_schedule_items: {
    type: "object",
    properties: {
      project_id: { type: "string", description: "Project ID (required)." },
      limit: { type: "number", description: "Max items to return (default 20)." },
    },
    required: ["project_id"],
  },
  get_site_diary_entries: {
    type: "object",
    properties: {
      project_id: { type: "string", description: "Optional: scope to one project." },
      limit: { type: "number", description: "Max entries to return (default 10)." },
    },
    required: [],
  },
  get_channel_messages: {
    type: "object",
    properties: {
      project_id: { type: "string", description: "Optional: scope to channels for this project." },
      limit: { type: "number", description: "Max messages to return (default 15)." },
    },
    required: [],
  },
  get_blocked_items: { type: "object", properties: {}, required: [] },
  create_task: {
    type: "object",
    properties: {
      title: { type: "string", description: "Task title (required)." },
      project_id: { type: "string", description: "Project to attach to." },
      due_date: { type: "string", description: "Due date as YYYY-MM-DD." },
      assignee_name: { type: "string", description: "Name of person to assign to." },
    },
    required: ["title"],
  },
  update_task: {
    type: "object",
    properties: {
      task_id: { type: "string", description: "Task ID to update (required)." },
      status: { type: "string", enum: ["todo", "in-progress", "done"] },
      due_date: { type: "string", description: "New due date as YYYY-MM-DD." },
      assignee_name: { type: "string", description: "New assignee name." },
    },
    required: ["task_id"],
  },
  create_schedule_item: {
    type: "object",
    properties: {
      project_id: { type: "string", description: "Project ID (required)." },
      name: { type: "string", description: "Schedule item name (required)." },
      type: {
        type: "string",
        enum: ["task", "milestone", "inspection", "delivery", "meeting"],
        description: "Item type (default: task).",
      },
      start_date: { type: "string", description: "Start date as YYYY-MM-DD (required)." },
      end_date: { type: "string", description: "End date as YYYY-MM-DD (required)." },
    },
    required: ["project_id", "name", "start_date", "end_date"],
  },
  log_blocked_item: {
    type: "object",
    properties: {
      description: { type: "string", description: "Description of what is blocked." },
    },
    required: ["description"],
  },
  resolve_blocked_item: {
    type: "object",
    properties: {
      blocked_item_id: { type: "string", description: "ID of the blocked item to resolve." },
    },
    required: ["blocked_item_id"],
  },
  add_project_note: {
    type: "object",
    properties: {
      project_id: { type: "string", description: "Project ID (required)." },
      title: { type: "string", description: "Note title." },
      content: { type: "string", description: "Note body." },
    },
    required: ["project_id", "title"],
  },
  create_site_diary_entry: {
    type: "object",
    properties: {
      project_id: { type: "string", description: "Project ID (required)." },
      content: { type: "string", description: "Site diary content." },
      date: { type: "string", description: "Date as YYYY-MM-DD. Defaults to today." },
    },
    required: ["project_id", "content"],
  },
};

/**
 * The one accepted difference from the legacy schemas.
 *
 * Required strings are now `z.string().min(1)`, which surfaces as
 * `minLength: 1`. The old code enforced exactly this at runtime (`if
 * (!input.project_id) return ...`) but never advertised it, so the model could
 * legally send "" and get a rejection it had no way to anticipate. Publishing
 * the constraint is a strict improvement, and it is whitelisted here rather
 * than baked into the fixture so the fixture stays an honest record of what
 * actually shipped before the refactor.
 */
function stripAcceptedAdditions(value: any): any {
  if (Array.isArray(value)) return value.map(stripAcceptedAdditions);
  if (value && typeof value === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === "minLength" && v === 1) continue;
      out[k] = stripAcceptedAdditions(v);
    }
    return out;
  }
  return value;
}

/** Property order is irrelevant to JSON Schema; compare order-insensitively. */
function sortKeysDeep(value: any): any {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc: any, k) => {
        acc[k] = sortKeysDeep(value[k]);
        return acc;
      }, {});
  }
  return value;
}

function ctx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    companyId: "company-a",
    userId: "user-a",
    scopes: ALL_TOOL_SCOPES,
    hasPermission: () => true,
    ...overrides,
  };
}

async function main() {
  ({
    ALL_TOOL_SCOPES,
    READ_ONLY_TOOL_SCOPES,
    TOOL_SCOPES,
    allTools,
    executeTool,
    getTool,
    listTools,
    toAnthropicTools,
    toolInputJsonSchema,
  } = await import("../tools"));

  console.log("\nTool registry\n");

  // ── Schema parity ─────────────────────────────────────────────────────────

  await check("registry exposes exactly the pre-refactor tool set", () => {
    const actual = allTools()
      .map((t) => t.name)
      .sort();
    const expected = Object.keys(LEGACY_SCHEMAS).sort();
    assert.deepStrictEqual(actual, expected);
  });

  for (const [name, legacy] of Object.entries(LEGACY_SCHEMAS)) {
    await check(`${name} — generated schema matches the hand-written one`, () => {
      const tool = getTool(name);
      assert.ok(tool, `${name} is missing from the registry`);
      assert.deepStrictEqual(
        sortKeysDeep(stripAcceptedAdditions(toolInputJsonSchema(tool!))),
        sortKeysDeep(legacy),
        `${name} schema drifted — the model will see a different tool definition`,
      );
    });
  }

  await check("toAnthropicTools emits name/description/input_schema for every tool", () => {
    const tools = toAnthropicTools();
    assert.strictEqual(tools.length, allTools().length);
    for (const t of tools) {
      assert.ok(t.name, "tool missing name");
      assert.ok(t.description && t.description.length > 20, `${t.name} description too thin`);
      assert.strictEqual((t.input_schema as any).type, "object");
      assert.ok(Array.isArray((t.input_schema as any).required));
    }
  });

  // ── Structural invariants ────────────────────────────────────────────────

  await check("every tool declares a known scope, and mutates agrees with it", () => {
    for (const tool of allTools()) {
      assert.ok(
        (TOOL_SCOPES as readonly string[]).includes(tool.scope),
        `${tool.name}: unknown scope ${tool.scope}`,
      );
      assert.strictEqual(
        tool.scope.startsWith("write:"),
        tool.mutates,
        `${tool.name}: mutates/scope mismatch`,
      );
    }
  });

  await check("no tool accepts a company id as input", () => {
    for (const tool of allTools()) {
      const props = Object.keys((toolInputJsonSchema(tool) as any).properties ?? {});
      for (const p of props) {
        assert.ok(
          !/^company_?id$/i.test(p),
          `${tool.name} accepts "${p}" — the tenant must come from the credential`,
        );
      }
    }
  });

  await check("every definition file scopes its queries to ctx.companyId", () => {
    // Smoke test, not a proof: it catches the realistic regression of a new
    // tool file that queries without ever referencing the caller's company.
    const here = dirname(fileURLToPath(import.meta.url));
    const dir = join(here, "..", "tools", "definitions");
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts") && f !== "shared.ts");
    assert.ok(files.length > 0, "no definition files found");
    for (const file of files) {
      const src = readFileSync(join(dir, file), "utf8");
      assert.ok(
        src.includes("ctx.companyId") || src.includes("projectBelongsToCompany"),
        `${file} never references ctx.companyId or projectBelongsToCompany`,
      );
    }
  });

  // ── Scope gating ─────────────────────────────────────────────────────────

  await check("read-only scopes expose no mutating tools", () => {
    const visible = listTools(READ_ONLY_TOOL_SCOPES);
    assert.ok(visible.length > 0, "read-only set is empty");
    for (const t of visible) {
      assert.strictEqual(t.mutates, false, `${t.name} is mutating but visible read-only`);
    }
  });

  await check("a read-only credential cannot execute a write tool", async () => {
    const result = await executeTool(
      "create_task",
      { title: "should not be created" },
      ctx({ scopes: READ_ONLY_TOOL_SCOPES }),
    );
    assert.strictEqual(result.success, false);
    assert.match(result.error || "", /requires the "write:tasks" scope/);
  });

  await check("scope is checked before input validation", async () => {
    // Invalid input AND missing scope: the scope error must win, so an
    // out-of-scope tool never reveals anything about its arguments.
    const result = await executeTool("create_task", {}, ctx({ scopes: READ_ONLY_TOOL_SCOPES }));
    assert.strictEqual(result.success, false);
    assert.match(result.error || "", /scope/);
  });

  await check("a denied permission blocks execution", async () => {
    const result = await executeTool(
      "create_task",
      { title: "nope" },
      ctx({ hasPermission: () => false }),
    );
    assert.strictEqual(result.success, false);
    assert.match(result.error || "", /Insufficient permissions: tasks\.manage:add/);
  });

  // ── Dispatch ─────────────────────────────────────────────────────────────

  await check("unknown tool name is reported as before", async () => {
    const result = await executeTool("get_everything", {}, ctx());
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, "Unknown tool: get_everything");
  });

  await check("missing required input keeps the legacy error wording", async () => {
    const result = await executeTool("get_estimates", {}, ctx());
    assert.strictEqual(result.success, false);
    assert.match(result.error || "", /project_id is required/);
  });

  await check("log_blocked_item refuses without a conversation", async () => {
    const result = await executeTool(
      "log_blocked_item",
      { description: "stuck on siding" },
      ctx({ conversationId: undefined }),
    );
    assert.strictEqual(result.success, false);
    assert.match(result.error || "", /only available inside an AI conversation/);
  });

  console.log(`\n${passed} passed, ${failures.length} failed\n`);
  if (failures.length) {
    for (const f of failures) console.error(`  FAIL  ${f}`);
    process.exit(1);
  }
  // Importing the registry pulls in the storage layer, which opens a Neon pool
  // against the placeholder DATABASE_URL and keeps retrying in the background.
  // Nothing here uses it; exit rather than wait it out.
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
