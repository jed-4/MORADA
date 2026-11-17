const RELOAD_GUARD_KEY = "buildpro:chunk-reload-at";
const RELOAD_GUARD_WINDOW_MS = 10000;

export function isDynamicImportError(error: unknown): boolean {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : (error as { message?: unknown })?.message;
  if (typeof message !== "string") return false;
  const m = message.toLowerCase();
  return (
    m.includes("failed to fetch dynamically imported module") ||
    m.includes("error loading dynamically imported module") ||
    m.includes("importing a module script failed") ||
    m.includes("failed to load module script") ||
    m.includes("loading chunk") ||
    m.includes("loading css chunk") ||
    m.includes("chunkloaderror")
  );
}

export function attemptChunkReload(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || "0");
    if (Date.now() - last < RELOAD_GUARD_WINDOW_MS) {
      return false;
    }
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
  }
  window.location.reload();
  return true;
}

export function installChunkReloadHandlers(): void {
  // Don't preventDefault(): that makes Vite RESOLVE the dynamic import with
  // `undefined`, so React.lazy then crashes reading `.default` ("Cannot read
  // properties of undefined (reading 'default')" — the Sentry issue seen after
  // deploys) and, when the 10s guard blocks the reload, the user is stuck on
  // "Something went wrong". Letting the import REJECT hands the real
  // "Failed to fetch dynamically imported module" error to the error
  // boundaries, which already show "Updating Morada…" and reload.
  window.addEventListener("vite:preloadError", () => {
    attemptChunkReload();
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (isDynamicImportError(event.reason)) {
      attemptChunkReload();
    }
  });
}
