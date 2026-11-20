// One-off import of a company's Notion "Task Library" and "Asset Library"
// databases into Operations. Driven by scripts/import-notion-operations.ts;
// nothing in the app calls it.
//
// Two halves, kept apart so the mapping can be tested without Notion:
//   - readNotion(): talks to the Notion REST API and returns plain data
//     (rows + page bodies as HTML). Read-only on the Notion side.
//   - applyNotionImport(): writes that data into ONE company.
//
// What lands where:
//   Task Library row  → task template, INACTIVE, + its page body as an SOP doc
//                       (draft) linked by sopDocId. The body's to-do items
//                       become the template's checklist.
//   Asset Library row → Library doc (draft). A row with no body but a Google
//                       Drive file becomes a link-only doc.
// Nothing is approved and nothing generates To-Dos until someone in that
// company reviews it — the same rule as the starter pack.
//
// Re-runnable: every imported item is recorded in operations_starter_installs
// under a "notion:" key (pack_version 0), so a second run only adds rows that
// are new in Notion, and never touches anything already imported (or edited
// since) in Morada.

import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import * as schema from "@shared/schema";

// ---------------------------------------------------------------------------
// Notion shapes (only the parts we read)

type RichText = {
  type: "text" | "mention" | "equation";
  plain_text: string;
  href: string | null;
  annotations?: { bold?: boolean; italic?: boolean; strikethrough?: boolean; underline?: boolean; code?: boolean };
};
export type NotionBlock = {
  id: string;
  type: string;
  has_children?: boolean;
  children?: NotionBlock[];
  [key: string]: any;
};
export type NotionPage = {
  id: string;
  url: string;
  properties: Record<string, any>;
};

// ---------------------------------------------------------------------------
// Block → HTML. Only produces what the Library editor (Tiptap StarterKit +
// task lists + images) can hold: Tiptap silently drops anything else on load,
// so a table or a toggle written as-is would vanish the first time the doc
// was opened. Tables become bullet lists, toggles become a bold line with the
// contents under it.

export type ConvertStats = {
  images: number; // Notion-hosted files: their URLs expire within the hour
  childPages: number; // sub-pages and inline databases (not followed)
  unsupported: Record<string, number>;
};

