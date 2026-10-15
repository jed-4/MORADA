/**
 * The Selections Schedule PDF: what it may say (shared/selectionsPdfModel.ts)
 * and that it actually renders. It is the selections document most likely to
 * be forwarded to a client, so it is client-safe whoever exports it.
 *
 * Run:
 *   PDF_FONT_DIR="$PWD/client/public/fonts" \
 *     npx tsx --tsconfig tsconfig.pdfrender.json server/__tests__/selections-pdf-document.test.ts
 */
import assert from "node:assert";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { buildSelectionsPdfModel } from "../../shared/selectionsPdfModel";
import { SelectionsPdfDocument } from "../../client/src/components/selections/pdf/SelectionsPdfDocument";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}\n    ${(err as any)?.message}`);
    throw err;
  }
}

const option = (over: Record<string, any> = {}) => ({
  id: "o1", name: "Brushed nickel mixer", brand: "Phoenix", sku: "PX-100",
  unitCost: 100_00, gstInclusive: true, markupPercent: 50, unitCharge: 150_00, totalCost: 300_00,
  quantity: 2, unitType: "ea", visibleToClient: true, isSelectedByClient: false, approvedAt: null,
  notes: "INTERNAL: supplier gives us 30% off", attachments: [], ...over,
});
const selection = (over: Record<string, any> = {}) => ({
  id: "s1", name: "Basin mixer", room: "Ensuite", category: "Tapware", allowance: 450_00,
  clientCanSeePrice: true, notes: "INTERNAL selection note",
  options: [
    option({ id: "o1", isSelectedByClient: true, approvedAt: "2026-10-10T00:00:00Z", approvedBy: "Mick" }),
    option({ id: "o2", name: "Matte black mixer", unitCharge: 180_00 }),
    option({ id: "o3", name: "Builder-only option", visibleToClient: false }),
  ],
  ...over,
});

async function textOf(selections: any[]): Promise<string> {
  const model = buildSelectionsPdfModel(selections);
  const buffer = await renderToBuffer(
    createElement(SelectionsPdfDocument as any, {
      model, images: {}, projectName: "Dundee Reno", companyName: "Lighthouse Projects",
      brandColor: "#6E8E6E", generatedOn: "15 October 2026",
    }) as any,
  );
  const doc = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    out.push(content.items.map((it: any) => it.str).join(" "));
  }
  return out.join(" ").replace(/\s+/g, " ");
}

(async () => {
  await check("options hidden from the client are left out", () => {
    const m = buildSelectionsPdfModel([selection()]);
    assert.deepEqual(m.rooms[0].selections[0].options.map((o) => o.id), ["o1", "o2"]);
  });

  await check("prices are the client's price (charge × qty), shown only when the selection allows it", () => {
    const shown = buildSelectionsPdfModel([selection()]).rooms[0].selections[0];
    assert.equal(shown.options[0].priceCents, 300_00);
    assert.equal(shown.allowanceCents, 450_00);
    assert.equal(shown.chosenPriceCents, 300_00);
    const hidden = buildSelectionsPdfModel([selection({ clientCanSeePrice: false })]).rooms[0].selections[0];
    assert.ok(hidden.options.every((o) => o.priceCents === null));
    assert.equal(hidden.allowanceCents, null);
    assert.equal(hidden.chosenPriceCents, null);
  });

  await check("totals only count selections that show prices", () => {
    const m = buildSelectionsPdfModel([selection(), selection({ id: "s2", clientCanSeePrice: false })]);
    assert.deepEqual(m.totals, { allowanceCents: 450_00, selectedCents: 300_00 });
    assert.equal(buildSelectionsPdfModel([selection({ clientCanSeePrice: false })]).totals, null);
  });

  await check("restricted stubs are skipped", () => {
    assert.equal(buildSelectionsPdfModel([{ id: "x", name: "Secret", restricted: true, options: [] }]).count, 0);
  });

  await check("renders, and the PDF text has no cost, markup, notes or hidden option", async () => {
    const text = await textOf([selection()]);
    assert.ok(text.includes("Basin mixer"), text);
    assert.ok(text.includes("Brushed nickel mixer"));
    // formatCents drops ".00" on whole dollars.
    assert.ok(/\$300(\.00)?(?![\d,])/.test(text), `client price shown: ${text}`);
    assert.ok(/\$450(\.00)?(?![\d,])/.test(text), "allowance shown");
    assert.ok(!/\$100(\.00)?(?![\d,])/.test(text), "COST leaked");
    assert.ok(!text.includes("50%"), "markup leaked");
    assert.ok(!text.includes("INTERNAL"), "notes leaked");
    assert.ok(!text.includes("Builder-only option"), "hidden option leaked");
  });

  await check("with prices off, no dollar figure appears at all", async () => {
    const text = await textOf([selection({ clientCanSeePrice: false })]);
    assert.ok(!text.includes("$"), text);
  });

  await check("an empty schedule still renders", async () => {
    const text = await textOf([]);
    assert.ok(text.includes("No selections to show"));
  });

  console.log(`\n${passed} passed\n`);
})().catch(() => { process.exitCode = 1; });
