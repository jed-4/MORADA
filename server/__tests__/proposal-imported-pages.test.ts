/**
 * Splice arithmetic for imported PDF pages.
 *
 * Run:
 *   npx tsx --tsconfig tsconfig.test.json server/__tests__/proposal-imported-pages.test.ts
 *
 * Worth having as a test rather than an eyeball: the failure modes are all
 * off-by-one, and an off-by-one here means a client receives a proposal with
 * somebody's brochure in the middle of the payment schedule — or a page
 * missing. Two of the three bugs this caught were invisible in the preview.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { mergeImportedPages } from "../../client/src/components/proposals/pdf/mergeImportedPages";

const A4: [number, number] = [595.28, 841.89];
const IMPORT: [number, number] = [500, 700];
const SLOT: [number, number] = [10, 10];

let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : `\n       expected ${JSON.stringify(expected)}\n       actual   ${JSON.stringify(actual)}`}`);
}

/** A stand-in for a Canva export, at a size the real pages never use. */
async function importedPdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage(IMPORT);
    page.drawText(`IMPORTED ${i}`, { x: 40, y: 600, size: 28, font, color: rgb(0, 0, 0) });
  }
  return doc.save();
}

/** A rendered proposal: real pages, with reserved slots where imports go. */
async function baseDoc(spec: Array<"real" | "slot">): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  spec.forEach((kind, i) => {
    const page = doc.addPage(kind === "real" ? A4 : SLOT);
    if (kind === "real") page.drawText(`REAL ${i}`, { x: 40, y: 700, size: 20, font });
  });
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function widthsOf(bytes: Uint8Array): Promise<number[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((p) => Math.round(p.getWidth()));
}

async function run() {
  const twoPageImport = await importedPdf(2);
  const okFetch = async () =>
    ({ ok: true, arrayBuffer: async () => twoPageImport.buffer.slice(twoPageImport.byteOffset, twoPageImport.byteOffset + twoPageImport.byteLength) }) as any;

  // --- lands in its reserved slots, mid-document
  (globalThis as any).fetch = okFetch;
  let out = await mergeImportedPages(
    await baseDoc(["real", "real", "slot", "slot", "real"]),
    [{ objectPath: "/objects/a", fileName: "brochure.pdf", pageCount: 2 }],
  );
  check("mid-document splice keeps order", await widthsOf(out.bytes), [595, 595, 500, 500, 595]);
  check("mid-document splice reports no failure", out.failures, []);

  // --- first page of the document
  out = await mergeImportedPages(
    await baseDoc(["slot", "slot", "real"]),
    [{ objectPath: "/objects/a", fileName: "cover.pdf", pageCount: 2 }],
  );
  check("import at the very front", await widthsOf(out.bytes), [500, 500, 595]);

  // --- two separate imports, each with its own slots
  const onePageImport = await importedPdf(1);
  let call = 0;
  (globalThis as any).fetch = async () => {
    const src = call++ === 0 ? twoPageImport : onePageImport;
    return { ok: true, arrayBuffer: async () => src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength) } as any;
  };
  out = await mergeImportedPages(
    await baseDoc(["real", "slot", "slot", "real", "slot", "real"]),
    [
      { objectPath: "/objects/a", fileName: "a.pdf", pageCount: 2 },
      { objectPath: "/objects/b", fileName: "b.pdf", pageCount: 1 },
    ],
  );
  check("two imports land in their own slots", await widthsOf(out.bytes), [595, 500, 500, 595, 500, 595]);

  // --- the file is gone: the rest of the document must survive intact
  (globalThis as any).fetch = async () => ({ ok: false, status: 404 }) as any;
  out = await mergeImportedPages(
    await baseDoc(["real", "slot", "slot", "real"]),
    [{ objectPath: "/objects/missing", fileName: "gone.pdf", pageCount: 2 }],
  );
  check("missing file drops its slots only", await widthsOf(out.bytes), [595, 595]);
  check("missing file is named", out.failures, ["gone.pdf"]);

  // --- a slot nobody claimed is never printed
  (globalThis as any).fetch = okFetch;
  out = await mergeImportedPages(await baseDoc(["real", "slot", "real"]), []);
  check("unclaimed slot is dropped", await widthsOf(out.bytes), [595, 595]);

  console.log(failed === 0 ? "\nall passed" : `\n${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

void run();
