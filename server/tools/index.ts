/**
 * Morada's shared tool layer.
 *
 * One registry, two transports: the in-app AI assistant (server/routes.ts) and
 * the MCP server (server/mcp/, Phase 1+). Import from here, not from the
 * individual definition files.
 */
export { ALL_TOOL_SCOPES, READ_ONLY_TOOL_SCOPES, TOOL_SCOPES } from "./types";
export type {
  MoradaTool,
  PermissionAction,
  ToolContext,
  ToolResult,
  ToolScope,
} from "./types";

export {
  allTools,
  executeTool,
  getTool,
  listTools,
  toAnthropicTools,
  toolInputJsonSchema,
} from "./registry";

export { aiAssistantContext } from "./context";
