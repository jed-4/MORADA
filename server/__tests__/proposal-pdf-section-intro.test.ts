/**
 * Renders the real ProposalDocument to a PDF in Node and reads the text back.
 *
 * Every section accordion offers a "Description" field, and until now exactly
 * one section type — the cover page — rendered it. On the other ten you could
 * type into it, be told "Section updated successfully", and never find the text
 * anywhere in the document. Asserting that from the outside needs the actual
 * rendered bytes: a unit test on the component would happily pass while the
 * text failed to reach the page.
 *
 * @react-pdf renders headlessly under Node, and pdfjs reads the result, so this
 * needs no browser — which matters, because the in-app preview cannot be driven
 * reliably from here (its pdf.js worker fails to resolve in a fresh worktree).
 */
import assert from "node:assert";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { ProposalDocument } from "../../client/src/components/proposals/pdf/ProposalDocument";

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

/** Every visible string in the rendered PDF, one entry per page. */
async function renderPages(sections: any[], proposalOverrides: any = {}): Promise<string[]> {
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
    ...proposalOverrides,
  };
  const buf = await renderToBuffer(
    createElement(ProposalDocument as any, { proposal, sections, companyName: "Lighthouse" }),
  );
  const doc = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    out.push(content.items.map((it: any) => it.str).join(" "));
  }
  return out;
}

const section = (sectionType: string, extra: any = {}) => ({
  id: `sec-${sectionType}`,
  proposalId: "p1",
  sectionType,
  name: `My ${sectionType}`,
  order: 0,
  isEnabled: true,
  content: {},
  description: null,
  descriptionHtml: null,
  showPricing: true,
  showSubtotal: true,
  ...extra,
});

// The section types that own a page of their own and take a Description.
// "estimate" is excluded: it renders nothing without estimatesData.
const TYPES = [
  "cover_letter", "scope", "summary", "allowances", "payment_schedule",
  "inclusions_exclusions", "closing", "attachments", "terms_conditions",
  "signature", "custom",
];

await check("the section Description reaches the page on every section type", async () => {
  for (const type of TYPES) {
    const marker = `INTRO_${type.toUpperCase()}`;
    const pages = await renderPages([
      section(type, { description: marker, descriptionHtml: `<p>${marker}</p>` }),
    ]);
    const text = pages.join(" ").replace(/\s+/g, "");
    assert.ok(
      text.includes(marker),
      `"${type}" rendered a page without its Description — text was: ${pages.join(" ").slice(0, 160)}`,
    );
  }
});

await check("plain-text Description renders when there is no HTML mirror", async () => {
  // Older rows were written before the editor stored descriptionHtml.
  const pages = await renderPages([
    section("summary", { description: "PLAIN_ONLY_MARKER", descriptionHtml: null }),
  ]);
  assert.ok(pages.join(" ").replace(/\s+/g, "").includes("PLAIN_ONLY_MARKER"));
});

await check("an empty Description adds nothing", async () => {
  const withEmpty = await renderPages([section("summary", { description: "", descriptionHtml: "<p></p>" })]);
  const withNull = await renderPages([section("summary")]);
  // Neither should introduce stray text; both render the same section title.
  assert.ok(withEmpty.join(" ").includes("My summary"));
  assert.ok(withNull.join(" ").includes("My summary"));
});

await check("the cover page still renders its Description, as it always did", async () => {
  const pages = await renderPages([
    section("cover_page", { description: "COVER_MARKER", descriptionHtml: "<p>COVER_MARKER</p>" }),
  ]);
  assert.ok(pages.join(" ").replace(/\s+/g, "").includes("COVER_MARKER"));
});

console.log(`\n${passed} proposal-pdf checks passed`);
