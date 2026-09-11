/**
 * Renders the real VariationDocument to a PDF in Node and reads the text back.
 *
 * Same approach as proposal-pdf-section-intro.test.ts, and for the same reason:
 * the things that were wrong here were only wrong in the rendered bytes. A unit
 * test on the component would have happily passed while the client received a
 * document with a blank signature line and an orange price on a green page.
 *
 * Run:
 *   PDF_FONT_DIR="$PWD/client/public/fonts" \
 *     npx tsx --tsconfig tsconfig.pdfrender.json server/__tests__/variation-pdf-document.test.ts
 *
 * PDF_FONT_DIR is needed because the component registers its faces by browser
 * path ("/fonts/Inter-400.woff"), which fontkit resolves against the filesystem
 * root under Node. The separate tsconfig only switches JSX to the automatic
 * runtime; the app builds with "preserve" for Vite.
 */
import assert from "node:assert";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { VariationDocument } from "../../client/src/components/variations/pdf/VariationDocument";
import { brandRamp, companyInitials } from "../../client/src/components/pdf/shared/pdfTokens";

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

const COMPANY = {
  name: "Lighthouse Projects & Construction",
  abn: "12 345 678 901",
  phone: "0439 345 723",
  email: "jed@lighthouseprojects.com.au",
  logo: null,
};

const PROJECT = {
  name: "Irwin Wildlife Compound Reno",
  address: "42 Croc Creek Road, Beerwah QLD 4519",
  clientName: "Steve & Terri Irwin",
  clientEmail: null,
  clientPhone: null,
};

const ITEM: any = {
  id: "i1",
  variationId: "v1",
  name: "Additional works",
  description: "Relocate the plumbing stack",
  quantity: 1,
  unitPrice: 500000,
  totalPrice: 500000,
  taxable: true,
  sortOrder: 0,
  itemType: "cost_line",
  type: "Material",
  unitType: "each",
  unitCostExTax: 5000,
  markupPercent: null,
  costCode: null,
  showInPdf: true,
};

function variation(overrides: any = {}): any {
  return {
    id: "v1",
    variationNumber: "VAR-001",
    name: "Kitchen re-scope",
    introductionText: null,
    closingText: null,
    termsAndConditions: null,
    approvalDeadline: null,
    daysChanged: 0,
    status: "pending",
    globalMarkupPercent: 25,
    globalMarkupAmount: 137500,
    subtotal: 625000,
    gstAmount: 62500,
    totalAmount: 687500,
    attachments: [],
    rejectionReason: null,
    clientSignedName: null,
    clientSignedDate: null,
    builderSignedName: null,
    builderSignedDate: null,
    ...overrides,
  };
}

/** Every visible string in the rendered document, joined per page. */
async function renderText(props: any): Promise<string[]> {
  const buffer = await renderToBuffer(
    createElement(VariationDocument, {
      items: [ITEM],
      bills: [],
      labourTotalCents: 0,
      company: COMPANY,
      project: PROJECT,
      brandColor: "#6E8E6E",
      documentStyle: "style2",
      logoUrl: null,
      ...props,
    } as any) as any,
  );
  const doc = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    // pdfjs emits one item per text node, so adjacent JSX children come back
    // separated ("Signed" + the date reads as "Signed   10 September 2026").
    // Collapse runs of whitespace so assertions can be written as they read.
    pages.push(
      content.items
        .map((it: any) => it.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    );
  }
  return pages;
}

