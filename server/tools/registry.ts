import type { Tool } from "@anthropic-ai/sdk/resources";
import { zodToJsonSchema } from "zod-to-json-schema";
import { fromZodError } from "zod-validation-error";
import { z } from "zod";

import { ALL_TOOL_SCOPES, TOOL_SCOPES } from "./types";
import type { MoradaTool, ToolContext, ToolResult, ToolScope } from "./types";

import { projectTools } from "./definitions/projects";
import { taskTools } from "./definitions/tasks";
import { financeTools } from "./definitions/finance";
import { scheduleTools } from "./definitions/schedule";
import { siteTools } from "./definitions/site";
import { noteTools } from "./definitions/notes";
import { blockedItemTools } from "./definitions/blocked";

const TOOLS: MoradaTool[] = [
  ...projectTools,
  ...taskTools,
  ...financeTools,
  ...scheduleTools,
  ...siteTools,
  ...noteTools,
  ...blockedItemTools,
];

// ── Load-time invariants ────────────────────────────────────────────────────
// These are structural guarantees, not tests: a tool that violates one is a
// tool that would misbehave for every caller, so failing at import beats
// discovering it in production.
const byName = new Map<string, MoradaTool>();
for (const tool of TOOLS) {
  if (byName.has(tool.name)) {
    throw new Error(`[tools] duplicate tool name: ${tool.name}`);
  }
  if (!(TOOL_SCOPES as readonly string[]).includes(tool.scope)) {
    throw new Error(`[tools] ${tool.name} declares unknown scope: ${tool.scope}`);
  }
  const scopeIsWrite = tool.scope.startsWith("write:");
  if (scopeIsWrite !== tool.mutates) {
    throw new Error(
      `[tools] ${tool.name} has mutates=${tool.mutates} but scope "${tool.scope}" — ` +
        `a read-only credential is gated on the scope prefix, so the two must agree.`,
    );
  }
  if (!(tool.inputSchema instanceof z.ZodObject)) {
    throw new Error(`[tools] ${tool.name} inputSchema must be a z.object()`);
  }
  const shape = (tool.inputSchema as z.ZodObject<any>).shape;
  if ("company_id" in shape || "companyId" in shape) {
    throw new Error(
      `[tools] ${tool.name} accepts a company id as input. The tenant always comes ` +
        `from the credential (ToolContext.companyId) — never from the model.`,
    );
  }
  byName.set(tool.name, tool);
}

// ── JSON Schema ─────────────────────────────────────────────────────────────

/**
 * Generated once per tool. Normalised to the exact shape the tool layer emitted
 * when the schemas were hand-written, so the model sees no change: bare
 * `{ type, properties, required }`, with `required` always present.
 */
const jsonSchemaCache = new Map<string, Tool["input_schema"]>();

export function toolInputJsonSchema(tool: MoradaTool): Tool["input_schema"] {
  const cached = jsonSchemaCache.get(tool.name);
  if (cached) return cached;
  const raw = zodToJsonSchema(tool.inputSchema, {
    $refStrategy: "none",
    target: "jsonSchema7",
  }) as any;
  const schema = {
    type: "object" as const,
    properties: raw.properties ?? {},
    required: raw.required ?? [],
  };
  jsonSchemaCache.set(tool.name, schema);
  return schema;
}

// ── Lookup ──────────────────────────────────────────────────────────────────

export function getTool(name: string): MoradaTool | undefined {
  return byName.get(name);
}

export function listTools(scopes: readonly ToolScope[] = ALL_TOOL_SCOPES): MoradaTool[] {
  return TOOLS.filter((t) => scopes.includes(t.scope));
}

/** All tools, unfiltered. For registry tests and introspection. */
export function allTools(): readonly MoradaTool[] {
  return TOOLS;
}

const anthropicToolCache = new Map<string, Tool[]>();

/** Tool definitions in the shape the Anthropic Messages API expects. */
export function toAnthropicTools(scopes: readonly ToolScope[] = ALL_TOOL_SCOPES): Tool[] {
  const key = [...scopes].sort().join(",");
  const cached = anthropicToolCache.get(key);
  if (cached) return cached;
  const tools = listTools(scopes).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: toolInputJsonSchema(t),
  })) as Tool[];
  anthropicToolCache.set(key, tools);
  return tools;
}

// ── Dispatch ────────────────────────────────────────────────────────────────

/**
 * The single entry point for running a tool. Order matters: existence, then
 * scope, then permission, then input validation, then the handler. Anything
 * that fails earlier must not leak information about what exists later — an
 * out-of-scope tool reports the same way whether or not its arguments are valid.
 */
export async function executeTool(
  toolName: string,
  rawInput: unknown,
  ctx: ToolContext,
): Promise<ToolResult> {
  const tool = byName.get(toolName);
  if (!tool) return { success: false, error: `Unknown tool: ${toolName}` };

  if (!ctx.scopes.includes(tool.scope)) {
    return {
      success: false,
      error: `Tool "${toolName}" requires the "${tool.scope}" scope, which this credential does not have.`,
    };
  }

  if (tool.permission) {
    let allowed: boolean;
    try {
      allowed = await ctx.hasPermission(tool.permission.key, tool.permission.action);
    } catch (err: any) {
      console.error(`[tools] ${toolName} permission check failed:`, err);
      return { success: false, error: "Permission check failed" };
    }
    if (!allowed) {
      return {
        success: false,
        error: `Insufficient permissions: ${tool.permission.key}:${tool.permission.action} required`,
      };
    }
  }

  const parsed = tool.inputSchema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return { success: false, error: fromZodError(parsed.error).message };
  }

  try {
    return await tool.handler(ctx, parsed.data);
  } catch (err: any) {
    console.error(`[tools] ${toolName} error:`, err);
    return { success: false, error: err?.message || "Tool execution failed" };
  }
}
