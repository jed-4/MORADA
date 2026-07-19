// Server-side subbie invoice PDF — HTML → puppeteer → A4 PDF buffer.
//
// Why server-side: the builder-side invoice PDF uses @react-pdf/renderer in the
// browser, which can't run in React Native. This renderer takes a plain data
// object (no DB, no React) so BOTH web and mobile can get a PDF from one endpoint.
// Mirrors the existing puppeteer helper in server/routes.ts (Selections Schedule).
//
// GST correctness is enforced here as well as in the totals: a NON-registered
// subbie's document is titled "Invoice" (never "Tax Invoice") and shows no GST
// line — emitting GST while unregistered is not legal in AU.

import { formatCents, type Cents } from "../../shared/money";

export interface SubbieInvoicePdfLine {
  description: string;
  /** Fractional quantity (7.5 hrs / 3.5 days). */
  quantity: number;
  /** "hour" | "day" — rendered as hr / day. */
  unit: string;
  unitPriceCents: Cents;
  totalPriceCents: Cents;
}

export interface SubbieInvoicePdfData {
  /** Enforced label — pass the value computed by computeSubbieInvoice. */
  documentLabel: "Tax Invoice" | "Invoice";
  gstRegistered: boolean;
  business: {
    name: string;
    abn?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  client: {
    name: string;
    address?: string | null;
  };
  invoiceNumber: string;
  /** Display strings — format upstream so the PDF stays presentation-only. */
  invoiceDate: string;
  dueDate?: string | null;
  lines: SubbieInvoicePdfLine[];
  subtotalExGstCents: Cents;
  gstCents: Cents;
  totalIncGstCents: Cents;
  bankDetails?: string | null;
  notes?: string | null;
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function unitLabel(unit: string, qty: number): string {
  if (unit === "day") return qty === 1 ? "day" : "days";
  if (unit === "hour") return qty === 1 ? "hr" : "hrs";
  return esc(unit);
}

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

/** Build the invoice HTML. Pure — safe to unit-test / snapshot. */
export function buildSubbieInvoiceHtml(data: SubbieInvoicePdfData): string {
  const accent = "#34519e";
  const ink = "#1b1b18";
  const muted = "#6b6560";
  const rule = "#e3e1db";

  const rows = data.lines
    .map(
      (l) => `
      <tr>
        <td class="desc">${esc(l.description)}</td>
        <td class="num">${fmtQty(l.quantity)} ${unitLabel(l.unit, l.quantity)}</td>
        <td class="num">${formatCents(l.unitPriceCents, { alwaysShowDecimals: true })}</td>
        <td class="num">${formatCents(l.totalPriceCents, { alwaysShowDecimals: true })}</td>
      </tr>`,
    )
    .join("");

  // GST line only when registered.
  const gstRow = data.gstRegistered
    ? `<tr><td>GST (10%)</td><td class="num">${formatCents(data.gstCents, { alwaysShowDecimals: true })}</td></tr>`
    : "";

  const abnBlock = data.business.abn
    ? `<div class="abn">ABN ${esc(data.business.abn)}</div>`
    : "";

  const contactBits = [data.business.email, data.business.phone]
    .filter(Boolean)
    .map((b) => esc(b))
    .join("&nbsp;&nbsp;·&nbsp;&nbsp;");

  const dueRow = data.dueDate
    ? `<div><span class="k">Due</span> ${esc(data.dueDate)}</div>`
    : "";

  const notesBlock = data.notes
    ? `<div class="notes"><div class="k">Notes</div><div>${esc(data.notes)}</div></div>`
    : "";

  const bankBlock = data.bankDetails
    ? `<div class="bank"><div class="k">Payment</div><div>${esc(data.bankDetails).replace(/\n/g, "<br>")}</div></div>`
    : "";

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: ${ink}; font-size: 12px; line-height: 1.5;
  }
  .wrap { padding: 4px 2px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid ${ink}; padding-bottom: 16px; }
  .biz .name { font-size: 18px; font-weight: 700; letter-spacing: -.01em; }
  .abn { color: ${muted}; font-size: 11px; margin-top: 2px; }
  .contact { color: ${muted}; font-size: 11px; margin-top: 4px; }
  .doc { text-align: right; }
  .doc .label { font-size: 22px; font-weight: 800; letter-spacing: -.02em; color: ${accent}; text-transform: uppercase; }
  .doc .no { font-size: 12px; color: ${muted}; margin-top: 2px; }
  .meta { display: flex; gap: 40px; margin: 22px 0 6px; }
  .meta .k { color: ${muted}; text-transform: uppercase; font-size: 10px; letter-spacing: .06em; display: block; }
  .billto { margin: 18px 0 8px; }
  .billto .k { color: ${muted}; text-transform: uppercase; font-size: 10px; letter-spacing: .06em; }
  .billto .who { font-size: 14px; font-weight: 650; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 14px; }
  table.items th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: ${muted}; border-bottom: 1px solid ${ink}; padding: 8px 10px; }
  table.items td { padding: 10px; border-bottom: 1px solid ${rule}; vertical-align: top; }
  table.items td.num, table.items th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.desc { width: 55%; }
  .totals { margin-top: 16px; display: flex; justify-content: flex-end; }
  .totals table { border-collapse: collapse; min-width: 260px; }
  .totals td { padding: 6px 10px; }
  .totals td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .totals tr.grand td { border-top: 2px solid ${ink}; font-weight: 800; font-size: 14px; padding-top: 10px; }
  .foot { margin-top: 28px; display: flex; gap: 40px; }
  .k { color: ${muted}; text-transform: uppercase; font-size: 10px; letter-spacing: .06em; }
  .notes, .bank { font-size: 11px; }
  .notes div:last-child, .bank div:last-child { margin-top: 3px; }
</style></head>
<body><div class="wrap">
  <div class="head">
    <div class="biz">
      <div class="name">${esc(data.business.name)}</div>
      ${abnBlock}
      ${contactBits ? `<div class="contact">${contactBits}</div>` : ""}
    </div>
    <div class="doc">
      <div class="label">${esc(data.documentLabel)}</div>
      <div class="no">${esc(data.invoiceNumber)}</div>
    </div>
  </div>

  <div class="meta">
    <div><span class="k">Date</span> ${esc(data.invoiceDate)}</div>
    ${dueRow}
  </div>

  <div class="billto">
    <div class="k">Bill to</div>
    <div class="who">${esc(data.client.name)}</div>
    ${data.client.address ? `<div>${esc(data.client.address).replace(/\n/g, "<br>")}</div>` : ""}
  </div>

  <table class="items">
    <thead><tr>
      <th class="desc">Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals"><table>
    <tr><td>Subtotal${data.gstRegistered ? " (ex GST)" : ""}</td><td class="num">${formatCents(data.subtotalExGstCents, { alwaysShowDecimals: true })}</td></tr>
    ${gstRow}
    <tr class="grand"><td>Total${data.gstRegistered ? " (inc GST)" : ""}</td><td class="num">${formatCents(data.totalIncGstCents, { alwaysShowDecimals: true })}</td></tr>
  </table></div>

  <div class="foot">
    ${bankBlock}
    ${notesBlock}
  </div>
</div></body></html>`;
}

/**
 * Render the invoice to a PDF Buffer via puppeteer.
 * Mirrors the launch/pdf pattern of the existing Selections Schedule helper.
 */
export async function renderSubbieInvoicePdf(data: SubbieInvoicePdfData): Promise<Buffer> {
  const html = buildSubbieInvoiceHtml(data);
  const puppeteer = await import("puppeteer");
  const browser = await puppeteer.default.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
