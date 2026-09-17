/**
 * Group descriptions print on the proposal WITH their formatting.
 *
 * `estimate_groups.description` is written in a rich-text editor and is the text
 * the proposal prints under each group. It used to go through pdfPlainText, which
 * strips every tag: a builder's bold, italics and bullet lists reached the client
 * as flat lines. It now renders through RichTextBlocks, the same renderer the
 * proposal's own section text uses.
 *
 * A group reaches the table two ways, and both are covered:
 *   - a top-level group is its own table, so its description is the table's
 *     `headerNote`;
 *   - a sub-group sits inside its parent's table, as `PdfTableGroup.description`.
 *
 * Asserted from the rendered PDF bytes, not the component tree — a formatting
 * regression, or the @react-pdf crash a missing italic face causes, only shows
 * up in the real render.
 *
 * Run with:
 *   PDF_FONT_DIR="$PWD/client/public/fonts" \
 *     npx tsx --tsconfig tsconfig.pdfrender.json server/__tests__/proposal-group-description.test.ts
 */
import assert from "node:assert";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { ProposalDocument } from "../../client/src/components/proposals/pdf/ProposalDocument";
import { SAMPLE_ESTIMATE, SAMPLE_ITEMS } from "../../client/src/components/proposals/pdf/sampleEstimate";
import { htmlToBlocks } from "../../client/src/components/proposals/pdf/sections/RichTextBlocks";

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

interface Run {
  str: string;
  fontName: string;
}

const ESTIMATE_ID = (SAMPLE_ESTIMATE as any).id as string;

const TOP_HTML =
  "<p>TOPMARK <strong>TOPBOLD</strong> and <em>TOPITALIC</em>.</p>" +
  "<ul><li>TOPBULLETONE</li><li>TOPBULLETTWO</li></ul>";
const SUB_HTML = "<p>SUBMARK <strong>SUBBOLD</strong></p><ul><li>SUBBULLET</li></ul>";

const groups = [
  { id: "sample-g1", estimateId: ESTIMATE_ID, name: "Preliminaries & Site", parentGroupId: null, order: 0, description: null, proposalVisible: true },
  { id: "sample-g2", estimateId: ESTIMATE_ID, name: "Bathroom", parentGroupId: null, order: 1, description: TOP_HTML, proposalVisible: true },
  { id: "sample-g2a", estimateId: ESTIMATE_ID, name: "Bathroom Fit-off", parentGroupId: "sample-g2", order: 2, description: SUB_HTML, proposalVisible: true },
];

async function renderRuns(): Promise<Run[]> {
  const buf = await renderToBuffer(
    createElement(ProposalDocument as any, {
      proposal: {
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
        estimateId: ESTIMATE_ID,
      },
      sections: [
        {
          id: "sec-estimate",
          proposalId: "p1",
          sectionType: "estimate",
          name: "Estimate",
          order: 0,
          isEnabled: true,
          content: { estimateId: ESTIMATE_ID },
          description: null,
          descriptionHtml: null,
          showPricing: true,
          showSubtotal: true,
        },
      ],
      companyName: "Lighthouse",
      estimatesData: { [ESTIMATE_ID]: { estimate: SAMPLE_ESTIMATE, groups, items: SAMPLE_ITEMS } },
    }),
  );
  const doc = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  const runs: Run[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    for (const it of content.items as any[]) {
      if (typeof it.str === "string" && it.str.trim()) runs.push({ str: it.str, fontName: it.fontName });
    }
  }
  return runs;
}

console.log("\nproposal-group-description");

const runs = await renderRuns();
const text = runs.map((r) => r.str).join(" ");
const fontOf = (needle: string) => runs.find((r) => r.str.includes(needle))?.fontName;


for (const [label, mark, bold, bullet] of [
  ["top-level group (headerNote)", "TOPMARK", "TOPBOLD", "TOPBULLETONE"],
  ["sub-group (in-table description)", "SUBMARK", "SUBBOLD", "SUBBULLET"],
] as const) {
  await check(`${label}: the description prints`, async () => {
    assert.ok(text.includes(mark), `${mark} missing — got: ${text.slice(0, 400)}`);
  });

  await check(`${label}: no raw markup reaches the page`, async () => {
    for (const tag of ["<p>", "<strong>", "<ul>", "<li>", "</"]) {
      assert.ok(!text.includes(tag), `raw "${tag}" printed`);
    }
  });

  await check(`${label}: bold keeps a bold face`, async () => {
    const plain = fontOf(mark);
    const strong = fontOf(bold);
    assert.ok(plain && strong, `could not find runs for ${mark}/${bold}`);
    assert.notStrictEqual(strong, plain, `${bold} was drawn in the regular face (${plain}) — formatting was flattened`);
  });

}

await check("every list item keeps its bullet — including the first of each list", async () => {
  // Three <li> across the two descriptions, and nothing else in the fixture is a
  // list. Counted rather than located: pdfjs does not return text runs in visual
  // order. Before the htmlToBlocks fix this was 1 — the first item of each list
  // printed as a plain paragraph.
  const bullets = [...text].filter((c) => c === "\u2022").length;
  assert.strictEqual(bullets, 3, `expected 3 bullets, got ${bullets}`);
});

await check("italic keeps an italic face", async () => {
  const plain = fontOf("TOPMARK");
  const italic = fontOf("TOPITALIC");
  assert.ok(plain && italic);
  assert.notStrictEqual(italic, plain, "TOPITALIC was drawn in the regular face");
  assert.notStrictEqual(italic, fontOf("TOPBOLD"), "TOPITALIC was drawn in the bold face");
});

await check("italics render without crashing the document", async () => {
  // Reaching here at all means renderToBuffer did not throw on <em>.
  assert.ok(text.includes("TOPITALIC"));
});

/* ── htmlToBlocks, directly ─────────────────────────────────────────────── */

const types = (html: string) => htmlToBlocks(html).map((b) => `${b.type}:${b.text}`);

await check("htmlToBlocks: the first item of a bullet list is a bullet", async () => {
  assert.deepStrictEqual(types("<ul><li>one</li><li>two</li></ul>"), ["li:one", "li:two"]);
});

await check("htmlToBlocks: the first item of a numbered list is numbered", async () => {
  assert.deepStrictEqual(types("<ol><li>one</li><li>two</li></ol>"), ["ol-li:one", "ol-li:two"]);
});

await check("htmlToBlocks: a paragraph before a list stays a paragraph", async () => {
  assert.deepStrictEqual(types("<p>intro</p><ul><li>one</li></ul><p>after</p>"), ["p:intro", "li:one", "p:after"]);
});

await check("htmlToBlocks: a bullet list after a numbered one is bulleted", async () => {
  assert.deepStrictEqual(
    types("<ol><li>a</li></ol><ul><li>b</li></ul>"),
    ["ol-li:a", "li:b"],
  );
});

console.log(`\nproposal-group-description: ${passed} checks passed\n`);
