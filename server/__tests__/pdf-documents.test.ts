/**
 * Renders every migrated document to real PDF bytes and reads the text back.
 *
 * The variation has its own file (variation-pdf-document.test.ts); this one
 * covers the rest of the kit's adopters and, more importantly, the invariants
 * that apply to ALL of them — the things that can only be checked by rendering,
 * and that a per-component unit test would miss entirely.
 *
 * Run:
 *   PDF_FONT_DIR="$PWD/client/public/fonts" \
 *     npx tsx --tsconfig tsconfig.pdfrender.json server/__tests__/pdf-documents.test.ts
 */
import assert from "node:assert";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { InvoiceDocument } from "../../client/src/components/invoices/pdf/InvoiceDocument";
import { PurchaseOrderDocument } from "../../client/src/components/purchase-orders/pdf/PurchaseOrderDocument";
import { RFQDocument } from "../../client/src/components/rfq/pdf/RFQDocument";
import { statusPaint } from "../../client/src/components/pdf/shared/pdfStatus";

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
};
const PROJECT = { name: "Irwin Wildlife Compound Reno", address: "42 Croc Creek Road, Beerwah QLD 4519" };
const BRAND = "#6E8E6E";

async function pagesOf(element: any): Promise<string[]> {
  const buffer = await renderToBuffer(element);
  const doc = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    out.push(
      content.items
        .map((it: any) => it.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    );
  }
  return out;
}

const invoice = (overrides: any = {}) =>
  createElement(InvoiceDocument, {
    invoiceNumber: "INV-1042",
    issueDate: new Date("2026-08-20"),
    dueDate: new Date("2026-09-30"),
    company: COMPANY,
    clientName: "Steve & Terri Irwin",
    clientEmail: "steve@wildlife.com.au",
    projectName: PROJECT.name,
    projectAddress: PROJECT.address,
    lineItems: [
      { label: "Progress Claim 4", description: "Base stage", claimPct: 100, amountExTax: 4500000, gst: 450000, amountIncTax: 4950000 },
    ],
    subtotalCents: 4500000,
    gstCents: 450000,
    totalCents: 4950000,
    paidCents: 0,
    balanceDueCents: 4950000,
    brandColor: BRAND,
    documentStyle: "style2",
    status: "sent",
    attachments: [],
    ...overrides,
  } as any) as any;

const purchaseOrder = (overrides: any = {}) =>
  createElement(PurchaseOrderDocument, {
    purchaseOrder: {
      poNumber: "PO-0031",
      poDate: new Date("2026-08-20"),
      requiredByDate: new Date("2026-09-05"),
      title: "Kitchen cabinetry",
      subtotal: 4200000,
      gstAmount: 420000,
      total: 4620000,
      status: "sent",
      ...(overrides.purchaseOrder ?? {}),
    },
    items: [
      { description: "Overhead cabinets, 2-pac finish", quantity: 6, unit: "ea", unitPrice: 500000, total: 3000000 },
      { description: "Island bench carcass", quantity: 1, unit: "ea", unitPrice: 1200000, total: 1200000 },
    ],
    company: COMPANY,
    supplier: {
      name: "Hugh Jackman Joinery & Cabinetry",
      email: "hugh@jackmanjoinery.com.au",
      phone: "0400 111 222",
      abn: "98 765 432 109",
    },
    project: PROJECT,
    brandColor: BRAND,
    documentStyle: "style2",
    ...overrides,
  } as any) as any;

const rfqDoc = (overrides: any = {}) =>
  createElement(RFQDocument, {
    rfq: {
      id: "r1",
      rfqNumber: "RFQ-0007",
      title: "Roof plumbing package",
      scope: "Supply and install colorbond fascia, gutter and downpipes to the main roof.",
      dueDate: new Date("2026-09-18"),
      status: "sent",
      ...(overrides.rfq ?? {}),
    },
    items: [
      { id: "ri1", description: "Colorbond gutter", quantity: "48", unit: "m", notes: null },
      { id: "ri2", description: "Downpipes", quantity: "6", unit: "ea", notes: "Match existing profile" },
    ],
    company: COMPANY,
    project: PROJECT,
    supplier: { name: "Chopper Read's Roofing", email: "chopper@roofing.com.au" },
    brandColor: BRAND,
    documentStyle: "style2",
    ...overrides,
  } as any) as any;

