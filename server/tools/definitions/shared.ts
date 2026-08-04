import { z } from "zod";
import { db } from "../../db";
import * as schema from "@shared/schema";
import { and, eq } from "drizzle-orm";
import type { ToolContext } from "../types";

/**
 * Required string that reproduces the hand-written error text the tool layer
 * used before zod validation existed ("project_id is required"), so the model
 * sees the same failure messages it has always seen.
 */
export const requiredString = (field: string) =>
  z
    .string({
      required_error: `${field} is required`,
      invalid_type_error: `${field} must be a string`,
    })
    .min(1, `${field} is required`);

/**
 * The single tenancy gate for anything addressed by project id.
 *
 * Tool input is attacker-controlled in the MCP case — a project id is just a
 * string the model produced, and the model may be acting on text written by
 * someone outside this company. Every tool that takes a project_id must call
 * this before touching that project's data, and must report a miss as "not
 * found" rather than "forbidden" so the existence of another tenant's project
 * is never confirmed.
 */
export async function projectBelongsToCompany(
  ctx: ToolContext,
  projectId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.companyId, ctx.companyId)))
    .limit(1);
  return rows.length > 0;
}

export const PROJECT_NOT_FOUND = { success: false as const, error: "Project not found" };
