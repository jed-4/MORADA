/**
 * The template <-> builder round trip.
 *
 * Run:
 *   npx tsx --tsconfig tsconfig.test.json server/__tests__/proposal-template-source.test.ts
 *
 * A template stores sections WITHOUT ids, because they are a shape to be
 * inserted rather than rows; the builder needs ids to key React and to address
 * an edit. That conversion runs on every load and every save, so a mistake in
 * it does not throw — it silently drops a builder's section content, or
 * reorders their document. Worth pinning.
 */
import assert from "node:assert";
import {
  documentToTemplatePayload,
  rowsToTemplateSections,
  templateProposal,
  templateSectionsToRows,
  PROPOSAL_CAPABILITIES,
  TEMPLATE_CAPABILITIES,
} from "../../client/src/components/proposals/proposalDocumentSource";
import type { ProposalTemplate } from "@shared/schema";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const template = {
  id: "tpl-1",
  companyId: "co-1",
  name: "Standard Residential",
  description: null,
  isActive: true,
  createdById: "u-1",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-02"),
  layoutSettings: { pageHeader: "minimal", secondaryColor: "#0F766E" },
  sections: [
    { sectionType: "cover_page", name: "Cover Page", order: 0, content: { showPrice: true }, isEnabled: true },
    { sectionType: "scope", name: "Scope of Work", order: 1, content: { scopeText: "<p>Demolition</p>" }, description: "intro", descriptionHtml: "<p>intro</p>", isEnabled: false },
  ],
} as unknown as ProposalTemplate;

check("every stored section becomes an addressable row", () => {
  const rows = templateSectionsToRows(template);
  assert.strictEqual(rows.length, 2);
  assert.ok(rows.every((r) => typeof r.id === "string" && r.id.length > 0), "rows need ids");
  assert.strictEqual(new Set(rows.map((r) => r.id)).size, 2, "ids must be unique");
});

check("a round trip changes nothing a builder can see", () => {
  const back = rowsToTemplateSections(templateSectionsToRows(template));
  assert.deepStrictEqual(
    back.map((s) => [s.sectionType, s.name, s.order, s.isEnabled]),
    [["cover_page", "Cover Page", 0, true], ["scope", "Scope of Work", 1, false]],
  );
});

check("section content survives the round trip", () => {
  const back = rowsToTemplateSections(templateSectionsToRows(template));
  assert.deepStrictEqual(back[0].content, { showPrice: true });
  assert.deepStrictEqual(back[1].content, { scopeText: "<p>Demolition</p>" });
  assert.strictEqual(back[1].descriptionHtml, "<p>intro</p>");
});

check("saving renumbers order from the array, so a drag cannot leave a gap", () => {
  const rows = templateSectionsToRows(template);
  // Simulate a reorder that leaves non-contiguous orders, as dnd-kit does.
  const reordered = [{ ...rows[1], order: 0 }, { ...rows[0], order: 7 }];
  const back = rowsToTemplateSections(reordered);
  assert.deepStrictEqual(back.map((s) => [s.name, s.order]), [["Scope of Work", 0], ["Cover Page", 1]]);
});

check("a section missing every optional field still round trips", () => {
  const bare = { ...template, sections: [{ sectionType: "custom", name: "", order: 0 }] } as unknown as ProposalTemplate;
  const back = rowsToTemplateSections(templateSectionsToRows(bare));
  assert.strictEqual(back.length, 1);
  assert.strictEqual(back[0].isEnabled, true, "absent isEnabled means on");
  assert.deepStrictEqual(back[0].content, {});
});

check("a template with no sections is not an error", () => {
  const empty = { ...template, sections: [] } as unknown as ProposalTemplate;
  assert.deepStrictEqual(templateSectionsToRows(empty), []);
  assert.deepStrictEqual(rowsToTemplateSections([]), []);
});

check("the stand-in proposal carries the layout the document renders from", () => {
  const p = templateProposal(template);
  assert.deepStrictEqual(p.layoutSettings, template.layoutSettings);
  assert.strictEqual(p.name, template.name);
});

