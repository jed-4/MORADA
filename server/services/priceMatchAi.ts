// Resolving the ambiguous tail of a bill price review.
//
// The deterministic matcher in shared/priceList.ts settles anything with a code
// hit or a real name match. What it deliberately refuses to settle is the tail:
// lines where several catalogue items score alike, or where the only evidence is
// shared words. "Plumbing rough-in — wet areas" scoring against "Electrical
// rough-in" on "rough" and "in" is the shape of that problem, and no amount of
// lexical tuning fixes it — you have to understand what the words mean.
//
// That is what this is for, and it is all it is for. It never applies a price;
// it upgrades a row from "needs a decision" to "here is the likely answer, with
// a reason", which a human still accepts.

const ANTHROPIC_TIMEOUT_MS = 60_000;
const ANTHROPIC_MAX_RETRIES = 2;

/** Keep one call bounded — the tail should be small, and a huge prompt is a smell. */
const MAX_LINES_PER_CALL = 40;

export type AmbiguousLine = {
  lineId: string;
  description: string;
  supplierName: string | null;
  candidates: Array<{ id: string; name: string; code: string | null }>;
};

export type Resolution = {
  lineId: string;
  /** Always one of the supplied candidate ids, or null for "none of these". */
  chosenItemId: string | null;
  confidence: "high" | "medium" | "low";
  reason: string;
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

const PROMPT_HEADER = `You match line items from Australian building-supply invoices to entries in a builder's price list.

For each line you are given the invoice text and a short list of candidate price list items. Decide which candidate — if any — is the same product or service.

Rules:
- Choose ONLY from the candidate ids given for that line. Never invent an id.
- If none of the candidates is genuinely the same thing, return null. A wrong match writes a wrong price into the builder's catalogue, so "null" is the correct and safe answer whenever you are unsure.
- Different trades are never the same item. Plumbing work is not electrical work.
- Different specifications are different items: 10mm and 13mm plasterboard are not interchangeable, nor are different sheet sizes or lengths.
- Shared generic words ("rough-in", "supply", "install", "materials") are not evidence on their own.
- A brand or product code appearing in the invoice text is strong evidence.
- confidence: "high" only when the match is unmistakable; "medium" when likely; "low" when it is a guess (prefer null over a low-confidence match).
- reason: one short sentence a builder would find useful. No preamble.

Return ONLY valid JSON, no markdown fences, in exactly this shape:
{"resolutions":[{"lineId":"...","chosenItemId":"..." or null,"confidence":"high"|"medium"|"low","reason":"..."}]}
`;

/**
 * Ask the model to settle lines the deterministic matcher would not.
 *
 * Anything the model returns is validated back against the candidates that were
 * actually offered for that specific line: an id it invented, or borrowed from a
 * different line, is discarded rather than trusted. The model is choosing from a
 * menu, not naming a row in the database.
 *
 * Returns [] when no API key is configured — the review still works, the tail
 * just stays unresolved, rather than the whole feature failing.
 */
export async function resolveAmbiguousLines(lines: AmbiguousLine[]): Promise<Resolution[]> {
  const workable = lines.filter((l) => l.candidates.length > 0).slice(0, MAX_LINES_PER_CALL);
  if (!workable.length) return [];

  const anthropic = await getAnthropic();
  if (!anthropic) return [];

  const payload = workable.map((l) => ({
    lineId: l.lineId,
    invoiceText: l.description,
    supplier: l.supplierName ?? "unknown",
    candidates: l.candidates.map((c) => ({ id: c.id, name: c.name, code: c.code ?? undefined })),
  }));

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    messages: [{ role: "user", content: `${PROMPT_HEADER}\nLines:\n${JSON.stringify(payload, null, 1)}` }],
  });

  const content = (response.content[0] as any)?.text ?? "";
  const parsed = parseAiJson(content);
  const raw: any[] = Array.isArray(parsed?.resolutions) ? parsed.resolutions : [];

  const allowedByLine = new Map(workable.map((l) => [l.lineId, new Set(l.candidates.map((c) => c.id))]));

  return raw.flatMap((r): Resolution[] => {
    const lineId = typeof r?.lineId === "string" ? r.lineId : null;
    if (!lineId) return [];
    const allowed = allowedByLine.get(lineId);
    if (!allowed) return [];   // a lineId we never asked about

    const chosen = typeof r?.chosenItemId === "string" && allowed.has(r.chosenItemId)
      ? r.chosenItemId
      : null;

    const confidence: Resolution["confidence"] =
      r?.confidence === "high" || r?.confidence === "medium" ? r.confidence : "low";

    return [{
      lineId,
      chosenItemId: chosen,
      // A match the model named but could not justify from the menu is downgraded,
      // not silently kept at its claimed confidence.
      confidence: chosen ? confidence : "low",
      reason: typeof r?.reason === "string" ? r.reason.slice(0, 300) : "",
    }];
  });
}
