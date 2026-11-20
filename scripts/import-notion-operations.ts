/**
 * One-off: copy a company's Notion Task Library + Asset Library into
 * Operations (task templates, SOPs, Library docs). See
 * server/services/notionImport.ts for what lands where.
 *
 *   NOTION_TOKEN=secret_… npx tsx --env-file-if-exists=.env scripts/import-notion-operations.ts \
 *     --company <companyId> --as <userEmail> \
 *     --tasks <taskDatabaseId> --assets <assetDatabaseId> \
 *     [--role "Admin=Office Manager"] [--limit 5] [--save snapshot.json] [--apply]
 *
 *   # or replay a saved read without touching Notion again:
 *   npx tsx --env-file-if-exists=.env scripts/import-notion-operations.ts \
 *     --company <companyId> --as <userEmail> --from snapshot.json [--apply]
 *
 * DRY RUN BY DEFAULT. Without --apply it does every write inside a
 * transaction, prints the counts, and rolls it all back.
 *
 * NOTION_TOKEN is an internal integration's secret
 * (notion.so/profile/integrations). Share both databases with that
 * integration (••• → Connections) or the query returns 404. It only needs
 * "Read content".
 *
 * Writes go to the ONE company named by --company, and --as must be a team
 * member of that company. Running it twice only adds Notion rows that are new
 * since the last run; nothing already imported is changed.
 */

import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { and, eq } from "drizzle-orm";
import { db } from "../server/db";
import * as schema from "../shared/schema";
import { NotionClient, readNotion, applyNotionImport, type NotionImportData } from "../server/services/notionImport";

function parseArgs() {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const all = (flag: string) => argv.flatMap((a, i) => (a === flag && argv[i + 1] ? [argv[i + 1]] : []));
  const roleMap: Record<string, string> = {};
  for (const pair of all("--role")) {
    const [from, to] = pair.split("=").map((s) => s.trim());
    if (!from || !to) throw new Error(`--role must look like "Notion role=Morada role", got "${pair}"`);
    roleMap[from] = to;
  }
  const limit = get("--limit");
  return {
    companyId: get("--company"),
    asEmail: get("--as"),
    tasks: get("--tasks"),
    assets: get("--assets"),
    from: get("--from"),
    save: get("--save"),
    limit: limit ? Number(limit) : undefined,
    roleMap,
    apply: argv.includes("--apply"),
  };
}

async function main() {
  const args = parseArgs();
  if (!args.companyId || !args.asEmail) throw new Error("--company and --as are both required");
  if (!args.from && !args.tasks && !args.assets) throw new Error("Give --tasks and/or --assets (Notion database ids), or --from a snapshot");

  // Refusals before anything is read or written.
  const [company] = await db.select({ id: schema.companies.id, name: schema.companies.name })
    .from(schema.companies).where(eq(schema.companies.id, args.companyId));
  if (!company) throw new Error(`No company ${args.companyId}`);
  const [user] = await db.select({ id: schema.users.id, firstName: schema.users.firstName, lastName: schema.users.lastName, userCategory: schema.users.userCategory })
    .from(schema.users)
    .where(and(eq(schema.users.email, args.asEmail), eq(schema.users.companyId, company.id)));
  if (!user) throw new Error(`${args.asEmail} is not a user of ${company.name}`);
  if (user.userCategory && user.userCategory !== "team") throw new Error(`${args.asEmail} is not a team member`);
  const userName = [user.firstName, user.lastName].filter(Boolean).join(" ") || args.asEmail;

  console.log(`Company : ${company.name} (${company.id})`);
  console.log(`As      : ${userName}`);
  console.log(`Mode    : ${args.apply ? "APPLY" : "dry run (nothing is kept)"}\n`);

  let data: NotionImportData;
  if (args.from) {
    data = JSON.parse(readFileSync(args.from, "utf8"));
  } else {
    const token = process.env.NOTION_TOKEN;
    if (!token) throw new Error("NOTION_TOKEN is not set");
    data = await readNotion(new NotionClient(token), {
      taskDatabaseId: args.tasks,
      assetDatabaseId: args.assets,
      limit: args.limit,
      log: (m) => console.log(m),
    });
    if (args.save) {
      writeFileSync(args.save, JSON.stringify(data, null, 2));
      console.log(`Saved the read to ${args.save}`);
    }
  }

  const freq = data.tasks.reduce<Record<string, number>>((m, t) => ({ ...m, [t.notionFrequency || "(none)"]: (m[t.notionFrequency || "(none)"] ?? 0) + 1 }), {});
  console.log(`\nRead ${data.tasks.length} tasks (${data.tasks.filter((t) => t.sopHtml).length} with an SOP body) and ${data.assets.length} assets.`);
  console.log(`Notion frequencies: ${Object.entries(freq).map(([k, v]) => `${k} ${v}`).join(", ") || "—"}`);
  if (data.stats.images) console.log(`Images/files left in Notion (placeholder text instead): ${data.stats.images}`);
  if (data.stats.childPages) console.log(`Sub-pages not followed: ${data.stats.childPages}`);
  const unsupported = Object.entries(data.stats.unsupported);
  if (unsupported.length) console.log(`Unrecognised blocks (text kept where there was any): ${unsupported.map(([k, v]) => `${k} ${v}`).join(", ")}`);

  const result = await applyNotionImport(company.id, { id: user.id, name: userName }, data, {
    roleMap: args.roleMap,
    dryRun: !args.apply,
  });

  console.log(`\n${args.apply ? "Imported" : "Would import"}:`);
  console.log(`  folders ${result.folders}`);
  console.log(`  SOPs    ${result.sops}`);
  console.log(`  tasks   ${result.tasks}  (all switched OFF)`);
  console.log(`  assets  ${result.assets}`);
  if (result.skipped) console.log(`  already imported earlier, left alone: ${result.skipped}`);
  if (result.unmatchedRoles.length) {
    console.log(`\nNo Morada role called: ${result.unmatchedRoles.join(", ")} — those tasks are unassigned.`);
    console.log(`Point them at a role with --role "${result.unmatchedRoles[0]}=<Morada role name>".`);
  }
  if (!args.apply) console.log("\nDry run: nothing was kept. Add --apply to write it.");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
