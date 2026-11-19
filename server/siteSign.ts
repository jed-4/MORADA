/**
 * The printable site QR sign, as a real PDF.
 *
 * Two ways to build it:
 *  - Branded: the company uploaded its own A4 design (PDF, PNG or JPG) once,
 *    and marked a box on page 1. The job's QR, name and address are stamped
 *    into that box. Every other page of the PDF is kept as it is.
 *  - Default: no template yet, so Morada lays out a plain sign with the
 *    company logo.
 *
 * Pure: bytes in, bytes out. The route (server/siteBoard.ts) loads the files.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { SiteSignLayout, SiteSignTemplateMime } from "@shared/siteBoard";

const A4 = { w: 595.28, h: 841.89 };
const MM = 72 / 25.4;
const INK = rgb(0.173, 0.157, 0.145); // --foreground #2C2825
const MUTED = rgb(0.42, 0.396, 0.38); // --muted-foreground #6B6561
const WHITE = rgb(1, 1, 1);

export interface SignInput {
  qrPng: Buffer;
  projectName: string;
  address: string | null;
  url: string;
}

export interface SignTemplate {
  bytes: Buffer;
  mime: SiteSignTemplateMime;
  layout: SiteSignLayout;
}

/** The standard fonts only encode WinAnsi; anything else (emoji, CJK, some
 *  dashes) would throw mid-render. Swap those characters rather than fail. */
function encodable(text: string, font: PDFFont): string {
  let out = "";
  for (const ch of text.normalize("NFC")) {
    const mapped = ch === "–" || ch === "—" ? "-" : ch === "‘" || ch === "’" ? "'" : ch === "“" || ch === "”" ? '"' : ch;
    try {
      font.widthOfTextAtSize(mapped, 10);
      out += mapped;
    } catch {
      out += "?";
    }
  }
  return out;
}

/** Greedy word wrap, at most `maxLines`; the last line gets an ellipsis if cut. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number, maxLines: number): string[] {
  const words = encodable(text, font).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && font.widthOfTextAtSize(`${last}...`, size) > maxWidth) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last.trimEnd()}...`;
    return kept;
  }
  // A single word wider than the box: shrink is the caller's job; clip here.
  return lines.map((l) => {
    let s = l;
    while (s.length > 1 && font.widthOfTextAtSize(s, size) > maxWidth) s = s.slice(0, -1);
    return s;
  });
}

function drawCentred(page: PDFPage, text: string, font: PDFFont, size: number, cx: number, baseline: number, color = INK) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: cx - w / 2, y: baseline, size, font, color });
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Stamp the QR, then the name and address under it, into a box given in PDF
 *  points (origin bottom-left). Text is sized from the box so a small box on
 *  a busy design still reads. */
function stampIntoBox(
  page: PDFPage,
  qr: PDFImage,
  box: { x: number; y: number; w: number; h: number },
  opts: { name: string | null; address: string | null; color: ReturnType<typeof rgb> },
  bold: PDFFont,
  regular: PDFFont,
) {
  const nameSize = clamp(box.w * 0.075, 9, 30);
  const addrSize = clamp(nameSize * 0.6, 7, 16);
  const gap = nameSize * 0.45;
  const nameLines = opts.name ? wrap(opts.name, bold, nameSize, box.w, 2) : [];
  const addrLines = opts.address ? wrap(opts.address, regular, addrSize, box.w, 2) : [];
  const textH =
    (nameLines.length ? gap + nameLines.length * nameSize * 1.15 : 0) +
    (addrLines.length ? addrLines.length * addrSize * 1.3 + (nameLines.length ? addrSize * 0.2 : gap) : 0);

  // The QR gets what's left; if text would squeeze it below ~2.5cm, drop the text.
  let showText = true;
  let size = Math.min(box.w, box.h - textH);
  if (size < 25 * MM) {
    showText = false;
    size = Math.min(box.w, box.h);
  }
  const blockH = size + (showText ? textH : 0);
  const top = box.y + box.h - (box.h - blockH) / 2; // vertically centre the whole block
  const cx = box.x + box.w / 2;
  page.drawImage(qr, { x: cx - size / 2, y: top - size, width: size, height: size });
  if (!showText) return;

  let cursor = top - size;
  if (nameLines.length) {
    cursor -= gap;
    for (const line of nameLines) {
      cursor -= nameSize;
      drawCentred(page, line, bold, nameSize, cx, cursor, opts.color);
      cursor -= nameSize * 0.15;
    }
  }
  if (addrLines.length) {
    cursor -= nameLines.length ? addrSize * 0.2 : gap;
    for (const line of addrLines) {
      cursor -= addrSize;
      drawCentred(page, line, regular, addrSize, cx, cursor, opts.color);
      cursor -= addrSize * 0.3;
    }
  }
}

