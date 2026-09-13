/**
 * The per-section text style, and the template's stand-in estimate.
 *
 * Both of these are only observable in rendered bytes. A component test would
 * happily assert that a `fontFamily` prop was passed while @react-pdf threw on
 * it — which is the specific failure mode that matters here: asking a PDF core
 * font for a face it does not have is not a fallback, it is a render-killing
 * throw, and the proposal's prose maps <strong>/<em> straight onto bold and
 * italic. So every family we offer is rendered WITH bold and italic in it.
 *
 * Run: npx tsx --tsconfig tsconfig.pdfrender.json server/__tests__/proposal-text-style.test.ts
 * (PDF_FONT_DIR must point at client/public/fonts — see registerPdfFonts.)
 */
import assert from "node:assert";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { ProposalDocument } from "../../client/src/components/proposals/pdf/ProposalDocument";
import {
  TEXT_FONT_OPTIONS,
  DEFAULT_SECTION_TEXT_STYLE,
} from "../../client/src/components/proposals/pdf/sectionTextStyle";
import { SAMPLE_ESTIMATE_ID } from "../../client/src/components/proposals/pdf/sampleEstimate";

let passed = 0;
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

interface Item {
  str: string;
  /** [a, b, c, d, e, f] — d is the vertical scale, i.e. the drawn size. */
  transform: number[];
}

async function renderItems(sections: any[], extraProps: any = {}): Promise<Item[]> {
  const proposal = {
    id: "p1",
    proposalNumber: "PROP-2026-0001",
    name: "Test Proposal",
    projectId: "proj1",
    subtotal: 100_000,
    gstAmount: 10_000,
    totalAmount: 110_000,
    status: "draft",
    showPricing: true,
    layoutSettings: {},
    estimateId: null,
    ...(extraProps.proposal ?? {}),
  };
  const buf = await renderToBuffer(
    createElement(ProposalDocument as any, {
      proposal,
      sections,
      companyName: "Lighthouse",
      ...extraProps,
      proposalOverrides: undefined,
    }),
  );
  const doc = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  const out: Item[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    for (const it of content.items as any[]) {
      if (typeof it.str === "string" && it.str.trim()) out.push({ str: it.str, transform: it.transform });
    }
  }
  return out;
}

const closing = (textStyle: any, html: string) => [
  {
    id: "sec-closing",
    proposalId: "p1",
    sectionType: "closing",
    name: "Closing",
    order: 0,
    isEnabled: true,
    content: { closingText: html, ...(textStyle ? { textStyle } : {}) },
    description: null,
    descriptionHtml: null,
    showPricing: true,
    showSubtotal: true,
  },
];

const MARKER = "STYLEMARKER";
const MIXED = `<p>${MARKER} <strong>bold</strong> and <em>italic</em> and <u>under</u>.</p>`;

/** The drawn size of the run containing `needle`. */
function sizeOf(items: Item[], needle: string): number {
  const hit = items.find((i) => i.str.includes(needle));
  assert.ok(hit, `no text item containing "${needle}"`);
  return Math.abs(hit!.transform[3]);
}

/** The x origin of the run containing `needle`. */
function xOf(items: Item[], needle: string): number {
  const hit = items.find((i) => i.str.includes(needle));
  assert.ok(hit, `no text item containing "${needle}"`);
  return hit!.transform[4];
}

await check("every offered font renders with bold, italic and underline in the prose", async () => {
  for (const opt of TEXT_FONT_OPTIONS) {
    const items = await renderItems(
      closing({ ...DEFAULT_SECTION_TEXT_STYLE, fontFamily: opt.value }, MIXED),
    );
    const text = items.map((i) => i.str).join(" ");
    assert.ok(
      text.includes(MARKER),
      `${opt.value} rendered a page without the prose — got: ${text.slice(0, 120)}`,
    );
    assert.ok(text.includes("bold") && text.includes("italic"), `${opt.value} dropped a styled run`);
  }
});

