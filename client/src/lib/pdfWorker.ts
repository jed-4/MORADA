import { pdfjs } from "react-pdf";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

let configured = false;

export function ensurePdfWorker() {
  if (configured) return;
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  configured = true;
}
