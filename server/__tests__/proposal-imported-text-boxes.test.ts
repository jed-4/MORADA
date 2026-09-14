/**
 * Merge fields stamped onto imported pages.
 *
 * Run:
 *   npx tsx --tsconfig tsconfig.test.json server/__tests__/proposal-imported-text-boxes.test.ts
 *
 * The thing under test is a coordinate conversion, and a coordinate conversion
 * is exactly the kind of code that looks right, previews plausibly, and puts
 * the client's name three centimetres into the gutter. So the assertions do
 * not read our own maths back: they render the finished PDF through pdf.js and
 * ask where the text actually landed, in the frame a reader sees.
 */
import { readFileSync } from "node:fs";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { mergeImportedPages } from "../../client/src/components/proposals/pdf/mergeImportedPages";
import { visualPage, wrapText, layoutRichBox, createFontBook } from "../../client/src/components/proposals/pdf/stampTextBoxes";
import { parseStampHtml, stampLineHeight, stampPlainText } from "../../client/src/components/proposals/pdf/stampRichText";
import { normaliseTextBoxes, newTextBox, type ImportedTextBox } from "../../client/src/components/proposals/pdf/importedTextBoxes";

const A4: [number, number] = [595.28, 841.89];
const IMPORT: [number, number] = [500, 700];
const SLOT: [number, number] = [10, 10];
const STANDARD_FONTS = "./node_modules/pdfjs-dist/standard_fonts/";

let failed = 0;
async function checkAsync(label: string, run: () => Promise<unknown>, expected: unknown) {
  check(label, await run(), expected);
}

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : `\n       expected ${JSON.stringify(expected)}\n       actual   ${JSON.stringify(actual)}`}`,
  );
}

function near(label: string, actual: number, expected: number, tolerance = 1) {
  const ok = Math.abs(actual - expected) <= tolerance;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : `\n       expected ${expected} ±${tolerance}, actual ${actual}`}`);
}

/** Fonts come off disk here — the same bytes the browser fetches from /fonts. */
const fetchFont = async (url: string) => {
  const buf = readFileSync(`client/public${url}`);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
};

async function importedPdf(pages: number, rotation = 0): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage(IMPORT);
    if (rotation) page.setRotation(degrees(rotation));
    page.drawText(`DESIGN ${i}`, { x: 20, y: 20, size: 8, font, color: rgb(0.8, 0.8, 0.8) });
  }
  return doc.save();
}

async function baseDoc(spec: Array<"real" | "slot">): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  spec.forEach((kind) => doc.addPage(kind === "real" ? A4 : SLOT));
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Every text run on a page, positioned in the frame the reader sees. */
async function visualText(bytes: Uint8Array, pageNumber: number) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), standardFontDataUrl: STANDARD_FONTS }).promise;
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const items = content.items
    .filter((item: any) => typeof item.str === "string" && item.str.trim())
    .map((item: any) => {
      const t = pdfjs.Util.transform(viewport.transform, item.transform);
      return { text: item.str as string, x: t[4] as number, y: t[5] as number };
    });
  await doc.destroy();
  return { items, width: viewport.width, height: viewport.height };
}

/**
 * The vertical metrics of the face one particular run of text was drawn with.
 *
 * Matched by its text rather than by position, because the imported design has
 * its own words on the page — picking "the first run" measured those instead,
 * which is how this helper first reported Helvetica for a box set in Inter.
 */
async function faceMetrics(bytes: Uint8Array, pageNumber: number, contains: string) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), standardFontDataUrl: STANDARD_FONTS }).promise;
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  const item = content.items.find((i: any) => typeof i.str === "string" && i.str.includes(contains)) as any;
  if (!item) throw new Error(`no text run containing ${JSON.stringify(contains)}`);
  const style = (content.styles as Record<string, { ascent: number; descent: number }>)[item.fontName];
  await doc.destroy();
  return style;
}

function box(overrides: Partial<ImportedTextBox> = {}): ImportedTextBox {
  return { ...newTextBox(0), text: "Hello", ...overrides };
}

