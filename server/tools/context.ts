import { ALL_TOOL_SCOPES } from "./types";
import type { ToolContext } from "./types";

/**
 * ToolContext for the in-app Morada AI assistant.
 *
 * Grants every scope and approves every permission check. That is deliberate,
 * and narrower than it looks: the assistant is only reachable through
 * /api/ai/* routes already gated by requireAuth + requireTeamMember, and it
 * acts as the signed-in user against their own company. Tightening what the
 * in-app assistant may do is a real product decision — it is not something to
 * change as a side effect of the MCP refactor, which is why the allow-all is
 * written here explicitly rather than left implicit.
 *
 * MCP credentials do NOT use this. They build their context from the access
 * token in server/mcp/auth.ts, with the token's own scopes and a permission
 * checker that reads the user's role — and no development bypass.
 */
export function aiAssistantContext(
  companyId: string,
  userId: string,
  conversationId: string,
): ToolContext {
  return {
    companyId,
    userId,
    conversationId,
    scopes: ALL_TOOL_SCOPES,
    hasPermission: () => true,
  };
}
