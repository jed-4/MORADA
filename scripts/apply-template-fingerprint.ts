/**
 * Fingerprints "apply a selection template to a project" — the rows it produces.
 *
 *   npx tsx scripts/apply-template-fingerprint.ts [--out <dir>]
 *
 * Why: step 2 of the Product Library work swaps where apply reads its options
 * from — `selection_templates.templateData` (a JSON blob) becomes rows in
 * `products`. Applying a template is how a job gets its selections, so a
 * regression here silently corrupts real projects. What must NOT change is the
 * row set: the selections, options and attachments handed to the database.
 * This hashes that row set across a fixed corpus so "nothing moved" is a diff
 * rather than a claim.
 *
 * Three modes, all run by default:
 *
 *   1. EXTRACTION CHECK — runs shared/applyTemplate.ts against a verbatim copy
 *      of the pre-extraction code from server/routes.ts (`referenceLegacy` /
 *      `referenceFlat` below) and asserts they agree on every case. This is the
 *      proof that lifting the builders out of routes.ts changed nothing.
 *   2. MUTATION CHECK — deliberately breaks the builders in several ways and
 *      asserts the fingerprint notices. A check that cannot fail is worse than
 *      no check, because it manufactures confidence.
 *   3. FINGERPRINT — writes `fingerprint.txt` (one line per case) and
 *      `cases/<key>.json` (the full row sets). Run on both sides of step 2 and
 *      diff the directories.
 *
 * Determinism: ids come from a counter, not randomUUID; the corpus is fixed
 * literal data with no Date.now() and no Math.random(); deadlines are fixed ISO
 * strings; Dates are serialised as ISO so a Date and its string are
 * distinguishable in the hash.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  buildLegacyApplyRows,
  buildFlatApplyRows,
  optionFromRows,
  type ApplyContext,
  type ApplyRows,
} from "../shared/applyTemplate";
import { extractTemplateOptions } from "../shared/templateOptions";

const outIdx = process.argv.indexOf("--out");
const OUT = outIdx !== -1 ? process.argv[outIdx + 1] : "fingerprints/apply-template";

// ─────────────────────────────────────────────────────────────────────────────
// The reference: server/routes.ts as it stood BEFORE the extraction.
// Copied character for character apart from `randomUUID()` -> `ctx.newId()`.
// Do not refactor. Its only job is to disagree if the extraction drifted.
// ─────────────────────────────────────────────────────────────────────────────

function referenceLegacy(items: any[], ctx: ApplyContext): ApplyRows {
  const selectionRows = items.map((item) => ({
    id: ctx.newId(),
    projectId: ctx.projectId,
    name: item.itemName,
    description: item.description || null,
    category: item.categoryName || null,
    room: item.room || null,
    selectionType: ctx.selectionType || "selection",
    status: "draft",
    allowance: item.budgetAmount || null,
    clientCanSeePrice: item.clientCanSeePrice ?? true,
    clientCanChange: item.clientCanChange ?? true,
    deadline: item.deadline ? new Date(item.deadline) : null,
    sortOrder: item.sortOrder ?? 0,
    notes: item.notes || null,
  }));
  const optionRows: any[] = [];
  const attachmentRows: any[] = [];
  items.forEach((item, i) => {
    for (const opt of (item.options || [])) {
      const optionId = ctx.newId();
      optionRows.push({
        id: optionId,
        selectionId: selectionRows[i].id,
        name: opt.name,
        brand: opt.brand || null,
        sku: opt.sku || null,
        description: opt.description || null,
        category: opt.category || null,
        subcategory: opt.subcategory || null,
        unitCost: opt.unitCost ?? null,
        quantity: opt.quantity ?? null,
        unitType: opt.unitType || null,
        markupPercent: opt.markupPercent ?? null,
        totalCost: opt.totalCost ?? null,
        url: opt.url || null,
        visibleToClient: opt.visibleToClient ?? true,
        gstInclusive: opt.gstInclusive ?? false,
        sortOrder: opt.sortOrder ?? 0,
        specifications: opt.specifications || null,
      });
      const imageUrls: string[] = opt.imageUrls || (opt.imageUrl ? [opt.imageUrl] : []);
      imageUrls.forEach((filePath, idx) => {
        attachmentRows.push({
          optionId,
          fileName: filePath.split("/").pop() || "image.jpg",
          filePath,
          fileType: "image",
          mimeType: "image/jpeg",
          sortOrder: idx,
        });
      });
    }
  });
  return { selections: selectionRows, options: optionRows, attachments: attachmentRows };
}

function referenceFlat(template: any, items: any[], maxOrder: number, ctx: ApplyContext): ApplyRows {
  const tpl = template as any;
  const selectionId = ctx.newId();
  const selection = {
    id: selectionId,
    projectId: ctx.projectId,
    name: template.name,
    description: template.description || null,
    category: template.category || null,
    room: tpl.room || null,
    selectionType: template.selectionType || "selection",
    status: "draft",
    allowance: tpl.budgetAmount || null,
    clientCanSeePrice: tpl.clientCanSeePrice ?? true,
    clientCanChange: tpl.clientCanChange ?? true,
    deadline: tpl.deadline || null,
    sortOrder: maxOrder + 1,
    notes: null,
  };
  const optionRows: any[] = [];
  const attachmentRows: any[] = [];
  items.forEach((opt: any, idx: number) => {
    const optionId = ctx.newId();
    optionRows.push({
      id: optionId,
      selectionId: selection.id,
      name: opt.name,
      brand: opt.brand || null,
      sku: opt.sku || null,
      description: opt.description || null,
      category: opt.category || null,
      subcategory: opt.subcategory || null,
      unitCost: opt.unitCost ?? null,
      quantity: opt.quantity ?? null,
      unitType: opt.unitType || null,
      markupPercent: opt.markupPercent ?? null,
      totalCost: opt.totalCost ?? null,
      url: opt.url || null,
      visibleToClient: opt.visibleToClient ?? true,
      gstInclusive: opt.gstInclusive ?? false,
      sortOrder: opt.sortOrder ?? idx,
      specifications: opt.specifications || null,
    });
    const imageUrls: string[] = opt.imageUrls || (opt.imageUrl ? [opt.imageUrl] : []);
    imageUrls.forEach((filePath: string, imgIdx: number) => {
      attachmentRows.push({
        optionId,
        fileName: filePath.split("/").pop() || "image.jpg",
        filePath,
        fileType: "image",
        mimeType: "image/jpeg",
        sortOrder: imgIdx,
      });
    });
  });
  return { selections: [selection], options: optionRows, attachments: attachmentRows };
}

// ─────────────────────────────────────────────────────────────────────────────
// Corpus. Fixed literal data — every case is a real shape the blob takes, or a
// trap worth pinning. Names are stable because they become file names.
// ─────────────────────────────────────────────────────────────────────────────

interface Case {
  key: string;
  format: "legacy" | "flat";
  /** Template row fields the flat branch reads. Ignored by legacy. */
  template?: any;
  data: any[];
  maxOrder?: number;
  selectionType?: string;
}