/** The company's own design with the job stamped in. */
export async function buildBrandedSign(input: SignInput, template: SignTemplate): Promise<Uint8Array> {
  let doc: PDFDocument;
  let page: PDFPage;
  if (template.mime === "application/pdf") {
    doc = await PDFDocument.load(template.bytes, { ignoreEncryption: true });
    if (doc.getPageCount() === 0) throw new Error("The sign template has no pages");
    page = doc.getPage(0);
  } else {
    doc = await PDFDocument.create();
    const img = template.mime === "image/png" ? await doc.embedPng(template.bytes) : await doc.embedJpg(template.bytes);
    // Fit an A4-wide page to the image's own shape, so nothing is cropped.
    const w = A4.w;
    const h = (img.height / img.width) * w;
    page = doc.addPage([w, h]);
    page.drawImage(img, { x: 0, y: 0, width: w, height: h });
  }
  // The visible area of the page. Most templates have CropBox = MediaBox,
  // but a print-ready PDF with bleed has its trim inside the media box.
  const crop = page.getCropBox();
  const { x, y, w, h } = template.layout;
  const box = {
    x: crop.x + x * crop.width,
    y: crop.y + crop.height - (y + h) * crop.height,
    w: w * crop.width,
    h: h * crop.height,
  };
  const [qr, bold, regular] = await Promise.all([
    doc.embedPng(input.qrPng),
    doc.embedFont(StandardFonts.HelveticaBold),
    doc.embedFont(StandardFonts.Helvetica),
  ]);
  stampIntoBox(page, qr, box, {
    name: template.layout.showName ? input.projectName : null,
    address: template.layout.showAddress ? input.address : null,
    color: template.layout.textColor === "light" ? WHITE : INK,
  }, bold, regular);
  doc.setTitle(`${input.projectName} - site QR`);
  return doc.save();
}

/** Morada's plain sign, for a company that hasn't uploaded a design. */
export async function buildDefaultSign(
  input: SignInput,
  logo: { bytes: Buffer; mime: string } | null,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([A4.w, A4.h]);
  const [qr, bold, regular, mono] = await Promise.all([
    doc.embedPng(input.qrPng),
    doc.embedFont(StandardFonts.HelveticaBold),
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.Courier),
  ]);
  const margin = 14 * MM;
  const inner = { x: margin, y: margin, w: A4.w - margin * 2, h: A4.h - margin * 2 };
  page.drawRectangle({ x: inner.x, y: inner.y, width: inner.w, height: inner.h, borderColor: INK, borderWidth: 2.5 });
  const cx = A4.w / 2;
  const textW = inner.w - 24 * MM;
  let cursor = inner.y + inner.h - 14 * MM;

  // pdf-lib embeds PNG and JPEG only; an SVG or WebP logo is skipped, not fatal.
  if (logo && (logo.mime === "image/png" || logo.mime === "image/jpeg" || logo.mime === "image/jpg")) {
    try {
      const img = logo.mime === "image/png" ? await doc.embedPng(logo.bytes) : await doc.embedJpg(logo.bytes);
      const scale = Math.min((70 * MM) / img.width, (22 * MM) / img.height);
      const lw = img.width * scale;
      const lh = img.height * scale;
      cursor -= lh;
      page.drawImage(img, { x: cx - lw / 2, y: cursor, width: lw, height: lh });
      cursor -= 8 * MM;
    } catch {
      /* a corrupt logo shouldn't stop the sign */
    }
  }

  cursor -= 13;
  drawCentred(page, "ON SITE", regular, 13, cx, cursor, MUTED);
  cursor -= 6 * MM;
  for (const line of wrap(input.projectName, bold, 30, textW, 2)) {
    cursor -= 30;
    drawCentred(page, line, bold, 30, cx, cursor);
    cursor -= 4;
  }
  if (input.address) {
    cursor -= 2 * MM;
    for (const line of wrap(input.address, regular, 14, textW, 2)) {
      cursor -= 14;
      drawCentred(page, line, regular, 14, cx, cursor, MUTED);
      cursor -= 4;
    }
  }

  // Bottom block first, so the QR takes whatever height is left between.
  let bottom = inner.y + 10 * MM;
  for (const line of wrap(input.url, mono, 8.5, textW, 2).reverse()) {
    drawCentred(page, line, mono, 8.5, cx, bottom, MUTED);
    bottom += 11;
  }
  bottom += 4;
  drawCentred(page, "Open your phone's camera and point it at the code. No app or login needed.", regular, 10.5, cx, bottom, MUTED);
  bottom += 10.5 + 8 * MM;
  drawCentred(page, "Always the current version - check here before ordering, building or installing.", regular, 12, cx, bottom, MUTED);
  bottom += 12 + 3 * MM;
  drawCentred(page, "Scan for plans & selections", bold, 20, cx, bottom);
  bottom += 20 + 6 * MM;

  const size = Math.min(125 * MM, cursor - 8 * MM - bottom);
  page.drawImage(qr, { x: cx - size / 2, y: bottom + (cursor - 8 * MM - bottom - size) / 2, width: size, height: size });

  doc.setTitle(`${input.projectName} - site QR`);
  return doc.save();
}

/** Check an uploaded template opens before it is saved, so a bad file is
 *  refused at upload rather than on site day. Returns page 1's shape. */
export async function inspectTemplate(bytes: Buffer, mime: SiteSignTemplateMime): Promise<{ pages: number }> {
  if (mime === "application/pdf") {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return { pages: doc.getPageCount() };
  }
  const doc = await PDFDocument.create();
  if (mime === "image/png") await doc.embedPng(bytes);
  else await doc.embedJpg(bytes);
  return { pages: 1 };
}
