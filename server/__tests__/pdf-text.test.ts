/**
 * Markup must never reach the page.
 *
 * Run:
 *   npx tsx --tsconfig tsconfig.test.json server/__tests__/pdf-text.test.ts
 *
 * estimate_items.description is written by a rich-text editor and stored as
 * HTML. The estimate table printed it raw, so a line whose description had
 * been opened and left empty showed the literal string "<p></p>" to the client
 * underneath the item name. These are the shapes an editor actually leaves
 * behind.
 */
import assert from "node:assert";
import { pdfPlainText, pdfHasText } from "../../client/src/components/pdf/shared/pdfText";

let passed = 0;
function check(name: string, fn: () => void) { fn(); passed++; console.log(`  ✓ ${name}`); }

check("the reported case: an emptied editor prints nothing", () => {
  assert.strictEqual(pdfPlainText("<p></p>"), "");
  assert.strictEqual(pdfHasText("<p></p>"), false);
});

check("the other shapes an emptied editor leaves", () => {
  for (const empty of ["<p><br></p>", "<p>&nbsp;</p>", "<div></div>", "   ", "", null, undefined]) {
    assert.strictEqual(pdfHasText(empty), false, `${JSON.stringify(empty)} should be empty`);
  }
});

check("real content survives, without its tags", () => {
  assert.strictEqual(pdfPlainText("<p>Supply and install</p>"), "Supply and install");
  assert.strictEqual(pdfHasText("<p>Supply and install</p>"), true);
});

check("paragraphs keep their line breaks, and are never concatenated", () => {
  // "OneTwo" would be a new defect introduced by the fix for the old one.
  assert.strictEqual(pdfPlainText("<p>One</p><p>Two</p>"), "One\nTwo");
  assert.strictEqual(pdfPlainText("First<br>Second"), "First\nSecond");
});

check("an ampersand does not flatten a plain-text description", () => {
  /* The reported case. Jed's "Windows & External Doors" group note is plain
     text with one task per line. The "&" sent it down the markup branch, which
     collapsed every newline, and the client got a run-on paragraph — while a
     neighbouring note without an ampersand kept its lines. */
  const note = "Replacement of most windows\nRemove existing windows\nAngle fix internally & externally";
  assert.strictEqual(pdfPlainText(note), note);
  assert.strictEqual(pdfPlainText("A\nB"), pdfPlainText("A &amp; B".replace("&amp; ", "\n")));
});

check("spacing inside a line collapses; blank lines collapse to one", () => {
  assert.strictEqual(pdfPlainText("Supply   and\tinstall"), "Supply and install");
  assert.strictEqual(pdfPlainText("<p>A</p><p></p><p></p><p>B</p>"), "A\n\nB");
  assert.strictEqual(pdfPlainText("A\r\nB"), "A\nB");
});

check("entities are decoded, so no &amp; reaches the client", () => {
  assert.strictEqual(pdfPlainText("<p>Doors &amp; windows</p>"), "Doors & windows");
  assert.strictEqual(pdfPlainText("Tom&#39;s shed"), "Tom's shed");
});

check("inline formatting is dropped, its text kept", () => {
  assert.strictEqual(pdfPlainText("<p>Supply <strong>and</strong> <em>install</em></p>"), "Supply and install");
});

check("plain text is passed through untouched", () => {
  // The overwhelmingly common case must not pay for the rare one.
  assert.strictEqual(pdfPlainText("Supply and install"), "Supply and install");
});

check("a stray angle bracket in prose is not treated as markup", () => {
  assert.strictEqual(pdfPlainText("Clearance < 90mm"), "Clearance < 90mm");
});

check("list items read as separate phrases", () => {
  assert.strictEqual(pdfPlainText("<ul><li>Tiles</li><li>Grout</li></ul>"), "Tiles\nGrout");
});

console.log(`\n${passed} pdf-text checks passed`);