const FULL_OPTION = {
  id: "o1",
  name: "Quad Gutter",
  brand: "Colorbond",
  sku: "QD-1",
  description: "150mm quad",
  category: "Guttering",
  subcategory: "Profiles",
  unitCost: 8450,
  quantity: 12,
  unitType: "lm",
  markupPercent: 7.5,
  totalCost: 109_020,
  url: "https://example.test/quad",
  visibleToClient: true,
  gstInclusive: false,
  sortOrder: 3,
  specifications: { material: "Colorbond", finish: "Monument" },
  imageUrls: ["/img/quad-a.jpg", "/img/quad-b.png"],
};

const CASES: Case[] = [
  { key: "legacy-empty", format: "legacy", data: [] },
  {
    key: "legacy-single-item-single-option",
    format: "legacy",
    data: [{ id: "i1", itemName: "Gutter profile", categoryName: "Roofing", options: [FULL_OPTION] }],
  },
  {
    key: "legacy-multi-item",
    format: "legacy",
    data: [
      { id: "i1", itemName: "Gutter profile", categoryName: "Roofing", sortOrder: 0, options: [{ name: "Quad" }, { name: "Half round" }] },
      { id: "i2", itemName: "Fascia colour", categoryName: "Roofing", sortOrder: 1, options: [{ name: "Monument" }] },
    ],
  },
  {
    key: "legacy-item-with-no-options",
    format: "legacy",
    data: [{ id: "i1", itemName: "Empty", categoryName: "Roofing" }, { id: "i2", itemName: "Has one", options: [{ name: "Quad" }] }],
  },
  {
    key: "legacy-bare-item",
    format: "legacy",
    // Nothing but a name. Pins every default in one case.
    data: [{ itemName: "Bare" }],
  },
  {
    key: "legacy-falsy-traps",
    format: "legacy",
    // budgetAmount 0 -> `|| null` makes it NULL; a $0 allowance is meaningful in
    // Morada. unitCost 0 -> `?? null` keeps the zero. Both pinned deliberately.
    data: [{
      itemName: "Zeroes",
      budgetAmount: 0,
      description: "",
      room: "",
      notes: "",
      sortOrder: 0,
      clientCanSeePrice: false,
      clientCanChange: false,
      options: [{ name: "Included", unitCost: 0, quantity: 0, markupPercent: 0, totalCost: 0, sortOrder: 0, visibleToClient: false, gstInclusive: true }],
    }],
  },
  {
    key: "legacy-option-order-collapse",
    format: "legacy",
    // No option carries sortOrder, and the legacy branch defaults every one to 0
    // rather than to its index. Ordering is lost. Pinned so step 2 preserves it.
    data: [{ itemName: "Unordered", options: [{ name: "A" }, { name: "B" }, { name: "C" }] }],
  },
  {
    key: "legacy-deadline",
    format: "legacy",
    data: [{ itemName: "Dated", deadline: "2026-11-30T00:00:00.000Z", options: [] }],
  },
  {
    key: "legacy-single-imageUrl",
    format: "legacy",
    data: [{ itemName: "Imaged", options: [{ name: "A", imageUrl: "/img/only.jpg" }] }],
  },
  {
    key: "legacy-image-url-with-no-slash",
    format: "legacy",
    // `filePath.split("/").pop() || "image.jpg"` — the fallback only fires for
    // an empty string, so a trailing slash is the case that reaches it.
    data: [{ itemName: "Odd", options: [{ name: "A", imageUrls: ["bare.jpg", "trailing/", ""] }] }],
  },
  {
    key: "legacy-null-options-list",
    format: "legacy",
    data: [{ itemName: "NullOpts", options: null }],
  },

  { key: "flat-empty", format: "flat", template: { name: "Gutter profile" }, data: [] },
  {
    key: "flat-full",
    format: "flat",
    template: {
      name: "Gutter profile",
      description: "Profile choices",
      category: "Roofing",
      room: "External",
      budgetAmount: 250_000,
      clientCanSeePrice: false,
      clientCanChange: false,
      deadline: "2026-12-01",
      selectionType: "design",
    },
    data: [FULL_OPTION, { name: "Half round", unitCost: 9900 }],
    maxOrder: 7,
  },
  {
    key: "flat-option-order-preserved",
    format: "flat",
    template: { name: "Unordered" },
    // The flat branch defaults to the index, so ordering survives here — the
    // opposite of legacy-option-order-collapse. The divergence is the point.
    data: [{ name: "A" }, { name: "B" }, { name: "C" }],
  },
  {
    key: "flat-bare-template",
    format: "flat",
    template: { name: "Bare" },
    data: [{ name: "Only" }],
  },
  {
    key: "flat-falsy-traps",
    format: "flat",
    template: { name: "Zeroes", budgetAmount: 0, description: "", category: "", room: "", deadline: "" },
    data: [{ name: "Included", unitCost: 0, sortOrder: 0 }],
  },
  {
    key: "flat-maxOrder-zero",
    format: "flat",
    template: { name: "First on the project" },
    data: [{ name: "A" }],
    maxOrder: 0,
  },
  {
    key: "flat-unicode-and-long-names",
    format: "flat",
    template: { name: "Ceramiche Refin — Grès Cérame ✓" },
    data: [{ name: "Zellige Lily ".repeat(20).trim(), sku: "ZL/ÉTÉ-01" }],
  },
];

