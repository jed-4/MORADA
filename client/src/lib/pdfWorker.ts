let configured = false;
let configuring: Promise<void> | null = null;

export function ensurePdfWorker(): Promise<void> {
  if (configured) return Promise.resolve();
  if (configuring) return configuring;
  configuring = (async () => {
    const [{ pdfjs }, workerMod] = await Promise.all([
      import("react-pdf"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = (workerMod as unknown as { default: string }).default;
    configured = true;
  })();
  return configuring;
}
