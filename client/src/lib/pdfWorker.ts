import { useEffect, useState } from "react";

/**
 * pdf.js needs its worker script registered before any <Document> starts
 * loading. Registering it means two dynamic imports, so it cannot happen
 * synchronously during a render.
 *
 * Every viewer in the app used to call ensurePdfWorker() bare in its render
 * body and immediately render <Document> in the same pass. Nothing waited, so
 * whether workerSrc was set in time was a race. Lose it and pdf.js falls back
 * to its "fake worker", which tries to resolve the bare specifier
 * 'pdf.worker.mjs' — impossible under a bundler — and the viewer dies with a
 * minified "<x> is not a function" from inside the pdf.js chunk.
 *
 * That is why the failure looked random and why reloading "fixed" it: the
 * second visit finds the modules already in the cache and wins the race. The
 * minified name differs between builds (EO in dev, AU in prod) because it
 * comes from the bundled dependency, not from our code.
 *
 * usePdfWorkerReady() is the fix: components wait for 'ready' before rendering
 * a document. The promise is shared and memoised, so the modules load once no
 * matter how many viewers mount.
 */

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
  // A failed attempt must not be cached as "in progress" forever, or every
  // later viewer waits on a promise that will never resolve.
  configuring.catch(() => { configuring = null; });
  return configuring;
}

export type PdfWorkerState = "loading" | "ready" | "error";

/** Gate a pdf.js viewer on the worker being registered. */
export function usePdfWorkerReady(): PdfWorkerState {
  const [state, setState] = useState<PdfWorkerState>(() => (configured ? "ready" : "loading"));

  useEffect(() => {
    if (configured) {
      setState("ready");
      return;
    }
    let cancelled = false;
    ensurePdfWorker().then(
      () => { if (!cancelled) setState("ready"); },
      (err) => {
        console.error("[pdfWorker] failed to register the pdf.js worker", err);
        if (!cancelled) setState("error");
      },
    );
    return () => { cancelled = true; };
  }, []);

  return state;
}
