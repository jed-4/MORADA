import { z } from "zod";
import { storage } from "../../storage";
import type { MoradaTool } from "../types";
import { requiredString } from "./shared";

/**
 * Blocked items are an artefact of the in-app assistant's "circuit" flow rather
 * than a Morada feature with its own screen, so there is no permission key in
 * the catalogue that corresponds to them. That is why these three carry no
 * `permission` — not an oversight. Scope alone gates them.
 */
export const blockedItemTools: MoradaTool[] = [
  {
    name: "get_blocked_items",
    description: "Get open (unresolved) blocked items previously logged in AI conversations.",
    inputSchema: z.object({}),
    scope: "read:blocked",
    mutates: false,
    async handler(ctx) {
      const items = await storage.getAiBlockedItems(ctx.companyId, false);
      return { success: true, data: items };
    },
  },

  {
    name: "log_blocked_item",
    description: "Log a blocked item — something stuck, blocked, or needing follow-up.",
    inputSchema: z.object({
      description: requiredString("description").describe("Description of what is blocked."),
    }),
    scope: "write:blocked",
    mutates: true,
    async handler(ctx, input) {
      // Blocked items hang off an AI conversation. Callers without one (MCP)
      // have nothing to attach the row to, so refuse rather than write a
      // dangling record.
      if (!ctx.conversationId) {
        return {
          success: false,
          error: "log_blocked_item is only available inside an AI conversation.",
        };
      }
      const item = await storage.createAiBlockedItem({
        companyId: ctx.companyId,
        userId: ctx.userId,
        conversationId: ctx.conversationId,
        description: input.description,
      });
      return {
        success: true,
        data: { id: item.id, message: `Blocked item logged: "${input.description}"` },
      };
    },
  },

  {
    name: "resolve_blocked_item",
    description: "Mark a previously logged blocked item as resolved.",
    inputSchema: z.object({
      blocked_item_id: requiredString("blocked_item_id").describe(
        "ID of the blocked item to resolve.",
      ),
    }),
    scope: "write:blocked",
    mutates: true,
    async handler(ctx, input) {
      // resolveAiBlockedItem takes companyId and scopes the update itself.
      const item = await storage.resolveAiBlockedItem(input.blocked_item_id, ctx.companyId);
      if (!item) return { success: false, error: "Blocked item not found" };
      return { success: true, data: { id: item.id, message: "Blocked item resolved." } };
    },
  },
];
