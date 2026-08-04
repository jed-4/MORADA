import type { z } from "zod";

/**
 * Transport-agnostic tool layer.
 *
 * Both the in-app Morada AI assistant (server/routes.ts → /api/ai/*) and the
 * external MCP server (server/mcp/, Phase 1+) dispatch through this registry.
 * Neither reaches the database on its own — a tool that bypasses this layer is
 * a tool whose tenancy and permission story has never been reviewed.
 */

export type PermissionAction =
  | "view"
  | "add"
  | "edit"
  | "delete"
  | "approve"
  | "send"
  | "convert"
  | "summary_only";

/**
 * Capability scopes. A credential carries a set of these; the registry refuses
 * any tool whose scope is not in that set, before the handler runs.
 *
 * Read and write are separate scopes for the same domain so a read-only token
 * cannot mutate, and the split is enforced structurally: `mutates` must agree
 * with the scope prefix (asserted at module load in registry.ts).
 */
export const TOOL_SCOPES = [
  "read:projects",
  "read:tasks",
  "write:tasks",
  "read:financials",
  "read:schedule",
  "write:schedule",
  "read:site",
  "write:site",
  "read:messages",
  "write:notes",
  "read:blocked",
  "write:blocked",
] as const;

export type ToolScope = (typeof TOOL_SCOPES)[number];

export const ALL_TOOL_SCOPES: readonly ToolScope[] = TOOL_SCOPES;

export const READ_ONLY_TOOL_SCOPES: readonly ToolScope[] = TOOL_SCOPES.filter((s) =>
  s.startsWith("read:"),
);

export interface ToolContext {
  /**
   * The tenant. ALWAYS derived from the caller's credential — the session user
   * for the in-app assistant, the access token for MCP. Never from tool input:
   * no tool may accept a company id as an argument, and every handler must
   * filter on this value.
   */
  companyId: string;

  /** The acting user. Used for authorship stamps and channel visibility. */
  userId: string;

  /** Scopes granted to this credential. */
  scopes: readonly ToolScope[];

  /**
   * Permission check, deliberately injected rather than imported.
   *
   * `requirePermission` in server/middleware/auth.ts returns `next()`
   * unconditionally when NODE_ENV === "development", so a tool that called it
   * directly would be unenforced in exactly the environment we develop against.
   * Callers supply a checker appropriate to their transport.
   */
  hasPermission(key: string, action: PermissionAction): boolean | Promise<boolean>;

  /**
   * The AI conversation this call belongs to. Present only for the in-app
   * assistant; tools that genuinely need it must guard for its absence rather
   * than assume it.
   */
  conversationId?: string;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface MoradaTool<S extends z.ZodTypeAny = z.ZodTypeAny> {
  /** Wire name. Unique across the registry. */
  name: string;

  /** Shown to the model. This is the whole basis on which it decides to call. */
  description: string;

  /** Authored in zod; JSON Schema for Anthropic and MCP is generated from it. */
  inputSchema: S;

  scope: ToolScope;

  /** True when the tool writes. Must agree with the scope prefix. */
  mutates: boolean;

  /**
   * Role permission this tool corresponds to, when one exists. Declared here so
   * the enforcement point is a single place in the registry rather than 19
   * handlers; see ToolContext.hasPermission.
   */
  permission?: { key: string; action: PermissionAction };

  handler(ctx: ToolContext, input: z.infer<S>): Promise<ToolResult>;
}
