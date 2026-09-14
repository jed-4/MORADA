/**
 * Which template built a proposal, whether it has moved on, and what a
 * re-apply would cost.
 *
 * Run: npx tsx --tsconfig tsconfig.test.json server/__tests__/proposal-template-provenance.test.ts
 *
 * This exists because the failure it guards against is silent. Jed applied a
 * template at 07:16 and kept writing it until 07:28; the proposal kept the
 * 07:16 copy, nothing said so, and a terms page simply never arrived. The
 * detection is a date comparison and the cost estimate is a diff — both the
 * kind of thing that looks obviously right and is off by one.
 */
import assert from "node:assert";
import {
  readTemplateStamp,
  withTemplateStamp,
  withoutTemplateStamp,
  templateHasMovedOn,
  sectionsWithLocalEdits,
} from "../../client/src/components/proposals/templateProvenance";

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

const APPLIED = "2026-09-14T07:16:28.000Z";
const stamp = { id: "tpl-1", name: "LIGHTHOUSE A", at: APPLIED };

const section = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  proposalId: "p1",
  sectionType: "terms_conditions",
  name: "Terms",
  order: 0,
  isEnabled: true,
  content: { termsText: "<p>30 days</p>" },
  description: null,
  descriptionHtml: null,
  ...over,
}) as any;

const tplSection = (over: Record<string, unknown> = {}) => ({
  sectionType: "terms_conditions",
  name: "Terms",
  order: 0,
  content: { termsText: "<p>30 days</p>" },
  description: null,
  descriptionHtml: null,
  ...over,
});

check("the stamp survives a round trip through layoutSettings", () => {
  const ls = withTemplateStamp({ pageSize: "A4" }, stamp);
  assert.strictEqual((ls as any).pageSize, "A4", "existing layout settings are kept");
  assert.deepStrictEqual(readTemplateStamp({ layoutSettings: ls } as any), stamp);
});

check("a proposal with no stamp reads as null, not as a broken one", () => {
  assert.strictEqual(readTemplateStamp({ layoutSettings: {} } as any), null);
  assert.strictEqual(readTemplateStamp({ layoutSettings: null } as any), null);
  assert.strictEqual(readTemplateStamp(null), null);
  // Junk in the column must not become a confident answer.
  assert.strictEqual(readTemplateStamp({ layoutSettings: { appliedTemplate: "yes" } } as any), null);
  assert.strictEqual(readTemplateStamp({ layoutSettings: { appliedTemplate: { id: 1 } } } as any), null);
});

check("saving back as a template drops the stamp but keeps the layout", () => {
  const ls = withTemplateStamp({ pageSize: "A4", showFooter: true }, stamp);
  assert.deepStrictEqual(withoutTemplateStamp(ls), { pageSize: "A4", showFooter: true });
});

check("a template edited after the apply has moved on", () => {
  assert.strictEqual(
    templateHasMovedOn(stamp, { id: "tpl-1", updatedAt: "2026-09-14T07:28:31.000Z" }),
    true,
  );
});

check("a template untouched since the apply has not", () => {
  assert.strictEqual(templateHasMovedOn(stamp, { id: "tpl-1", updatedAt: APPLIED }), false);
  assert.strictEqual(
    templateHasMovedOn(stamp, { id: "tpl-1", updatedAt: "2026-09-14T07:00:00.000Z" }),
    false,
  );
});

check("a different template, a missing one, or an unreadable date says nothing", () => {
  // Crying wolf on every proposal would be worse than the silence it replaces.
  assert.strictEqual(templateHasMovedOn(stamp, { id: "tpl-2", updatedAt: "2027-01-01T00:00:00Z" }), false);
  assert.strictEqual(templateHasMovedOn(stamp, undefined), false);
  assert.strictEqual(templateHasMovedOn(stamp, { id: "tpl-1", updatedAt: "not a date" }), false);
  assert.strictEqual(templateHasMovedOn(null, { id: "tpl-1", updatedAt: "2027-01-01T00:00:00Z" }), false);
});

check("a section that still matches the template costs nothing to replace", () => {
  assert.deepStrictEqual(
    sectionsWithLocalEdits([section()], { sections: [tplSection()] }),
    [],
  );
});

check("an edited body is named", () => {
  assert.deepStrictEqual(
    sectionsWithLocalEdits(
      [section({ content: { termsText: "<p>14 days</p>" } })],
      { sections: [tplSection()] },
    ),
    ["Terms"],
  );
});

check("a renamed section, or one with new intro text, counts as edited", () => {
  assert.deepStrictEqual(
    sectionsWithLocalEdits([section({ name: "Our Terms" })], { sections: [tplSection()] }),
    ["Our Terms"],
  );
  assert.deepStrictEqual(
    sectionsWithLocalEdits([section({ descriptionHtml: "<p>hi</p>" })], { sections: [tplSection()] }),
    ["Terms"],
  );
});

check("a section the template does not have is always lost", () => {
  const extra = section({ id: "s2", sectionType: "custom", name: "Site notes", order: 1, content: {} });
  assert.deepStrictEqual(
    sectionsWithLocalEdits([section(), extra], { sections: [tplSection()] }),
    ["Site notes"],
  );
});

check("an inserted section does not make every later one look edited", () => {
  /* Position is the first match, but a hand-added section shifts everything
     after it. Falling back to type keeps the rest aligned — otherwise adding
     one section would claim the whole document was about to be destroyed. */
  const added = section({ id: "s0", sectionType: "custom", name: "Extra", order: 0, content: {} });
  const terms = section({ order: 1 });
  const closing = section({
    id: "s3", sectionType: "closing", name: "Closing", order: 2,
    content: { closingText: "<p>Thanks</p>" },
  });
  const result = sectionsWithLocalEdits([added, terms, closing], {
    sections: [
      tplSection(),
      { ...tplSection(), sectionType: "closing", name: "Closing", order: 1, content: { closingText: "<p>Thanks</p>" } },
    ],
  });
  assert.deepStrictEqual(result, ["Extra"]);
});

check("ordering is by `order`, not by array position", () => {
  const a = section({ id: "a", order: 1, sectionType: "closing", name: "Closing", content: { closingText: "x" } });
  const b = section({ id: "b", order: 0 });
  assert.deepStrictEqual(
    sectionsWithLocalEdits([a, b], {
      sections: [tplSection(), { ...tplSection(), sectionType: "closing", name: "Closing", content: { closingText: "x" } }],
    }),
    [],
  );
});

console.log(`\n${passed} template-provenance checks passed`);