// ─────────────────────────────────────────────────────────────────────────────

/** Ids must be reproducible, so they come from a counter reset per run. */
function makeCtx(selectionType = "selection"): ApplyContext {
  let n = 0;
  return { projectId: "proj-fixed", selectionType, newId: () => `id-${++n}` };
}

/**
 * Stable JSON. Dates become ISO strings tagged as Dates, so a Date and a raw
 * string are NOT interchangeable in the hash — that difference between the two
 * branches is real and must stay visible.
 *
 * The replacer is a `function`, not an arrow, on purpose. JSON.stringify calls
 * `toJSON()` BEFORE handing a value to the replacer, so a Date arrives already
 * flattened to a string and `v instanceof Date` never fires. The raw value is
 * only reachable through the holder, `this[k]`. Getting this wrong made the
 * first version of this harness blind to exactly the Date-vs-string difference
 * it was written to detect — the mutation check below is what caught it.
 */
function stable(value: unknown): string {
  return JSON.stringify(value, function (this: any, k: string, v: unknown) {
    const raw = this?.[k];
    if (raw instanceof Date) return { __date: raw.toISOString() };
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(Object.keys(v).sort().map((key) => [key, (v as any)[key]]));
    }
    return v;
  }, 2);
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

type Builder = { legacy: typeof buildLegacyApplyRows; flat: typeof buildFlatApplyRows };
const REAL: Builder = { legacy: buildLegacyApplyRows, flat: buildFlatApplyRows };
const REFERENCE: Builder = { legacy: referenceLegacy, flat: referenceFlat };