await check("the body size control changes the size actually drawn", async () => {
  const small = await renderItems(closing({ ...DEFAULT_SECTION_TEXT_STYLE, fontSize: 9 }, MIXED));
  const large = await renderItems(closing({ ...DEFAULT_SECTION_TEXT_STYLE, fontSize: 20 }, MIXED));
  const a = sizeOf(small, MARKER);
  const b = sizeOf(large, MARKER);
  assert.ok(b > a * 1.8, `20pt should be roughly twice 9pt, got ${a} then ${b}`);
});

await check("alignment moves the text across the page", async () => {
  const left = await renderItems(closing({ ...DEFAULT_SECTION_TEXT_STYLE, align: "left" }, MIXED));
  const right = await renderItems(closing({ ...DEFAULT_SECTION_TEXT_STYLE, align: "right" }, MIXED));
  assert.ok(
    xOf(right, MARKER) > xOf(left, MARKER) + 40,
    `right-aligned text should start further in, got ${xOf(left, MARKER)} then ${xOf(right, MARKER)}`,
  );
});

await check("no textStyle at all is left, 11pt — unchanged from before the control existed", async () => {
  const bare = await renderItems(closing(null, MIXED));
  const explicit = await renderItems(closing(DEFAULT_SECTION_TEXT_STYLE, MIXED));
  assert.strictEqual(sizeOf(bare, MARKER), sizeOf(explicit, MARKER));
  assert.strictEqual(xOf(bare, MARKER), xOf(explicit, MARKER));
});

/* ── The template's stand-in estimate ───────────────────────────────────── */

const estimateSections = [
  {
    id: "sec-estimate",
    proposalId: "p1",
    sectionType: "estimate",
    name: "Estimate",
    order: 0,
    isEnabled: true,
    content: {},
    description: null,
    descriptionHtml: null,
    showPricing: true,
    showSubtotal: true,
  },
  {
    id: "sec-allowances",
    proposalId: "p1",
    sectionType: "allowances",
    name: "Allowances",
    order: 1,
    isEnabled: true,
    content: {},
    description: null,
    descriptionHtml: null,
    showPricing: true,
    showSubtotal: true,
  },
];

await check("a real proposal with no estimate invents nothing", async () => {
  const items = await renderItems(estimateSections);
  const text = items.map((i) => i.str).join(" ");
  assert.ok(!text.includes("SAMPLE FIGURES"), "a real proposal must never print stand-in figures");
});

await check("sampleData fills the estimate and allowance pages, and says so", async () => {
  const items = await renderItems(estimateSections, { sampleData: true });
  const text = items.map((i) => i.str).join(" ").replace(/\s+/g, " ");
  assert.ok(text.includes("SAMPLE FIGURES"), "the stand-in warning must be on the page");
  // A total, not a zero: the point of the change is that the money sections
  // stop rendering blank while a template is being designed.
  assert.ok(/\$\s?[1-9][\d,]*\.\d\d/.test(text), `no non-zero money on the page — got: ${text.slice(0, 300)}`);
  assert.ok(
    text.includes("Prime Cost") || text.includes("Provisional Sum"),
    "the allowance page should list the sample PC/PS lines",
  );
});

await check("real estimate data always beats the stand-ins", async () => {
  const items = await renderItems(estimateSections, {
    sampleData: true,
    proposal: { estimateId: "real-1" },
    estimatesData: {
      "real-1": {
        estimate: { id: "real-1", projectMarkupPercent: 0, taxRate: 10 },
        groups: [],
        items: [
          {
            id: "i1",
            estimateId: "real-1",
            groupId: null,
            description: "REAL_LINE_ITEM",
            quantity: 1,
            unit: "item",
            unitCostExTax: 1000,
            taxAmount: 100,
            priceIncTax: 1100,
            order: 0,
          },
        ],
      },
    },
  });
  const text = items.map((i) => i.str).join(" ");
  assert.ok(text.includes("REAL_LINE_ITEM"), "the real estimate should be what prints");
  assert.ok(!text.includes(SAMPLE_ESTIMATE_ID), "no sample id should leak into the document");
});

console.log(`\n${passed} proposal text-style checks passed`);
