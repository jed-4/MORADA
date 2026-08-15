// Shared PDF export for the Selections surfaces (list, detail, quick-view drawer).
//
// These three exports were bare `window.open("/api/...")` calls: no loading state, no
// error handling, and a relative URL that never resolves under the Capacitor build.
// A failed export just opened a blank tab. This fetches the PDF properly so a failure
// is visible, and routes through getApiBaseUrl() so mobile hits the right origin.

import { useCallback, useState } from "react";
import { getApiBaseUrl } from "@shared/api";
import { useToast } from "@/hooks/use-toast";

// Server sets a good filename via Content-Disposition; fall back if it's absent.
function filenameFromResponse(res: Response, fallback: string): string {
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  if (!match) return fallback;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

async function errorMessageFromResponse(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  if (text) {
    try {
      const payload = JSON.parse(text);
      if (payload && typeof payload === "object") {
        if (typeof payload.error === "string") return payload.error;
        if (typeof payload.message === "string") return payload.message;
      }
    } catch {
      // Not JSON — likely an HTML error page. Don't surface markup in a toast.
    }
  }
  return res.status === 404
    ? "That selection could not be found."
    : "The server could not generate the PDF. Please try again.";
}

export function useSelectionPdfExport() {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);

  const exportPdf = useCallback(
    async (path: string, fallbackFilename: string) => {
      if (isExporting) return;
      setIsExporting(true);
      try {
        const res = await fetch(`${getApiBaseUrl()}${path}`, { credentials: "include" });
        if (!res.ok) throw new Error(await errorMessageFromResponse(res));

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filenameFromResponse(res, fallbackFilename);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (error: any) {
        console.error("Selection PDF export error:", error);
        toast({
          title: "Failed to export PDF",
          description: error?.message ?? "Something went wrong. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsExporting(false);
      }
    },
    [isExporting, toast],
  );

  return { exportPdf, isExporting };
}