function run(c: Case, b: Builder): ApplyRows {
  const ctx = makeCtx(c.selectionType ?? c.template?.selectionType ?? "selection");
  return c.format === "legacy"
    ? b.legacy(c.data, ctx)
    : b.flat(c.template ?? {}, c.data, c.maxOrder ?? 0, ctx);
}

let failures = 0;
const fail = (msg: string) => { console.error(`  ✗ ${msg}`); failures++; };

// 1. EXTRACTION CHECK
console.log("\nEXTRACTION CHECK — shared/applyTemplate.ts vs pre-extraction routes.ts");
for (const c of CASES) {
  const a = stable(run(c, REAL));
  const b = stable(run(c, REFERENCE));
  if (a === b) console.log(`  ✓ ${c.key}`);
  else fail(`${c.key} — extraction changed the rows\n${diffFirst(b, a)}`);
}

function diffFirst(expected: string, actual: string): string {
  const e = expected.split("\n"), a = actual.split("\n");
  for (let i = 0; i < Math.max(e.length, a.length); i++) {
    if (e[i] !== a[i]) return `      line ${i + 1}\n      expected: ${e[i] ?? "<end>"}\n      actual:   ${a[i] ?? "<end>"}`;
  }
  return "";
}

// 2. MUTATION CHECK — a fingerprint that cannot fail is worthless.
console.log("\nMUTATION CHECK — deliberately broken builders must be caught");
const MUTANTS: { name: string; builder: Builder }[] = [
  {
    name: "option sortOrder falls back to the index in the legacy branch",
    builder: {
      ...REAL,
      legacy: (items, ctx) => {
        const r = REAL.legacy(items, ctx);
        r.options.forEach((o, i) => { o.sortOrder = items[0]?.options?.[i]?.sortOrder ?? i; });
        return r;
      },
    },
  },
  {
    name: "a $0 allowance survives instead of becoming null",
    builder: {
      ...REAL,
      legacy: (items, ctx) => {
        const r = REAL.legacy(items, ctx);
        r.selections.forEach((s, i) => { s.allowance = items[i].budgetAmount ?? null; });
        return r;
      },
    },
  },
  {
    name: "visibleToClient defaults to false",
    builder: {
      ...REAL,
      legacy: (items, ctx) => {
        const r = REAL.legacy(items, ctx);
        // Read the default off the SOURCE option. Re-applying `?? false` to the
        // built row is a no-op, since the row's value has already been defaulted
        // — the first version of this mutant made that mistake and looked
        // uncatchable when it was simply inert.
        const src = items.flatMap((it: any) => it.options || []);
        r.options.forEach((o, i) => { o.visibleToClient = src[i]?.visibleToClient ?? false; });
        return r;
      },
    },
  },
  {
    name: "attachments lose their order",
    builder: {
      ...REAL,
      legacy: (items, ctx) => {
        const r = REAL.legacy(items, ctx);
        r.attachments.forEach((a) => { a.sortOrder = 0; });
        return r;
      },
    },
  },
  {
    name: "the flat branch appends at maxOrder instead of maxOrder + 1",
    builder: {
      ...REAL,
      flat: (t, o, maxOrder, ctx) => {
        const r = REAL.flat(t, o, maxOrder, ctx);
        r.selections[0].sortOrder = maxOrder;
        return r;
      },
    },
  },
  {
    name: "a deadline string is left unparsed in the legacy branch",
    builder: {
      ...REAL,
      legacy: (items, ctx) => {
        const r = REAL.legacy(items, ctx);
        r.selections.forEach((s, i) => { s.deadline = items[i].deadline || null; });
        return r;
      },
    },
  },
];

for (const m of MUTANTS) {
  const caught = CASES.some((c) => {
    try {
      return stable(run(c, m.builder)) !== stable(run(c, REFERENCE));
    } catch {
      return true; // a mutant that throws is also caught
    }
  });
  if (caught) console.log(`  ✓ caught: ${m.name}`);
  else fail(`NOT caught: ${m.name} — the corpus has a blind spot`);
}