export function emptyStats(): ConvertStats {
  return { images: 0, childPages: 0, unsupported: {} };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function richTextToHtml(rt: RichText[] | undefined): string {
  if (!rt) return "";
  return rt.map((r) => {
    let out = esc(r.plain_text).replace(/\n/g, "<br>");
    const a = r.annotations ?? {};
    if (a.code) out = `<code>${out}</code>`;
    if (a.bold) out = `<strong>${out}</strong>`;
    if (a.italic) out = `<em>${out}</em>`;
    if (a.strikethrough) out = `<s>${out}</s>`;
    if (a.underline) out = `<u>${out}</u>`;
    if (r.href && /^(https?:|mailto:)/i.test(r.href)) out = `<a href="${esc(r.href)}">${out}</a>`;
    return out;
  }).join("");
}

export function plainText(rt: RichText[] | undefined): string {
  return (rt ?? []).map((r) => r.plain_text).join("").trim();
}

const LIST_TAG: Record<string, string> = {
  bulleted_list_item: "ul",
  numbered_list_item: "ol",
  to_do: "taskList",
};

function openList(kind: string): string {
  return kind === "taskList" ? `<ul data-type="taskList">` : `<${kind}>`;
}
function closeList(kind: string): string {
  return kind === "taskList" ? "</ul>" : `</${kind}>`;
}

export function blocksToHtml(blocks: NotionBlock[], stats: ConvertStats, checklist?: string[]): string {
  let html = "";
  let list: string | null = null;
  for (const b of blocks) {
    const kind = LIST_TAG[b.type] ?? null;
    if (list && kind !== list) { html += closeList(list); list = null; }
    if (kind && !list) { html += openList(kind); list = kind; }
    html += blockToHtml(b, stats, checklist);
  }
  if (list) html += closeList(list);
  return html;
}

function children(b: NotionBlock, stats: ConvertStats, checklist?: string[]): string {
  return b.children?.length ? blocksToHtml(b.children, stats, checklist) : "";
}

function blockToHtml(b: NotionBlock, stats: ConvertStats, checklist?: string[]): string {
  const v = b[b.type] ?? {};
  const text = richTextToHtml(v.rich_text);
  switch (b.type) {
    case "paragraph":
      return (text ? `<p>${text}</p>` : "") + children(b, stats, checklist);
    case "heading_1":
    case "heading_2":
    case "heading_3": {
      const level = b.type.slice(-1);
      return (text ? `<h${level}>${text}</h${level}>` : "") + children(b, stats, checklist);
    }
    case "bulleted_list_item":
    case "numbered_list_item":
      return `<li><p>${text}</p>${children(b, stats, checklist)}</li>`;
    case "to_do": {
      const label = plainText(v.rich_text);
      if (label && checklist && !checklist.includes(label)) checklist.push(label);
      return `<li data-type="taskItem" data-checked="${v.checked ? "true" : "false"}"><p>${text}</p>${children(b, stats, checklist)}</li>`;
    }
    case "toggle":
      return (text ? `<p><strong>${text}</strong></p>` : "") + children(b, stats, checklist);
    case "quote":
      return `<blockquote><p>${text}</p>${children(b, stats, checklist)}</blockquote>`;
    case "callout": {
      const icon = v.icon?.type === "emoji" ? `${esc(v.icon.emoji)} ` : "";
      return `<blockquote><p>${icon}${text}</p>${children(b, stats, checklist)}</blockquote>`;
    }
    case "divider":
      return "<hr>";
    case "code":
      return `<pre><code>${esc(plainText(v.rich_text))}</code></pre>`;
    case "equation":
      return `<p><code>${esc(v.expression ?? "")}</code></p>`;
    case "table":
      return tableToHtml(b, v.has_column_header !== false);
    case "column_list":
    case "column":
    case "synced_block":
      return children(b, stats, checklist);
    case "bookmark":
    case "embed":
    case "link_preview": {
      const url: string | undefined = v.url;
      if (!url) return "";
      const caption = plainText(v.caption) || url;
      return `<p><a href="${esc(url)}">${esc(caption)}</a></p>`;
    }
    case "image":
    case "file":
    case "pdf":
    case "video":
    case "audio": {
      // External files keep working as links. Notion-hosted ones are signed
      // URLs that die within the hour, so all we can leave is a pointer.
      const caption = plainText(v.caption);
      if (v.type === "external" && v.external?.url) {
        const url = v.external.url as string;
        if (b.type === "image") return `<img src="${esc(url)}" alt="${esc(caption)}">`;
        return `<p><a href="${esc(url)}">${esc(caption || url)}</a></p>`;
      }
      stats.images++;
      return `<p><em>[${b.type === "image" ? "Image" : "File"} left in Notion${caption ? `: ${esc(caption)}` : ""}]</em></p>`;
    }
    case "child_page":
    case "child_database":
      stats.childPages++;
      return `<p><em>[Notion ${b.type === "child_page" ? "page" : "database"} not imported: ${esc(v.title ?? "")}]</em></p>`;
    case "table_of_contents":
    case "breadcrumb":
      return "";
    default:
      stats.unsupported[b.type] = (stats.unsupported[b.type] ?? 0) + 1;
      return text ? `<p>${text}</p>` : "";
  }
}

// A table becomes one bullet per row: "Header: value · Header: value". A row
// whose first cell is empty is skipped — that is a template's blank row
// (the SOP template's notes log ships three of them), not data.
function tableToHtml(b: NotionBlock, hasHeader: boolean): string {
  const rows: string[][] = (b.children ?? [])
    .filter((r) => r.type === "table_row")
    .map((r) => (r.table_row?.cells ?? []).map((c: RichText[]) => richTextToHtml(c)));
  if (!rows.length) return "";
  const header = hasHeader ? rows[0].map((h) => h.replace(/<[^>]+>/g, "")) : null;
  const body = hasHeader ? rows.slice(1) : rows;
  const items = body
    .filter((cells) => cells[0]?.replace(/<[^>]+>|\s/g, ""))
    .map((cells) => cells
      .map((c, i) => (c ? (header?.[i] ? `${esc(header[i])}: ${c}` : c) : ""))
      .filter(Boolean)
      .join(" · "));
  return items.length ? `<ul>${items.map((i) => `<li><p>${i}</p></li>`).join("")}</ul>` : "";
}

export function htmlToText(html: string): string {
  return html
    .replace(/<\/(p|li|h[1-6]|blockquote|pre)>/g, "\n")
    .replace(/<br>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&amp;/g, "&")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Row mapping

function prop(page: NotionPage, name: string): any {
  return page.properties?.[name];
}
function propText(page: NotionPage, name: string): string {
  const p = prop(page, name);
  if (!p) return "";
  if (p.type === "title") return plainText(p.title);
  if (p.type === "rich_text") return plainText(p.rich_text);
  if (p.type === "select") return p.select?.name ?? "";
  if (p.type === "url") return p.url ?? "";
  if (p.type === "number") return p.number == null ? "" : String(p.number);
  return "";
}
function propNumber(page: NotionPage, name: string): number | null {
  const p = prop(page, name);
  return p?.type === "number" && typeof p.number === "number" ? p.number : null;
}
function propRelationIds(page: NotionPage, name: string): string[] {
  const p = prop(page, name);
  return p?.type === "relation" ? (p.relation ?? []).map((r: { id: string }) => r.id) : [];
}

// Notion "Stage" select → a Morada category and Library folder name.
const STAGE_LABELS: Record<string, string> = {
  SALES: "Sales",
  PRECON: "Pre-construction",
  CONSTRUCTION: "Construction",
  MARKETING: "Marketing",
  "PM SOFTWARE": "PM software",
  OPERATIONS: "Operations",
};
function stageLabel(raw: string): string {
  if (!raw) return "Operations";
  return STAGE_LABELS[raw.toUpperCase()] ?? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

export type ImportTask = {
  notionId: string;
  notionUrl: string;
  title: string;
  goal: string;
  description: string;
  category: string;
  frequency: "daily" | "weekly" | "monthly" | "once";
  notionFrequency: string;
  minutes: number | null;
  roleName: string; // Notion "Role", matched to a company role by name
  links: string[];
  checklist: string[];
  sopHtml: string; // "" = page has no body worth keeping
};

export type ImportAsset = {
  notionId: string;
  notionUrl: string;
  title: string;
  docType: schema.LibraryDocType;
  folder: string;
  tags: string[];
  html: string;
  linkUrl: string | null;
};

export type NotionImportData = {
  tasks: ImportTask[];
  assets: ImportAsset[];
  stats: ConvertStats;
};

// Mon–Fri. Notion "Daily" has no days, and the generator would otherwise
// make a To-Do on Saturday and Sunday too.
export const WEEKDAYS = [1, 2, 3, 4, 5];
export const DEFAULT_START = "09:00";

const FREQUENCIES: Record<string, ImportTask["frequency"]> = {
  daily: "daily",
  weekly: "weekly",
  monthly: "monthly",
};

export function mapTaskRow(page: NotionPage, body: { html: string; checklist: string[] }, links: string[]): ImportTask {
  const notionFrequency = propText(page, "Frequency");
  const extra = [propText(page, "Video"), propText(page, "SOP Link"), ...links].filter((u) => /^https?:/i.test(u));
  return {
    notionId: page.id,
    notionUrl: page.url,
    title: propText(page, "Task Name") || "Untitled task",
    goal: propText(page, "Task Description"),
    description: propText(page, "Notes"),
    category: stageLabel(propText(page, "Stage")),
    frequency: FREQUENCIES[notionFrequency.toLowerCase()] ?? "once",
    notionFrequency,
    minutes: propNumber(page, "Minutes"),
    roleName: propText(page, "Role"),
    links: Array.from(new Set(extra)),
    checklist: body.checklist,
    sopHtml: htmlToText(body.html) ? body.html : "",
  };
}

const ASSET_TYPES: Record<string, schema.LibraryDocType> = {
  checklist: "checklist",
};

export function mapAssetRow(page: NotionPage, body: { html: string }, links: string[]): ImportAsset {
  const category = propText(page, "Category");
  const stage = propText(page, "Stage");
  const hasBody = !!htmlToText(body.html);
  return {
    notionId: page.id,
    notionUrl: page.url,
    title: propText(page, "Name") || "Untitled",
    docType: ASSET_TYPES[category.toLowerCase()] ?? "template",
    folder: category ? `Assets · ${category}` : "Assets",
    tags: [category, stage].filter(Boolean),
    html: body.html,
    // A body wins; a row that is only a pointer to a Drive file is kept as a
    // link-only doc so it still opens from the Library.
    linkUrl: hasBody ? null : links[0] ?? null,
  };
}

// ---------------------------------------------------------------------------
// Notion API

const NOTION_VERSION = "2022-06-28";

export class NotionClient {
  private last = 0;
  constructor(private token: string, private fetchImpl: typeof fetch = fetch) {}

  // Notion allows ~3 requests a second per integration.
  private async call(method: "GET" | "POST", path: string, body?: unknown, attempt = 0): Promise<any> {
    const wait = this.last + 350 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.last = Date.now();
    const res = await this.fetchImpl(`https://api.notion.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      const retryAfter = Number(res.headers.get("retry-after")) || 2 ** attempt;
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return this.call(method, path, body, attempt + 1);
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`Notion ${method} ${path} → ${res.status}: ${json?.message ?? res.statusText}`);
    }
    return json;
  }

  async queryDatabase(databaseId: string): Promise<NotionPage[]> {
    const out: NotionPage[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.call("POST", `/databases/${databaseId}/query`, { page_size: 100, start_cursor: cursor });
      out.push(...page.results.filter((r: any) => r.object === "page" && !r.archived && !r.in_trash));
      cursor = page.has_more ? page.next_cursor : undefined;
    } while (cursor);
    return out;
  }

  async blockTree(blockId: string, depth = 0): Promise<NotionBlock[]> {
    const out: NotionBlock[] = [];
    let cursor: string | undefined;
    do {
      const qs = `page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`;
      const page = await this.call("GET", `/blocks/${blockId}/children?${qs}`);
      out.push(...page.results);
      cursor = page.has_more ? page.next_cursor : undefined;
    } while (cursor);
    // Sub-pages are their own documents; everything else nests into its parent.
    for (const b of out) {
      if (b.has_children && depth < 8 && b.type !== "child_page" && b.type !== "child_database") {
        b.children = await this.blockTree(b.id, depth + 1);
      }
    }
    return out;
  }

  async page(pageId: string): Promise<NotionPage> {
    return this.call("GET", `/pages/${pageId}`);
  }
}

// A relation to a "Google files" row: the row's first URL property is the file.
async function relationUrls(client: NotionClient, ids: string[], cache: Map<string, string | null>): Promise<string[]> {
  const urls: string[] = [];
  for (const id of ids) {
    if (!cache.has(id)) {
      try {
        const p = await client.page(id);
        const url = Object.values(p.properties ?? {}).find((v: any) => v?.type === "url" && v.url) as any;
        cache.set(id, url?.url ?? null);
      } catch {
        cache.set(id, null);
      }
    }
    const u = cache.get(id);
    if (u) urls.push(u);
  }
  return urls;
}

export async function readNotion(
  client: NotionClient,
  opts: { taskDatabaseId?: string; assetDatabaseId?: string; limit?: number; log?: (m: string) => void },
): Promise<NotionImportData> {
  const stats = emptyStats();
  const log = opts.log ?? (() => {});
  const cache = new Map<string, string | null>();
  const tasks: ImportTask[] = [];
  const assets: ImportAsset[] = [];

  if (opts.taskDatabaseId) {
    const rows = (await client.queryDatabase(opts.taskDatabaseId)).slice(0, opts.limit);
    log(`Task Library: ${rows.length} rows`);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const checklist: string[] = [];
      const html = blocksToHtml(await client.blockTree(row.id), stats, checklist);
      const links = await relationUrls(client, propRelationIds(row, "Google File"), cache);
      tasks.push(mapTaskRow(row, { html, checklist }, links));
      if ((i + 1) % 10 === 0) log(`  read ${i + 1}/${rows.length}`);
    }
  }
  if (opts.assetDatabaseId) {
    const rows = (await client.queryDatabase(opts.assetDatabaseId)).slice(0, opts.limit);
    log(`Asset Library: ${rows.length} rows`);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const html = blocksToHtml(await client.blockTree(row.id), stats);
      const links = await relationUrls(client, propRelationIds(row, "Google Drive File"), cache);
      assets.push(mapAssetRow(row, { html }, links));
      if ((i + 1) % 10 === 0) log(`  read ${i + 1}/${rows.length}`);
    }
  }
  return { tasks, assets, stats };
}

// ---------------------------------------------------------------------------
// Write into one company

export type NotionImportResult = {
  folders: number;
  sops: number;
  tasks: number;
  assets: number;
  skipped: number; // already imported on an earlier run
  unmatchedRoles: string[]; // Notion roles with no company role of that name
};

const key = {
  folder: (name: string) => `notion:folder:${name.toLowerCase()}`,
  sop: (id: string) => `notion:sop:${id}`,
  task: (id: string) => `notion:task:${id}`,
  asset: (id: string) => `notion:asset:${id}`,
};

export async function applyNotionImport(
  companyId: string,
  user: { id: string; name: string },
  data: NotionImportData,
  opts: { roleMap?: Record<string, string>; dryRun?: boolean } = {},
): Promise<NotionImportResult> {
  // Roles are matched by name inside THIS company only. A Notion role can be
  // pointed at a differently-named Morada role with roleMap.
  const roles = await db.select({ id: schema.userRoles.id, name: schema.userRoles.name, userCategory: schema.userRoles.userCategory })
    .from(schema.userRoles)
    .where(eq(schema.userRoles.companyId, companyId));
  const roleByName = new Map(roles.filter((r) => r.userCategory === "team").map((r) => [r.name.toLowerCase(), r]));
  const resolveRole = (notionRole: string) => {
    if (!notionRole) return null;
    const target = opts.roleMap?.[notionRole] ?? notionRole;
    return roleByName.get(target.toLowerCase()) ?? null;
  };
  const unmatchedRoles = Array.from(new Set(data.tasks.map((t) => t.roleName).filter((r) => r && !resolveRole(r))));

  const result = await db.transaction(async (tx) => {
    const T = schema.operationsStarterInstalls;
    const folderNames = Array.from(new Set([
      ...data.tasks.filter((t) => t.sopHtml).map((t) => t.category),
      ...data.assets.map((a) => a.folder),
    ]));

    const planned = [
      ...folderNames.map((n) => ({ key: key.folder(n), kind: "folder" })),
      ...data.tasks.filter((t) => t.sopHtml).map((t) => ({ key: key.sop(t.notionId), kind: "doc" })),
      ...data.tasks.map((t) => ({ key: key.task(t.notionId), kind: "task" })),
      ...data.assets.map((a) => ({ key: key.asset(a.notionId), kind: "doc" })),
    ].map((i) => ({ ...i, id: randomUUID() }));

    const claimed = planned.length
      ? await tx.insert(T)
          .values(planned.map((i) => ({ companyId, itemKey: i.key, kind: i.kind, targetId: i.id, packVersion: 0 })))
          .onConflictDoNothing()
          .returning({ itemKey: T.itemKey, targetId: T.targetId })
      : [];
    const mine = new Map(claimed.map((r) => [r.itemKey, r.targetId!]));
    const skipped = planned.filter((p) => !p.key.startsWith("notion:folder:") && !mine.has(p.key)).length;

    // A folder from an earlier run is reused if the company still has it; a
    // folder of the same name the company made itself is reused too.
    const ids = new Map(mine);
    const existingFolders = await tx.select({ id: schema.docFolders.id, name: schema.docFolders.name })
      .from(schema.docFolders).where(eq(schema.docFolders.companyId, companyId));
    const earlier = await tx.select({ itemKey: T.itemKey, targetId: T.targetId }).from(T)
      .where(and(eq(T.companyId, companyId), inArray(T.itemKey, planned.filter((p) => p.kind !== "task").map((p) => p.key).concat("__none__"))));
    const liveFolderIds = new Set(existingFolders.map((f) => f.id));
    const newFolders: { id: string; name: string }[] = [];
    for (const name of folderNames) {
      const k = key.folder(name);
      const prior = earlier.find((e) => e.itemKey === k && !mine.has(k) && e.targetId && liveFolderIds.has(e.targetId));
      const sameName = existingFolders.find((f) => f.name.toLowerCase() === name.toLowerCase());
      if (prior) ids.set(k, prior.targetId!);
      else if (sameName) {
        ids.set(k, sameName.id);
        // The ledger row we just claimed points at a folder we won't create.
        if (mine.has(k)) await tx.update(T).set({ targetId: sameName.id }).where(and(eq(T.companyId, companyId), eq(T.itemKey, k)));
      } else if (mine.has(k)) newFolders.push({ id: mine.get(k)!, name });
    }
    // An SOP from an earlier run, for a task that is new this run (rare: the
    // task row was deleted from the ledger by hand). Only link it if it lives.
    const earlierSopIds = earlier.filter((e) => e.itemKey.startsWith("notion:sop:") && !mine.has(e.itemKey) && e.targetId);
    if (earlierSopIds.length) {
      const live = await tx.select({ id: schema.docs.id }).from(schema.docs)
        .where(and(eq(schema.docs.companyId, companyId), inArray(schema.docs.id, earlierSopIds.map((e) => e.targetId!))));
      const liveIds = new Set(live.map((r) => r.id));
      for (const e of earlierSopIds) if (liveIds.has(e.targetId!)) ids.set(e.itemKey, e.targetId!);
    }

    if (newFolders.length) {
      const start = existingFolders.length;
      await tx.insert(schema.docFolders).values(newFolders.map((f, i) => ({
        id: f.id, companyId, name: f.name, parentFolderId: null, sortOrder: start + i,
      })));
    }

    const sops = data.tasks.filter((t) => t.sopHtml && mine.has(key.sop(t.notionId)));
    if (sops.length) {
      await tx.insert(schema.docs).values(sops.map((t) => ({
        id: mine.get(key.sop(t.notionId))!,
        companyId,
        folderId: ids.get(key.folder(t.category)) ?? null,
        title: t.title,
        contentHtml: t.sopHtml,
        contentText: htmlToText(t.sopHtml),
        ownerId: user.id,
        ownerName: user.name,
        docType: "sop",
        status: "draft",
        tags: [t.category, "Notion import"],
      })));
    }

    const assets = data.assets.filter((a) => mine.has(key.asset(a.notionId)));
    if (assets.length) {
      await tx.insert(schema.docs).values(assets.map((a) => ({
        id: mine.get(key.asset(a.notionId))!,
        companyId,
        folderId: ids.get(key.folder(a.folder)) ?? null,
        title: a.title,
        contentHtml: a.html,
        contentText: htmlToText(a.html),
        ownerId: user.id,
        ownerName: user.name,
        docType: a.docType,
        status: "draft",
        tags: [...a.tags, "Notion import"],
        linkUrl: a.linkUrl,
      })));
    }

    const tasks = data.tasks.filter((t) => mine.has(key.task(t.notionId)));
    if (tasks.length) {
      await tx.insert(schema.taskTemplates).values(tasks.map((t) => {
        const role = resolveRole(t.roleName);
        const days = t.frequency === "daily" ? WEEKDAYS : t.frequency === "weekly" ? [1] : [];
        const minutes = t.minutes && t.minutes > 0 ? Math.round(t.minutes) : null;
        return {
          id: mine.get(key.task(t.notionId))!,
          companyId,
          scope: "business",
          title: t.title,
          goal: t.goal || null,
          description: t.description || null,
          assigneeType: "role",
          defaultRoleId: role?.id ?? null,
          defaultRoleName: role?.name ?? null,
          frequency: t.frequency,
          dueDayOfWeek: t.frequency === "weekly" ? days : [],
          dueDayOfMonth: t.frequency === "monthly" ? 1 : null,
          dueTime: DEFAULT_START,
          isRecurringTemplate: t.frequency !== "once",
          recurringDays: days,
          recurringSchedule: days.map((dayOfWeek) => ({ dayOfWeek, startTime: DEFAULT_START, duration: minutes ?? 30 })),
          estimatedDuration: minutes,
          checklist: t.checklist.map((text) => ({ text, completed: false })),
          externalLinks: t.links,
          sopDocId: ids.get(key.sop(t.notionId)) ?? null,
          isActive: false,
          category: t.category,
          createdBy: user.id,
          createdByName: user.name,
        };
      }));
    }

    const out: NotionImportResult = {
      folders: newFolders.length,
      sops: sops.length,
      tasks: tasks.length,
      assets: assets.length,
      skipped,
      unmatchedRoles,
    };
    // A dry run does every write, reports, then rolls the lot back — so the
    // report is exactly what --apply would do, constraints included.
    if (opts.dryRun) throw new DryRunRollback(out);
    return out;
  }).catch((e) => {
    if (e instanceof DryRunRollback) return e.result;
    throw e;
  });
  return result;
}

class DryRunRollback extends Error {
  constructor(public result: NotionImportResult) {
    super("dry run");
  }
}