async function main() {
  console.log("variation PDF document");

  await check("the headline total is in the masthead, with the document number", async () => {
    const [page1] = await renderText({ variation: variation() });
    assert.ok(page1.includes("$6,875.00"), "total missing from page 1");
    assert.ok(page1.includes("VAR-001"), "variation number missing");
    // It must sit ABOVE the details, i.e. in the band — not in a money card
    // further down the page the way the old three-block header had it.
    assert.ok(
      page1.indexOf("$6,875.00") < page1.indexOf("VARIATION DETAILS"),
      "the total should be in the masthead, before the first section",
    );
  });

  await check("a captured client signature is printed, not a blank rule", async () => {
    const [page1] = await renderText({
      variation: variation({
        clientSignedName: "Jed Smith",
        clientSignedDate: new Date("2026-09-10T09:24:00"),
      }),
    });
    // The regression this guards: the document used to print "Name: ____" for
    // both parties even after the client had signed in the portal, throwing
    // away the evidence the signature exists to provide.
    assert.ok(page1.includes("Jed Smith"), "signer name missing");
    assert.ok(page1.includes("Signed 10 September 2026"), "signing date missing");
  });

  await check("an unsigned document still offers ruled lines to sign by hand", async () => {
    const [page1] = await renderText({ variation: variation() });
    assert.ok(page1.includes("Signature"), "no hand-signing lines on an unsigned document");
  });

  await check("a rejected variation carries its reason", async () => {
    const pages = await renderText({
      variation: variation({
        status: "rejected",
        rejectionReason: "Cabinetry allowance is higher than we discussed on site.",
      }),
    });
    const all = pages.join(" ");
    assert.ok(all.includes("REASON FOR REJECTION"), "rejection callout missing");
    assert.ok(
      all.includes("Cabinetry allowance is higher than we discussed on site."),
      "rejection reason text missing",
    );
  });

  await check("both mastheads render and honour documentStyle", async () => {
    for (const documentStyle of ["style1", "style2"] as const) {
      const [page1] = await renderText({ variation: variation(), documentStyle });
      assert.ok(page1.includes("Lighthouse Projects & Construction"), `${documentStyle}: company missing`);
      assert.ok(page1.includes("$6,875.00"), `${documentStyle}: total missing`);
    }
  });

  await check("a company with no logo gets initials, never an empty tile", () => {
    assert.strictEqual(companyInitials("Lighthouse Projects & Construction"), "LC");
    assert.strictEqual(companyInitials("Morada"), "MO");
    assert.strictEqual(companyInitials("Smith & Sons Pty. Ltd."), "SL");
    assert.strictEqual(companyInitials(""), "—");
    assert.strictEqual(companyInitials(null), "—");
  });

  await check("brand colours stay readable at both ends of the range", () => {
    // Dark brand: white on the band.
    assert.strictEqual(brandRamp("#2B4C7E").onBrand, "#FFFFFF");
    // Pale brand: ink on the band, or the company name vanishes.
    assert.strictEqual(brandRamp("#F2D98B").onBrand, "#2C2825");

    // And as TEXT ON WHITE, a pale brand has to be darkened or the document
    // total prints in near-invisible yellow.
    const pale = brandRamp("#F2D98B");
    assert.notStrictEqual(pale.onWhite, pale.base, "pale brand was not darkened for use as ink");
    const lum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
        .map((c) => {
          const v = c / 255;
          return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        })
        .reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
    };
    assert.ok(1.05 / (lum(pale.onWhite) + 0.05) >= 4.5, "brand ink fails 4.5:1 on white");

    // A brand already dark enough is left alone.
    const dark = brandRamp("#2B4C7E");
    assert.strictEqual(dark.onWhite, dark.base, "a dark brand should not be darkened further");
  });

  await check("every optional column on still leaves a readable description", async () => {
    const allCols: any = {
      name: true, description: true, costCode: true, quantity: true, unit: true,
      unitCost: true, unitPrice: true, markupPercent: true, markupAmount: true,
      amountEx: true, amountInc: true, grouping: true, bills: true, contractSummary: false,
    };
    const pages = await renderText({ variation: variation(), columns: allCols });
    const all = pages.join(" ");
    // Nine columns leave the text cell ~47pt unless the table squeezes them,
    // at which point a description sets one word per line. Asserting the words
    // are adjacent proves the cell is still wide enough to be a column.
    assert.ok(all.includes("Relocate the plumbing"), "description broke apart under full columns");
    assert.ok(all.includes("Amt inc. GST"), "last column missing");
  });

  console.log(`\n${passed} checks passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
