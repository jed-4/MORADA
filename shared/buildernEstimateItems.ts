/**
 * Read a Buildern "Estimate Items" export into Morada's own sheet rows
 * (phase 5), so Import Items takes it directly — sections, lines, and
 * ASSEMBLY rows as real assembly lines with their components under them.
 *
 * That export has no parent column. The tree is in the ORDER of the rows and
 * in the money: a GROUP or ASSEMBLY row's "Builder Cost Ex. Tax" is the sum of
 * the rows under it. So the rows are walked with a stack of open containers,
 * each holding how much of its cost is still to be accounted for; a row goes
 * into the innermost container that still has room for it.
 *
 *   Framing             GROUP     13 201.30
 *     LABOUR - Framing  LABOUR     8 800.00
 *     Frame 90x35…      ASSEMBLY   1 472.80
 *       Bottom Plate    MATERIAL     210.40   ┐
 *       …                                     ┘ 1 472.80 — the assembly is full
 *     Paslode nails     MATERIAL     181.82   ← back in Framing
 *
 * When the money can't place a row (a $0 row, rounding) it stays where it
 * is: in the innermost open container, except that a full assembly takes
 * nothing more. An assembly row carries no money of its own once imported —
 * its components do (shared/assemblies.ts) — so no total changes.
 */
import { formatGroupPath } from "./import";

/** True for a Buildern "Estimate Items" export (the format with no parent column). */
export function isBuildernEstimateItems(headers: string[]): boolean {
  const h = headers.map((x) => String(x ?? "").toLowerCase().trim());
  return h.includes("name") && h.includes("cost type") && h.includes("builder cost ex. tax") && !h.includes("parent name");
}

const TOL = 0.015;
const money = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const TYPE: Record<string, string> = {
  MATERIAL: "Material",
  LABOUR: "Labour",
  SUBCONTRACTOR: "Subcontractor",
  FEE: "Fee",
  EQUIPMENT: "Equipment",
  ALLOWANCE: "Material",
};

const SHOWN_AS: Record<string, string> = { price: "price", empty: "empty", excluded: "excluded", included: "included" };

export interface BuildernConversion {
  rows: Array<Record<string, string | number>>;
  sections: number;
  assemblies: number;
  /** Assemblies whose components didn't add up to the assembly's cost. */
  unbalancedAssemblies: string[];
}

type Open = { kind: "group" | "assembly"; name: string; remaining: number; rows: number };

/** Convert the export's rows (header → value objects) to Morada sheet rows. */
export function convertBuildernEstimateItems(rows: Array<Record<string, unknown>>): BuildernConversion {
  const out: Array<Record<string, string | number>> = [];
  const stack: Open[] = [];
  let sections = 0;
  let assemblies = 0;
  const unbalanced: string[] = [];

  const groupPath = () => formatGroupPath(stack.filter((s) => s.kind === "group").map((s) => s.name));
  const closeAssembly = () => {
    const top = stack[stack.length - 1];
    if (top?.kind === "assembly") {
      if (Math.abs(top.remaining) > TOL) unbalanced.push(top.name);
      stack.pop();
    }
  };
  const consume = (cost: number) => { for (const s of stack) s.remaining -= cost; };

  for (const r of rows) {
    const name = String(r["Name"] ?? "").trim();
    if (!name) continue;
    const kind = String(r["Cost Type"] ?? "").trim().toUpperCase();
    const qty = money(r["Quantity"]);
    const unitCost = money(r["Unit Cost Ex. Tax"]);
    const cost = r["Builder Cost Ex. Tax"] !== undefined && r["Builder Cost Ex. Tax"] !== ""
      ? money(r["Builder Cost Ex. Tax"])
      : Math.round(qty * unitCost * 100) / 100;

    if (kind === "GROUP" || kind === "ASSEMBLY") {
      closeAssembly();
      // A container nests inside the innermost group that still has room for
      // it. A $0 container closes groups that are already fully accounted for
      // (it is their sibling, not their child).
      const need = Math.max(cost, TOL * 2);
      // …except that a section's FIRST row is always its own: a $0 section
      // can hold +$2 470 and −$2 470, and its first row says so.
      // A SECTION after an empty one is its sibling (money can't say otherwise
      // for a $0 pair, and a priced one can't fit); an assembly is not.
      while (stack.length > 0 && (kind === "GROUP" || stack[stack.length - 1].rows > 0)
        && stack[stack.length - 1].remaining + TOL < need) stack.pop();
      if (stack.length > 0) stack[stack.length - 1].rows++;
      if (kind === "GROUP") {
        stack.push({ kind: "group", name, remaining: cost, rows: 0 });
        sections++;
        continue;
      }
      assemblies++;
      out.push(line(r, {
        Group: groupPath(),
        Item: name,
        // The assembly line has no money of its own — its components carry it.
        "Unit Cost": 0,
        Assembly: name,
      }));
      stack.push({ kind: "assembly", name, remaining: cost, rows: 0 });
      continue;
    }

    // An ordinary line. A full assembly takes no more; a group that has no
    // room left for a priced row isn't its home either.
    const top = stack[stack.length - 1];
    if (top?.kind === "assembly" && top.remaining + TOL < Math.max(cost, TOL * 2)) closeAssembly();
    if (cost > TOL) {
      while (stack.length > 0 && stack[stack.length - 1].kind === "group" && stack[stack.length - 1].rows > 0
        && stack[stack.length - 1].remaining + TOL < cost) stack.pop();
    }
    if (stack.length > 0) stack[stack.length - 1].rows++;
    const inAssembly = stack[stack.length - 1]?.kind === "assembly";
    out.push(line(r, {
      Group: groupPath(),
      Item: name,
      "Sub-item": inAssembly ? "Yes" : "",
      ...(inAssembly ? { "Proposal Visible": "No" } : {}),
    }));
    consume(cost);
  }
  closeAssembly();
  return { rows: out, sections, assemblies, unbalancedAssemblies: unbalanced };
}

function line(r: Record<string, unknown>, over: Record<string, string | number>): Record<string, string | number> {
  const kind = String(r["Cost Type"] ?? "").trim().toUpperCase();
  const shown = SHOWN_AS[String(r["Show As"] ?? "").trim().toLowerCase()];
  const visible = String(r["Visible in proposal"] ?? "").trim().toLowerCase();
  return {
    Item: "",
    Type: TYPE[kind] ?? "Material",
    Description: String(r["Description"] ?? "").trim(),
    Quantity: money(r["Quantity"]),
    Unit: String(r["Unit"] ?? "").trim() || "each",
    "Unit Cost": money(r["Unit Cost Ex. Tax"]),
    "Markup %": money(r["Markup"]),
    "Cost Code": String(r["Cost Code"] ?? "").trim(),
    // Lighthouse convention (the buildern-to-morada skill): Buildern
    // allowances come in as Provisional Sums.
    Allowance: kind === "ALLOWANCE" ? "Provisional Sum" : "None",
    "Proposal Visible": visible === "invisible" ? "No" : "Yes",
    ...(shown ? { "Shown As": shown } : {}),
    ...over,
  };
}