async function run() {
  /* ── the conversion itself ──────────────────────────────────────────── */

  const upright = visualPage(500, 700, 0);
  check("upright page keeps its size", [upright.width, upright.height], [500, 700]);
  check("upright top-left is the media top-left", upright.toUserSpace(0, 0), { x: 0, y: 700 });
  check("upright text is unrotated", upright.textAngle, 0);

  const quarter = visualPage(500, 700, 90);
  check("a rotated page reports the size the reader sees", [quarter.width, quarter.height], [700, 500]);
  check("rotated visual point maps into user space", quarter.toUserSpace(200, 100), { x: 100, y: 200 });
  check("rotated text is turned to match", quarter.textAngle, 90);

  check("180 maps the corner across", visualPage(500, 700, 180).toUserSpace(0, 0), { x: 500, y: 0 });
  check("270 maps the corner across", visualPage(500, 700, 270).toUserSpace(0, 0), { x: 500, y: 700 });
  check("a nonsense rotation falls back to upright", visualPage(500, 700, 37).textAngle, 0);

  /* ── wrapping ───────────────────────────────────────────────────────── */

  const metricsDoc = await PDFDocument.create();
  const helvetica = await metricsDoc.embedFont(StandardFonts.Helvetica);

  /* Asserted by measurement rather than by a hand-typed expected list: the
     exact break points are the font's business, and writing them out would
     only record whatever the code did on the day. What must hold is that
     every line fits and no word moved. */
  const wrapped = wrapText("one two three four five six", helvetica, 12, 60);
  check("wrapping puts every line inside the width", wrapped.every((l) => helvetica.widthOfTextAtSize(l, 12) <= 60), true);
  check("wrapping keeps the words in order", wrapped.join(" "), "one two three four five six");
  check("wrapping actually breaks the line", wrapped.length > 1, true);
  check("keeps an intentional blank line", wrapText("a\n\nb", helvetica, 12, 200), ["a", "", "b"]);
  const broken = wrapText("Supercalifragilistic", helvetica, 12, 40);
  check("breaks a word too wide to fit", broken.length > 1, true);
  check("loses no characters when breaking", broken.join(""), "Supercalifragilistic");

  /* ── alignment, in the visual frame ─────────────────────────────────── */

  const page = visualPage(500, 700, 0);
  const book = createFontBook(await PDFDocument.create(), fetchFont);
  // weight 600 on a standard family means Helvetica-BOLD, so the assertion has
  // to measure the bold face — the regular one is 1.1pt narrower at 20pt and
  // the "off by a hair" would look like a layout bug rather than a bad test.
  const helveticaBold = await metricsDoc.embedFont(StandardFonts.HelveticaBold);
  const widthOf = (t: string, size: number) => helveticaBold.widthOfTextAtSize(t, size);

  const right = await layoutRichBox(
    box({ text: "Hi", x: 0.1, width: 0.5, align: "right", fontSize: 20, font: "helvetica" }), page, book, (t) => t);
  near("right-aligned text ends at the box edge", right[0].u + widthOf("Hi", 20), (0.1 + 0.5) * 500);

  const centred = await layoutRichBox(
    box({ text: "Hi", x: 0.1, width: 0.5, align: "center", fontSize: 20, font: "helvetica" }), page, book, (t) => t);
  near("centred text is centred in the box", centred[0].u + widthOf("Hi", 20) / 2, (0.1 + 0.25) * 500);

  /* ── rich text ──────────────────────────────────────────────────────── */

  check("plain text still parses as one unstyled run", parseStampHtml("Hello"), [[{ text: "Hello" }]]);

  check("a plain box's newlines survive as separate lines", parseStampHtml("A\nB").length, 2);

  check("bold and italic are read off the markup", parseStampHtml("<p>a<strong>b</strong><em>c</em></p>"),
    [[{ text: "a" }, { text: "b", bold: true }, { text: "c", italic: true }]]);

  check("a run carries its own font and size", parseStampHtml(
    '<p><span style="font-family: Times, serif; font-size: 18pt">Big</span></p>'),
    [[{ text: "Big", font: "times", size: 18 }]]);

  check("px sizes are converted to points, not taken literally", parseStampHtml(
    '<p><span style="font-size: 16px">x</span></p>')[0][0].size, 12);

  check("nesting keeps both marks", parseStampHtml("<p><strong><em>x</em></strong></p>"),
    [[{ text: "x", bold: true, italic: true }]]);

  check("the editor's trailing empty paragraph is not a blank line", parseStampHtml("<p>a</p><p></p>").length, 1);

  /* A PDF has no list element, so a bullet has to become characters. Without
     that an <li> ended its line and added nothing, and a bulleted box read
     correctly in the editor — a contenteditable with real CSS markers — and
     lost every bullet on the page. */
  check("a bulleted list is drawn with its bullets",
    parseStampHtml("<ul><li>one</li><li>two</li></ul>").map((l) => l.map((r) => r.text).join("")),
    ["\u2022  one", "\u2022  two"]);

  check("an ordered list numbers itself",
    parseStampHtml("<ol><li>one</li><li>two</li><li>three</li></ol>").map((l) => l.map((r) => r.text).join("")),
    ["1.  one", "2.  two", "3.  three"]);

  check("a second list starts counting again",
    parseStampHtml("<ol><li>a</li></ol><p>x</p><ol><li>b</li></ol>").map((l) => l.map((r) => r.text).join("")),
    ["1.  a", "x", "1.  b"]);

  // The marker carries the <li>'s style, not the first run's — bolding the
  // words inside an item does not bold its bullet, which is what a reader
  // expects and what the editor shows.
  check("bolding the words in an item leaves its bullet unbolded",
    parseStampHtml("<ul><li><strong>a</strong></li></ul>")[0][0].bold,
    undefined);

  check("a list does not disturb the style stack around it",
    parseStampHtml("<p><strong>a</strong></p><ul><li>b</li></ul><p>c</p>").map((l) => l.map((r) => ({ t: r.text, b: !!r.bold }))),
    [[{ t: "a", b: true }], [{ t: "\u2022  ", b: false }, { t: "b", b: false }], [{ t: "c", b: false }]]);

  check("plain text of rich content reads back in order", stampPlainText(
    '<p>Prepared for <strong>MILLER</strong></p><p>Gerroa</p>'), "Prepared for MILLER\nGerroa");

  await checkAsync("mixed sizes on ONE line share a baseline", async () => {
    const placed = await layoutRichBox(
      box({ html: '<p><span style="font-size: 9pt">Prepared for </span><span style="font-size: 18pt">MILLER</span></p>',
            text: "", x: 0, width: 1, fontSize: 9, font: "helvetica" }),
      page, book, (t) => t);
    return placed.length === 2 && placed[0].v === placed[1].v;
  }, true);

  await checkAsync("a bigger run pushes the NEXT line further down", async () => {
    const small = await layoutRichBox(
      box({ html: "<p>a</p><p>b</p>", text: "", x: 0, width: 1, fontSize: 9, font: "helvetica" }), page, book, (t) => t);
    const big = await layoutRichBox(
      box({ html: '<p><span style="font-size: 24pt">a</span></p><p>b</p>', text: "", x: 0, width: 1, fontSize: 9, font: "helvetica" }),
      page, book, (t) => t);
    return big[1].v > small[1].v;
  }, true);

  await checkAsync("a line wraps when its runs together exceed the width", async () => {
    /* Sized so the small run alone FITS and the pair does not — if wrapping
       measured everything at the box's own 8pt it would never break. */
    const placed = await layoutRichBox(
      box({ html: '<p><span style="font-size: 8pt">tiny tiny tiny </span><span style="font-size: 40pt">ENORMOUS</span></p>',
            text: "", x: 0, width: 0.4, fontSize: 8, font: "helvetica" }),
      page, book, (t) => t);
    const rows = new Set(placed.map((p) => p.v));
    return rows.size > 1;
  }, true);

  await checkAsync("and does NOT wrap when they fit", async () => {
    const placed = await layoutRichBox(
      box({ html: '<p><span style="font-size: 8pt">tiny </span><span style="font-size: 10pt">bit</span></p>',
            text: "", x: 0, width: 0.9, fontSize: 8, font: "helvetica" }),
      page, book, (t) => t);
    return new Set(placed.map((p) => p.v)).size;
  }, 1);

  await checkAsync("words in one style are drawn as ONE run, not one per word", async () => {
    /* Wrapping measures word by word; drawing that way would emit a text
       operator per word and a reader would copy the line in fragments. */
    const placed = await layoutRichBox(
      box({ html: "<p>four separate little words</p>", text: "", x: 0, width: 1, fontSize: 9, font: "helvetica" }),
      page, book, (t) => t);
    return placed.length;
  }, 1);

  await checkAsync("tokens resolve inside a run, not in the markup", async () => {
    const placed = await layoutRichBox(
      box({ html: "<p><strong>{{project.name}}</strong></p>", text: "", x: 0, width: 1, fontSize: 11, font: "helvetica" }),
      page, book, (t) => t.replace("{{project.name}}", "Gerroa Reno"));
    return placed.map((p) => p.text).join(" ");
  }, "Gerroa Reno");

  /* ── line height: the editor and the PDF must agree ────────────────── */

  check("a line's height comes from its LARGEST run, not the box",
    stampLineHeight([{ text: "a", size: 12 }, { text: "b", size: 18 }], 24, 1.25), 18 * 1.25);

  check("a run with no size of its own falls back to the box",
    stampLineHeight([{ text: "a" }], 10, 1.25), 10 * 1.25);

  check("small runs in a big box take the SMALL height",
    /* The reported bug: 12pt runs in a 24pt box were drawn one line apart and
       shown two lines apart, so a box positioned in the editor printed
       somewhere else. */
    stampLineHeight([{ text: "a", size: 12 }], 24, 1.25), 12 * 1.25);

  check("an authored blank line still takes the box's height",
    stampLineHeight([], 11, 1.25), 11 * 1.25);

  await checkAsync("the stamper's baselines step by exactly that height", async () => {
    const b = box({
      html: '<p><span style="font-size: 12pt;">one</span></p><p><span style="font-size: 12pt;">two</span></p>',
      text: "", x: 0, width: 1, fontSize: 24, lineHeight: 1.25, font: "helvetica",
    });
    const placed = await layoutRichBox(b, visualPage(500, 700, 0), book, (t) => t);
    return Math.round((placed[1].v - placed[0].v) * 100) / 100;
  }, 12 * 1.25);

  /* ── end to end, through a real merge ───────────────────────────────── */

  const okFetch = async () => ({ ok: true, arrayBuffer: async () => (await importedPdf(1)).buffer }) as any;
  (globalThis as any).fetch = okFetch;

  let out = await mergeImportedPages(
    await baseDoc(["real", "slot"]),
    [
      {
        objectPath: "/objects/cover",
        fileName: "cover.pdf",
        pageCount: 1,
        textBoxes: [box({ text: "{{project.name}}", x: 0.2, y: 0.3, width: 0.6, fontSize: 30, font: "helvetica" })],
      },
    ],
    { substitute: (t) => t.replace("{{project.name}}", "Bayview Terrace"), fetchFont },
  );

  let found = await visualText(out.bytes, 2);
  const stamped = found.items.find((i) => i.text.includes("Bayview"));
  check("the merge field is substituted, not printed raw", stamped?.text, "Bayview Terrace");
  near("it lands at the fraction across it was dragged to", stamped?.x ?? -1, 0.2 * IMPORT[0]);
  // The baseline sits below the box's top edge by the half-leading plus the
  // ascender — the same rule the editor's CSS line box uses.
  near("it lands at the fraction down it was dragged to", stamped?.y ?? -1, 0.3 * IMPORT[1], 30);
  check("the design underneath survives", found.items.some((i) => i.text.includes("DESIGN 1")), true);

  /* Bullets, all the way to the drawn page.
     The parse tests above prove the marker runs exist; this proves they reach
     the paper. A PDF has no list element, so if the stamper ever stops drawing
     them there is nothing else in the pipeline to notice. */
  (globalThis as any).fetch = okFetch;
  out = await mergeImportedPages(
    await baseDoc(["slot"]),
    [
      {
        objectPath: "/objects/cover",
        pageCount: 1,
        textBoxes: [box({
          text: "Sitework\nFooting",
          html: "<ul><li>Sitework</li><li>Footing</li></ul>",
          x: 0.1, y: 0.1, width: 0.8, fontSize: 12, font: "helvetica",
        })],
      },
    ],
    { fetchFont },
  );
  found = await visualText(out.bytes, 1);
  const bulleted = found.items.map((i) => i.text).join(" ");
  check("a bulleted box prints its bullets", /\u2022\s+Sitework/.test(bulleted), true);
  check("both items keep their bullets", (bulleted.match(/\u2022/g) ?? []).length, 2);

  /* A rotated import: the SAME fractions must produce the same visual place,
     because that is the only promise the editor can make. */
  (globalThis as any).fetch = async () => ({ ok: true, arrayBuffer: async () => (await importedPdf(1, 90)).buffer }) as any;
  out = await mergeImportedPages(
    await baseDoc(["slot"]),
    [
      {
        objectPath: "/objects/cover",
        pageCount: 1,
        textBoxes: [box({ text: "Rotated", x: 0.2, y: 0.3, width: 0.6, fontSize: 30, font: "helvetica" })],
      },
    ],
    { fetchFont },
  );
  found = await visualText(out.bytes, 1);
  const onRotated = found.items.find((i) => i.text.includes("Rotated"));
  check("a rotated page is measured the way it is read", [found.width, found.height], [IMPORT[1], IMPORT[0]]);
  near("the same fraction across, on a rotated page", onRotated?.x ?? -1, 0.2 * IMPORT[1]);
  near("the same fraction down, on a rotated page", onRotated?.y ?? -1, 0.3 * IMPORT[0], 30);

  /* Pages are addressed within the import, not within the proposal. */
  (globalThis as any).fetch = async () => ({ ok: true, arrayBuffer: async () => (await importedPdf(2)).buffer }) as any;
  out = await mergeImportedPages(
    await baseDoc(["real", "slot", "slot"]),
    [
      {
        objectPath: "/objects/brochure",
        pageCount: 2,
        textBoxes: [box({ text: "Second sheet", page: 1, x: 0.1, y: 0.1 })],
      },
    ],
    { fetchFont },
  );
  const first = await visualText(out.bytes, 2);
  const second = await visualText(out.bytes, 3);
  check("nothing lands on the import's first page", first.items.some((i) => i.text.includes("Second")), false);
  check("the box lands on the import's second page", second.items.some((i) => i.text.includes("Second")), true);

  /* Inter is embedded rather than referenced, so a reader with no Inter
     installed still sees Inter. Failing to embed it must not be silent. */
  out = await mergeImportedPages(
    await baseDoc(["slot"]),
    [
      {
        objectPath: "/objects/brochure",
        pageCount: 1,
        textBoxes: [box({ text: "Inter text", font: "inter", weight: 700, italic: true })],
      },
    ],
    { fetchFont },
  );
  check("an Inter box reports no failure", out.failures, []);
  /* Read the FACE back, not the file name. pdf-lib saves through object
     streams, so the font's name is compressed out of the raw bytes — and a
     name would prove nothing anyway. These are Inter's own vertical metrics;
     the standard Helvetica the code falls back to reports 0.905 / -0.212, so
     this fails loudly if the embed silently did not happen. */
  const interStyle = await faceMetrics(out.bytes, 1, "Inter text");
  near("the glyphs come from the embedded Inter face", interStyle.ascent, 0.96875, 0.001);
  near("with Inter's descender", interStyle.descent, -0.2412, 0.001);

  /* An empty box is not an error and must not draw a stray glyph. */
  out = await mergeImportedPages(
    await baseDoc(["slot"]),
    [{ objectPath: "/objects/brochure", pageCount: 1, textBoxes: [box({ text: "   " })] }],
    { fetchFont },
  );
  check("an empty box prints nothing and reports nothing", out.failures, []);

  /* ── reading boxes back out of jsonb ────────────────────────────────── */

  check("a non-array is no boxes at all", normaliseTextBoxes({ x: 1 }), []);
  const repaired = normaliseTextBoxes([
    { id: "a", page: 0, x: 5, y: -2, width: 0, text: "t", fontSize: 0, font: "comic", weight: 900, color: "red", align: "middle", lineHeight: 99 },
  ]);
  check("a box off the page is pulled back on", [repaired[0].x, repaired[0].y], [0.98, 0]);
  check("an unknown font falls back to Inter", repaired[0].font, "inter");
  check("an unknown weight falls back to regular", repaired[0].weight, 400);
  check("an unusable colour falls back to near-black", repaired[0].color, "#111111");
  check("an unknown alignment falls back to left", repaired[0].align, "left");
  check("the builder's text is never dropped", repaired[0].text, "t");

  /* The font book hands back the same object for the same face, so a cover
     with twenty boxes in one weight embeds that weight once. */
  const bookDoc = await PDFDocument.create();
  const cacheBook = createFontBook(bookDoc, fetchFont);
  const [a, b] = await Promise.all([cacheBook.get("inter", 400, false), cacheBook.get("inter", 400, false)]);
  check("a face is embedded once, not per box", a === b, true);
  const c = await cacheBook.get("inter", 700, false);
  check("a different weight is a different face", a === c, false);

  console.log(failed === 0 ? "\nall passed" : `\n${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

void run();