// 2b. ROUND-TRIP CHECK — the gate on step 2.
//
// Step 2 swaps the builders' INPUT from templateData to rows. That is only safe
// if a `products` row plus a `selection_template_options` row can rebuild the
// option the blob held. This pushes every corpus case through the real path —
// extractTemplateOptions (what the backfill stores), then optionFromRows (what
// step 2 reads) — and asserts /apply produces byte-identical rows either way.
//
// The first draft of the extractor failed this on seven fields, two of them
// serious: visibleToClient false -> true exposes an option the builder hid from
// the client, and gstInclusive true -> false is a money bug. That failure is
// what forced the selection_template_options split.
//
// One case is allowed to differ, deliberately and by name. Anything not on this
// list is a failure — an allow-list keeps an intentional change visible in
// review instead of quietly widening the check.
const EXPECTED_DIVERGENCES: Record<string, string> = {
  "legacy-image-url-with-no-slash":
    "the blob path turns an empty-string imageUrl into an attachment with an " +
    "empty file_path and the invented name 'image.jpg'; the row path drops it. " +
    "option_attachments.file_path is NOT NULL and '' addresses no file, so the " +
    "row is junk either way — this is a fix, not a regression, and it is the " +
    "only behaviour change step 2 makes.",
};

console.log("\nROUND-TRIP CHECK — blob -> rows -> apply must equal blob -> apply");
for (const c of CASES) {
  const fromBlob = stable(run(c, REAL));

  // Store, then read back, exactly as the backfill and step 2 do.
  const { options: stored } = extractTemplateOptions(
    c.format === "legacy" ? { templateData: c.data } : { category: c.template?.category, templateData: c.data },
  );
  const rebuilt = stored.map((o) =>
    optionFromRows(
      {
        name: o.name, brand: o.brand, sku: o.sku, description: o.description,
        category: o.category, subcategory: o.subcategory,
        defaultUnitCost: o.defaultUnitCost, unitType: o.unitType, url: o.url,
        specifications: o.specifications,
      },
      {
        quantity: o.quantity, unitCostOverride: null, markupPercent: o.markupPercent,
        totalCost: o.totalCost, visibleToClient: o.visibleToClient,
        gstInclusive: o.gstInclusive, sortOrder: o.sortOrder,
        optionCategory: o.ownCategory,
      },
      o.imageUrls,
    ),
  );

  // Reassemble into the shape the builders take. The legacy format nests options
  // under ITEMS, and item fields (itemName, categoryName, budgetAmount, room,
  // deadline) are not in the rows at all — an item is a selection with no table
  // of its own. That is the known gap recorded below; the item shells are reused
  // from the blob here so this check measures the OPTION round trip only.
  const ctx = makeCtx(c.selectionType ?? c.template?.selectionType ?? "selection");
  let fromRows: string;
  if (c.format === "legacy") {
    let n = 0;
    const items = c.data.map((item: any) => ({
      ...item,
      options: (item?.options || []).map(() => rebuilt[n++]),
    }));
    fromRows = stable(REAL.legacy(items, ctx));
  } else {
    fromRows = stable(REAL.flat(c.template ?? {}, rebuilt, c.maxOrder ?? 0, ctx));
  }

  const expected = EXPECTED_DIVERGENCES[c.key];
  if (fromBlob === fromRows) {
    if (expected) fail(`${c.key} — listed as an expected divergence but now matches; remove it from EXPECTED_DIVERGENCES`);
    else console.log(`  \u2713 ${c.key}`);
  } else if (expected) {
    console.log(`  \u2713 ${c.key}  (known divergence: ${expected})`);
  } else {
    fail(`${c.key} — a row-sourced apply differs from the blob\n${diffFirst(fromBlob, fromRows)}`);
  }
}

// 3. FINGERPRINT
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "cases"), { recursive: true });
const lines: string[] = [];
for (const c of CASES) {
  const rows = run(c, REAL);
  const json = stable(rows);
  writeFileSync(join(OUT, "cases", `${c.key}.json`), json + "\n");
  lines.push(
    `${hash(json)}  ${c.key.padEnd(36)} sel=${rows.selections.length} opt=${rows.options.length} att=${rows.attachments.length}`,
  );
}
writeFileSync(join(OUT, "fingerprint.txt"), lines.join("\n") + "\n");

console.log(`\nFINGERPRINT — ${CASES.length} cases written to ${OUT}/`);
for (const l of lines) console.log(`  ${l}`);

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll checks passed. Diff ${OUT}/ before and after step 2.`);
