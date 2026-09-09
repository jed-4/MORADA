// Reading product codes out of a bill's own document.
//
// Bills deliberately carry no SKU column — Jed's call, 2026-08-22: it would be
// noise on a bill. But matching an invoice line to a catalogue item is far more
// certain with the supplier's code than with its prose, so the codes are read
// from the PDF at review time and cached in bill_line_item_skus, which nothing
// in the bills UI ever shows.
//
// The mapping problem is handed to the model rather than solved with string
// distance: we already know our own line descriptions, so we ask "for each of
// these lines, what code does the document give it" and get line ids back. That
// avoids extracting a pile of loose codes and then guessing which line each
// belongs to, which is where this kind of thing usually goes wrong.

import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import * as schema from "@shared/schema";

const ANTHROPIC_TIMEOUT_MS = 90_000;
const ANTHROPIC_MAX_RETRIES = 2;

/** Codes shorter than this match too much to be worth storing. */
const MIN_CODE_LENGTH = 4;

export type SkuExtractionResult = {
  /** billLineItemId -> supplier's product code. */
  skus: Map<string, string>;
  /** Why nothing came back, when nothing did. */
  note: "ok" | "no-attachment" | "unreadable" | "not-configured";
  /** True when the answer came entirely from cache and cost nothing. */
  cached: boolean;
};

async function getAnthropic() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  return new Anthropic({ apiKey, timeout: ANTHROPIC_TIMEOUT_MS, maxRetries: ANTHROPIC_MAX_RETRIES });
}

function parseAiJson(content: string): any {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("The model did not return a JSON object.");
  try {
    return JSON.parse(match[0]);
  } catch {
    throw new Error("The model returned malformed or truncated JSON.");
  }
}

async function pdfToText(buffer: Buffer): Promise<string> {
  try {
    // pdf-parse ships CJS with ESM types that declare no default, so aiBillReader's
    // `.default` works at runtime but does not typecheck. Accept either shape.
    const mod: any = await import("pdf-parse");
    const pdfParse = mod.default ?? mod;
    const data = await pdfParse(buffer, { max: 5 });
    return data?.text ?? "";
  } catch {
    return "";
  }
}

const PROMPT = `You are reading an Australian building-supply invoice to recover the supplier's product codes.

You are given the invoice text and the line items we already hold for this bill. For each line, find the supplier's product code / SKU / item number as printed on the invoice.

Rules:
- Return a code ONLY when you can see it on the invoice for that line. Never invent, guess, or reconstruct one.
- If a line has no code printed against it, return null. Most invoices have some lines with codes and some without, and null is the correct answer for the rest.
- The code is the supplier's own reference (e.g. "PB-13-2412", "10188847", "CSR-FYR-13"). It is not the quantity, the unit, the price, the account code, or the line number.
- Match by meaning, not position: the invoice may list lines in a different order to the ones given.

Return ONLY valid JSON, no markdown fences:
{"lines":[{"lineId":"...","code":"..." or null}]}`;

/**
 * Product codes for a bill's lines, from cache where possible.
 *
 * Cached rows are trusted and never re-read, so a bill costs tokens once no
 * matter how many times it is reviewed. Lines the document has no code for are
 * not cached as misses — a later, better read can still find them.
 */
export async function extractSkusForBill(
  billId: string,
  companyId: string,
): Promise<SkuExtractionResult> {
  const lines = await db
    .select({ id: schema.billLineItems.id, description: schema.billLineItems.description })
    .from(schema.billLineItems)
    .innerJoin(schema.bills, eq(schema.bills.id, schema.billLineItems.billId))
    .where(and(eq(schema.billLineItems.billId, billId), eq(schema.bills.companyId, companyId)));

  if (!lines.length) return { skus: new Map(), note: "ok", cached: true };

  const lineIds = lines.map((l) => l.id);
  const cached = await db
    .select()
    .from(schema.billLineItemSkus)
    .where(and(
      inArray(schema.billLineItemSkus.billLineItemId, lineIds),
      eq(schema.billLineItemSkus.companyId, companyId),
    ));

  const skus = new Map(cached.map((c) => [c.billLineItemId, c.sku]));
  // Any cache at all means this bill has been read before. Re-reading to chase
  // the lines that had no code would spend tokens on every review forever.
  if (cached.length > 0) return { skus, note: "ok", cached: true };

  const [bill] = await db
    .select({ attachmentUrls: schema.bills.attachmentUrls })
    .from(schema.bills)
    .where(and(eq(schema.bills.id, billId), eq(schema.bills.companyId, companyId)));

  const attachments = (bill?.attachmentUrls as any[]) ?? [];
  const first = attachments.find((a) => a?.objectPath);
  if (!first) return { skus, note: "no-attachment", cached: false };

  const anthropic = await getAnthropic();
  if (!anthropic) return { skus, note: "not-configured", cached: false };

  let text = "";
  try {
    const { objectStorage } = await import("../objectStorage");
    const buffer = await objectStorage.getObjectBuffer(first.objectPath);
    text = String(first.mimeType).includes("pdf") || /\.pdf$/i.test(first.filename ?? "")
      ? await pdfToText(buffer)
      : "";
  } catch (error) {
    console.error("[Bill SKU reader] could not read attachment:", error);
    return { skus, note: "unreadable", cached: false };
  }

  // A scanned invoice yields no text. Vision would work but costs far more per
  // bill, so leave it unread rather than quietly spending on every scan.
  if (text.trim().length < 50) return { skus, note: "unreadable", cached: false };

  const found = await extractSkusFromText(text, lines);
  const rows = Array.from(found.entries()).map(([billLineItemId, sku]) => ({
    companyId, billLineItemId, sku, source: "pdf" as const,
  }));

  if (rows.length) {
    await db.insert(schema.billLineItemSkus).values(rows).onConflictDoNothing();
    for (const r of rows) skus.set(r.billLineItemId, r.sku);
  }

  return { skus, note: "ok", cached: false };
}


/**
 * The model half, with no database or object storage in sight.
 *
 * Split out so the part most likely to be wrong -- does it find the right code
 * for the right line -- can be exercised without a bucket. The IO around it is
 * ordinary; this is not.
 *
 * Returns lineId -> code, containing only ids that were actually offered.
 */
export async function extractSkusFromText(
  invoiceText: string,
  lines: Array<{ id: string; description: string }>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!lines.length || invoiceText.trim().length < 50) return out;

  const anthropic = await getAnthropic();
  if (!anthropic) return out;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 3000,
    messages: [{
      role: "user",
      content: `${PROMPT}\n\nOur line items:\n${JSON.stringify(
        lines.map((l) => ({ lineId: l.id, description: l.description })), null, 1,
      )}\n\nInvoice text:\n${invoiceText.slice(0, 40_000)}`,
    }],
  });

  const parsed = parseAiJson((response.content[0] as any)?.text ?? "");
  const raw: any[] = Array.isArray(parsed?.lines) ? parsed.lines : [];
  const known = new Set(lines.map((l) => l.id));

  for (const r of raw) {
    const lineId = typeof r?.lineId === "string" && known.has(r.lineId) ? r.lineId : null;
    const code = typeof r?.code === "string" ? r.code.trim() : "";
    if (!lineId || code.length < MIN_CODE_LENGTH) continue;
    out.set(lineId, code.slice(0, 120));
  }
  return out;
}