const ALL = [
  { name: "invoice", build: invoice },
  { name: "purchase order", build: purchaseOrder },
  { name: "RFQ", build: rfqDoc },
];

async function main() {
  console.log("pdf documents");

  await check("no document emits a page carrying only the footer", async () => {
    // The invoice was doing exactly this: the last section's 24pt trailing
    // margin tipped past the page boundary, so a client received a two-page
    // invoice whose second page was blank apart from "Powered by Morada".
    // Section spacing moved to the leading edge to make it structurally
    // impossible; this is the guard.
    for (const { name, build } of ALL) {
      const pages = await pagesOf(build());
      pages.forEach((text, i) => {
        const withoutChrome = text
          .replace(COMPANY.name, "")
          .replace("Powered by Morada", "")
          .replace(/Page \d+ of \d+/, "")
          .trim();
        assert.ok(
          withoutChrome.length > 0,
          `${name}: page ${i + 1} of ${pages.length} contains only the footer`,
        );
      });
    }
  });

  await check("every document names who it is addressed to", async () => {
    // DocProjectBar's props were hard-coded to a client, so the purchase order
    // and the RFQ passed only the project and never named their supplier.
    const [inv] = await pagesOf(invoice());
    assert.ok(inv.includes("Steve & Terri Irwin"), "invoice does not name its client");

    const [po] = await pagesOf(purchaseOrder());
    assert.ok(po.includes("SUPPLIER"), "purchase order has no supplier block");
    assert.ok(po.includes("Hugh Jackman Joinery & Cabinetry"), "purchase order does not name its supplier");

    const [rfq] = await pagesOf(rfqDoc());
    assert.ok(rfq.includes("SUPPLIER"), "RFQ has no supplier block");
    assert.ok(rfq.includes("Chopper Read's Roofing"), "RFQ does not name its supplier");
  });

  await check("a purchase order never prints internal notes", async () => {
    // purchase_orders.internal_notes is commented "Internal only, not on PDF"
    // in the schema, and this document used to render it in a highlighted box
    // on the copy emailed to the supplier. The prop is gone; passing it must
    // do nothing rather than quietly reappear.
    const secret = "Supplier has been unreliable — check every delivery.";
    const pages = await pagesOf(
      purchaseOrder({ purchaseOrder: { internalNotes: secret } as any }),
    );
    const all = pages.join(" ");
    assert.ok(!all.includes(secret), "internal notes reached the supplier's copy");
    assert.ok(!all.includes("NOTES"), "an internal notes block is still rendered");
  });

  await check("an RFQ asks for a price rather than suggesting one", async () => {
    const [page1] = await pagesOf(rfqDoc());
    assert.ok(page1.includes("Your Rate"), "no column for the supplier to price into");
    assert.ok(page1.includes("Quotes due by"), "the deadline is not in the masthead");
    // An RFQ has no total of its own; printing one would anchor the quote.
    assert.ok(!/Total \(inc\. GST\)/.test(page1), "an RFQ should not carry a total");
  });

  await check("an invoice leads with what is still owed", async () => {
    const [page1] = await pagesOf(
      invoice({ paidCents: 2000000, balanceDueCents: 2950000, status: "partial" }),
    );
    assert.ok(page1.includes("Balance due"), "balance due is not labelled");
    assert.ok(page1.includes("$29,500.00"), "balance due figure missing");
    assert.ok(page1.includes("$20,000.00"), "payments received are not shown");
    // The figure in the masthead must be the balance, not the invoice total —
    // on a part-paid invoice those differ, and the client needs the balance.
    assert.ok(
      page1.indexOf("$29,500.00") < page1.indexOf("TO"),
      "the masthead figure should be the balance due",
    );
  });

  await check("an overdue invoice says so, and only when it is", async () => {
    const [late] = await pagesOf(invoice({ dueDate: new Date("2026-08-01") }));
    assert.ok(late.includes("PAYMENT OVERDUE"), "no overdue callout on a late invoice");
    assert.ok(late.includes("Overdue"), "no overdue status chip");

    const [current] = await pagesOf(invoice({ dueDate: new Date("2099-01-01") }));
    assert.ok(!current.includes("PAYMENT OVERDUE"), "overdue callout on an invoice that is not late");
  });

  await check("status chips share one palette, and draft is grey", () => {
    // Each document used to carry its own Tailwind palette, so a "sent"
    // invoice and a "sent" purchase order printed in different blues.
    assert.deepStrictEqual(statusPaint("sent").bg, statusPaint("issued").bg);
    assert.deepStrictEqual(statusPaint("paid").bg, statusPaint("approved").bg);

    // Jed's call, carried over from the screen: "draft is blue, it should be
    // grey, it confuses sent".
    assert.notStrictEqual(statusPaint("draft").bg, statusPaint("sent").bg);
    assert.strictEqual(statusPaint("draft").bg, statusPaint("pending").bg);

    // Unknown statuses look inert rather than picking a colour at random.
    assert.strictEqual(statusPaint("banana").bg, statusPaint("draft").bg);

    // Keys are normalised, and labels read as English.
    assert.strictEqual(statusPaint("awaiting_approval").label, "Awaiting Approval");
    assert.strictEqual(statusPaint("in-progress").bg, statusPaint("inprogress").bg);
  });

  await check("italic text renders instead of killing the document", async () => {
    // @react-pdf does not synthesise a slant. Registering Inter without italic
    // faces made `fontStyle: "italic"` throw "Could not resolve font" and take
    // the whole render with it — and the proposal's rich-text renderer maps a
    // builder's <em> straight onto that style, so italicising one word in a
    // proposal would have produced no PDF at all.
    //
    // Rendered through a document rather than asserted on the font store,
    // because the failure was at render time.
    const { Document, Page, Text, renderToBuffer: render } = await import("@react-pdf/renderer");
    const { registerPdfFonts, PDF_FONT_FAMILY } = await import(
      "../../client/src/components/pdf/shared/registerPdfFonts"
    );
    registerPdfFonts();

    for (const weight of [400, 500, 600, 700] as const) {
      const el = createElement(
        Document,
        null,
        createElement(
          Page,
          { size: "A4" },
          createElement(
            Text,
            { style: { fontFamily: PDF_FONT_FAMILY, fontWeight: weight, fontStyle: "italic" } },
            `Italic at ${weight}`,
          ),
        ),
      );
      const buf = await render(el as any);
      assert.ok(buf.length > 0, `italic ${weight} produced no bytes`);
    }
  });

  await check("the table header repeats on every page it spans", async () => {
    // A second page of unlabelled figures makes the reader page back to find
    // out which column is the price.
    const { Document, Page, Text, View } = await import("@react-pdf/renderer");
    const { PdfLineTable } = await import("../../client/src/components/pdf/shared/PdfLineTable");

    type Row = { id: string; n: number };
    const rows: Row[] = Array.from({ length: 60 }, (_, i) => ({ id: `r${i}`, n: i + 1 }));
    const build = (repeatHeader: boolean) =>
      createElement(
        Document,
        null,
        createElement(
          Page,
          { size: "A4", style: { paddingBottom: 56 } },
          createElement(
            View,
            { style: { paddingHorizontal: 40, paddingTop: 24 } },
            createElement(PdfLineTable as any, {
              brandColor: BRAND,
              grouped: false,
              repeatHeader,
              textHeader: "Description",
              renderText: (r: Row) => createElement(Text, null, `Line ${r.n}`),
              columns: [{ key: "n", label: "Amount", width: 90, align: "right", value: (r: Row) => String(r.n) }],
              groups: [{ key: "all", rows }],
              rowKey: (r: Row) => r.id,
            }),
          ),
        ),
      );

    const headerPerPage = async (el: any) => {
      const pages = await pagesOf(el);
      return pages.map((t) => t.includes("Description") && t.includes("Amount"));
    };

    const on = await headerPerPage(build(true));
    assert.ok(on.length > 1, "the fixture did not span pages, so this proves nothing");
    assert.ok(on.every(Boolean), `header missing on some page: ${JSON.stringify(on)}`);

    // And it is genuinely the flag doing it, not the fixture.
    const off = await headerPerPage(build(false));
    assert.ok(!off.every(Boolean), "repeatHeader=false still repeated the header");
  });

  await check("a group subtotal only prints where it earns its place", async () => {
    const { Document, Page, Text, View } = await import("@react-pdf/renderer");
    const { PdfLineTable } = await import("../../client/src/components/pdf/shared/PdfLineTable");

    type Row = { id: string; label: string };
    const rows = (p: string, n: number): Row[] =>
      Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, label: `${p} ${i + 1}` }));

    const el = createElement(
      Document,
      null,
      createElement(
        Page,
        { size: "A4", style: { paddingBottom: 56 } },
        createElement(
          View,
          { style: { paddingHorizontal: 40, paddingTop: 24 } },
          createElement(PdfLineTable as any, {
            brandColor: BRAND,
            grouped: true,
            textHeader: "Description",
            renderText: (r: Row) => createElement(Text, null, r.label),
            columns: [{ key: "a", label: "Amount", width: 90, align: "right", value: () => "-" }],
            groups: [
              // One line: the "subtotal" would repeat the row under it.
              { key: "solo", label: "Solo", total: "$111.00", rows: rows("Solo", 1) },
              // Several lines: the reader cannot add them by eye.
              { key: "many", label: "Many", total: "$222.00", rows: rows("Many", 3) },
              // One line but sub-groups: what it sums is spread across headings.
              {
                key: "parent",
                label: "Parent",
                total: "$333.00",
                rows: rows("Direct", 1),
                children: [
                  { key: "kid", label: "Kid", total: "$444.00", rows: rows("Kid", 2) },
                  { key: "only", label: "Only", total: "$555.00", rows: rows("Only", 1) },
                ],
              },
            ],
            rowKey: (r: Row) => r.id,
          }),
        ),
      ),
    );

    const all = (await pagesOf(el)).join(" ");
    assert.ok(!all.includes("$111.00"), "a single-line group printed a subtotal");
    assert.ok(all.includes("$222.00"), "a multi-line group lost its subtotal");
    assert.ok(all.includes("$333.00"), "a parent of sub-groups lost its subtotal");
    assert.ok(all.includes("$444.00"), "a multi-line sub-group lost its subtotal");
    assert.ok(!all.includes("$555.00"), "a single-line sub-group printed a subtotal");

    // Nesting is visible at all: the child labels reach the page.
    assert.ok(all.includes("Kid") && all.includes("Only"), "sub-groups did not render");
  });

  await check("turning grouping off flattens the nesting, not just its labels", async () => {
    // Hiding the headings but keeping the indentation leaves rows shunted
    // right for no visible reason — a flat list with an arbitrary ragged edge.
    // Measured on the rendered x-positions rather than asserted on the style,
    // because the style is exactly what was wrong.
    const { Document, Page, Text, View } = await import("@react-pdf/renderer");
    const { PdfLineTable } = await import("../../client/src/components/pdf/shared/PdfLineTable");

    type Row = { id: string; label: string };
    const rows = (p: string, n: number): Row[] =>
      Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, label: `${p} line ${i + 1}` }));

    const groups = [
      { key: "a", label: "Top", total: "$1.00", rows: rows("Top", 2) },
      {
        key: "b",
        label: "Parent",
        total: "$2.00",
        rows: rows("Direct", 2),
        children: [
          { key: "c", label: "Child", total: "$3.00", rows: rows("Child", 2),
            children: [{ key: "d", label: "Grandchild", total: "$4.00", rows: rows("Deep", 2) }] },
        ],
      },
    ];

    const build = (grouped: boolean) =>
      createElement(Document, null,
        createElement(Page, { size: "A4", style: { paddingBottom: 56 } },
          createElement(View, { style: { paddingHorizontal: 40, paddingTop: 24 } },
            createElement(PdfLineTable as any, {
              brandColor: BRAND, grouped, textHeader: "Description",
              renderText: (r: Row) => createElement(Text, null, r.label),
              columns: [{ key: "x", label: "Amount", width: 90, align: "right", value: () => "-" }],
              groups, rowKey: (r: Row) => r.id,
            }))));

    const leftEdges = async (grouped: boolean) => {
      const buf = await renderToBuffer(build(grouped) as any);
      const doc = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
      const items: any[] = (await (await doc.getPage(1)).getTextContent()).items;
      return new Set(
        items.filter((i) => /line \d/.test(i.str)).map((i) => Math.round(i.transform[4])),
      );
    };

    const flat = await leftEdges(false);
    assert.strictEqual(flat.size, 1, `flat rows should share one left edge, got ${[...flat]}`);

    const grouped = await leftEdges(true);
    assert.strictEqual(grouped.size, 3, `three depths should give three left edges, got ${[...grouped]}`);
  });

  console.log(`\n${passed} checks passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