check("the stand-in proposal claims no money it cannot justify", () => {
  // No estimate is linked, so a figure here would be invented. The cover and
  // the summary both read these, and printing a made-up total is worse than
  // printing none.
  const p = templateProposal(template);
  assert.strictEqual(p.subtotal, 0);
  assert.strictEqual(p.gstAmount, 0);
  assert.strictEqual(p.totalAmount, 0);
  assert.strictEqual(p.estimateId, null);
});

check("a template cannot do the things that need a client", () => {
  for (const key of ["send", "revisions", "linkEstimate", "milestones", "share", "details"] as const) {
    assert.strictEqual(TEMPLATE_CAPABILITIES[key], false, `${key} must be off for a template`);
    assert.strictEqual(PROPOSAL_CAPABILITIES[key], true, `${key} must be on for a proposal`);
  }
});

/* ── Saving a proposal AS a template ──────────────────────────────────── */

const liveSections = [
  {
    id: "sec-1", order: 1, sectionType: "estimate", name: "Estimate",
    // A real proposal's estimate section points at a specific estimate.
    content: { estimateId: "est-abc", visibleColumns: ["description", "amountIncTax"] },
    description: null, descriptionHtml: null, isEnabled: true, showPricing: true, showSubtotal: false,
  },
  {
    id: "sec-0", order: 0, sectionType: "cover_letter", name: "Cover Letter",
    content: { letterText: "<p>Dear {{client.name}}, thanks for having us at {{project.address}}.</p>" },
    description: "intro", descriptionHtml: "<p>intro</p>", isEnabled: true, showPricing: true, showSubtotal: true,
  },
] as any[];

check("the linked estimate is NOT carried into a template", () => {
  const payload = documentToTemplatePayload(liveSections, {});
  const estimate = payload.sections.find((s) => s.sectionType === "estimate")!;
  assert.ok(!("estimateId" in (estimate.content as object)), "estimateId must be dropped");
});

check("everything else in that section survives", () => {
  const payload = documentToTemplatePayload(liveSections, {});
  const estimate = payload.sections.find((s) => s.sectionType === "estimate")!;
  assert.deepStrictEqual(estimate.content, { visibleColumns: ["description", "amountIncTax"] });
  assert.strictEqual(estimate.showSubtotal, false, "per-section display settings are part of the structure");
});

check("placeholders are stored as written, not resolved", () => {
  // The whole point of a template: one document, filled per project.
  const payload = documentToTemplatePayload(liveSections, {});
  const letter = payload.sections.find((s) => s.sectionType === "cover_letter")!;
  const text = String((letter.content as Record<string, unknown>).letterText);
  assert.ok(text.includes("{{client.name}}"), "client placeholder must survive");
  assert.ok(text.includes("{{project.address}}"), "project placeholder must survive");
});

check("saving normalises order, so the template opens in document order", () => {
  const payload = documentToTemplatePayload(liveSections, {});
  assert.deepStrictEqual(
    payload.sections.map((s) => [s.name, s.order]),
    [["Cover Letter", 0], ["Estimate", 1]],
  );
});

check("the layout travels with the document", () => {
  const payload = documentToTemplatePayload(liveSections, { primaryColor: "#C2410C", pageHeader: "minimal" });
  assert.deepStrictEqual(payload.layoutSettings, { primaryColor: "#C2410C", pageHeader: "minimal" });
});

check("a proposal with no layout settings yet still saves", () => {
  assert.deepStrictEqual(documentToTemplatePayload(liveSections, null).layoutSettings, {});
});

check("what is saved is what loads back", () => {
  // Save-then-open is the round trip a builder actually performs.
  const payload = documentToTemplatePayload(liveSections, {});
  const reopened = rowsToTemplateSections(
    templateSectionsToRows({ ...template, sections: payload.sections } as unknown as ProposalTemplate),
  );
  assert.deepStrictEqual(reopened, payload.sections);
});

console.log(`\n${passed} template-source checks passed`);
