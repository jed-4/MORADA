/**
 * The three cover layouts, rendered for real and read back.
 *
 * Run:
 *   PDF_FONT_DIR="$PWD/client/public/fonts" \
 *     npx tsx --tsconfig tsconfig.test.json server/__tests__/proposal-cover-templates.test.ts
 *
 * PDF_FONT_DIR because the faces are registered by browser path; under Node
 * fontkit resolves "/fonts/..." against the filesystem root.
 *
 * A cover is one page that carries five facts. The way these break is not a
 * crash — it is a template that quietly drops the client's name, or the
 * section note, or prints the old company-wide default colour because a
 * fallback chain was short-circuited somewhere upstream. None of that is
 * visible from a unit test on the component, so this renders the real
 * ProposalDocument and reads the page.
 */
import assert from "node:assert";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { ProposalDocument } from "../../client/src/components/proposals/pdf/ProposalDocument";
import { COVER_TEMPLATES, coverTemplateOf } from "../../client/src/components/proposals/pdf/coverTemplates";
import { coverPalette } from "../../client/src/components/proposals/pdf/sections/cover/coverData";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

const proposal = {
  id: "p1",
  proposalNumber: "PROP-2026-0042",
  name: "Test Proposal",
  projectId: "proj1",
  subtotal: 100_000,
  gstAmount: 10_000,
  totalAmount: 110_000,
  status: "draft",
  showPricing: true,
  layoutSettings: {},
  createdAt: new Date("2026-03-04T00:00:00Z"),
  expiryDate: new Date("2026-04-04T00:00:00Z"),
} as any;

const coverSection = (content: Record<string, unknown> = {}, description: string | null = null) => ({
  id: "sec-cover",
  proposalId: "p1",
  sectionType: "cover_page",
  name: "Cover Page",
  order: 0,
  isEnabled: true,
  content,
  description,
  descriptionHtml: description ? `<p>${description}</p>` : null,
  showPricing: true,
  showSubtotal: true,
});

async function renderCover(content: Record<string, unknown>, extra: Record<string, unknown> = {}, description: string | null = null) {
  const buf = await renderToBuffer(
    createElement(ProposalDocument as any, {
      proposal: { ...proposal, ...(extra.proposal as object ?? {}) },
      sections: [coverSection(content, description)],
      companyName: "Lighthouse Projects",
      client: { id: "c1", name: "Mick & Linda Dundee", email: "mick@example.com" },
      project: { id: "proj1", name: "Walkabout Creek Pub" },
      ...extra,
    }),
  );
  const doc = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  assert.strictEqual(doc.numPages, 1, "a cover must be exactly one page");
  const content_ = await (await doc.getPage(1)).getTextContent();
  const text = content_.items.map((it: any) => it.str).join(" ").replace(/\s+/g, " ");
  await doc.destroy();
  return text;
}

/* ── every template says the same things ─────────────────────────────────── */

for (const template of COVER_TEMPLATES) {
  await check(`${template.label} carries the project, client, reference and date`, async () => {
    const text = await renderCover({ template: template.value });
    for (const expected of ["Walkabout Creek Pub", "Mick & Linda Dundee", "PROP-2026-0042", "2026"]) {
      assert.ok(text.includes(expected), `${template.value} lost "${expected}" — page read: ${text.slice(0, 200)}`);
    }
  });

  await check(`${template.label} prints the section note`, async () => {
    const text = await renderCover({ template: template.value }, {}, "NOTE_MARKER_TEXT");
    assert.ok(
      text.replace(/\s+/g, "").includes("NOTE_MARKER_TEXT"),
      `${template.value} silently dropped the note — page read: ${text.slice(0, 200)}`,
    );
  });

  await check(`${template.label} shows the total only when asked`, async () => {
    const without = await renderCover({ template: template.value });
    const with_ = await renderCover({ template: template.value, showPrice: true });
    assert.ok(!without.includes("1,100.00"), `${template.value} printed the price uninvited`);
    assert.ok(with_.includes("1,100.00"), `${template.value} was asked for the price and withheld it`);
  });
}

/* ── the photo cover without a photo ─────────────────────────────────────── */

await check("the photo cover still renders when no image has been uploaded", async () => {
  const text = await renderCover({ template: "photo" });
  assert.ok(text.includes("Walkabout Creek Pub"));
  // The company name stands in for the missing image, so the page reads as a
  // cover rather than as a colour block someone forgot to finish.
  assert.ok(text.includes("Lighthouse Projects"));
});

/* ── choosing a template ─────────────────────────────────────────────────── */

await check("an unset template follows the company's document style", () => {
  const bare = coverSection() as any;
  assert.strictEqual(coverTemplateOf(bare, "style1"), "masthead");
  assert.strictEqual(coverTemplateOf(bare, "style2"), "feature");
  assert.strictEqual(coverTemplateOf(bare, undefined), "masthead");
});

await check("an explicit template overrides the company's document style", () => {
  const chosen = coverSection({ template: "photo" }) as any;
  assert.strictEqual(coverTemplateOf(chosen, "style2"), "photo");
});

await check("a template name that is no longer valid falls back rather than blanking the page", () => {
  const stale = coverSection({ template: "brochure-v1" }) as any;
  assert.strictEqual(coverTemplateOf(stale, "style1"), "masthead");
});

/* ── the palette ─────────────────────────────────────────────────────────── */

await check("no accent colour means the primary is used throughout", () => {
  const palette = coverPalette("#C2410C");
  assert.strictEqual(palette.hasSecondary, false);
  assert.strictEqual(palette.secondary.base, palette.primary.base);
});

await check("an accent colour is used where one is set", () => {
  const palette = coverPalette("#C2410C", "#1D4ED8");
  assert.strictEqual(palette.hasSecondary, true);
  assert.strictEqual(palette.secondary.base, "#1D4ED8");
});

await check("a malformed accent colour is ignored, not rendered", () => {
  // These reach us from jsonb a human has edited. "blue" as a fill would make
  // @react-pdf throw and take the whole document with it.
  for (const bad of ["blue", "#FFF", "", "   ", "#12345g"]) {
    const palette = coverPalette("#C2410C", bad);
    assert.strictEqual(palette.hasSecondary, false, `"${bad}" was accepted as a colour`);
    assert.strictEqual(palette.secondary.base, "#C2410C");
  }
});

console.log(`\n${passed} cover checks passed`);
