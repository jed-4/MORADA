// Handover defects list PDF (Defects v2 stage 3). Rendered in the browser
// with @react-pdf like every other document in the app. Used by the office
// (Defects → Handover) and by the client portal's Handover page — the server
// shapes the list for whoever asks (clients never get trade names).

import { useCallback, useState } from "react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import type { HandoverSignoffView } from "@shared/defectTrades";
import type { DefectStage } from "@shared/defects";
import { getApiBaseUrl } from "@shared/api";

export interface HandoverListResponse {
  project: { id: string; name: string; address: string | null };
  branding: {
    companyName: string | null;
    logoUrl: string | null;
    brandColor: string | null;
    documentStyle: string;
    abn: string | null;
    phone: string | null;
    email: string | null;
  };
  jobStages: string[];
  shareWithClient: boolean;
  defects: Array<{
    id: string;
    ref: string;
    title: string;
    description: string | null;
    location: string | null;
    jobStage: string;
    stage: DefectStage;
    priority: string;
    trade: string | null;
    dueDate: string | null;
    closedAt: string | null;
    before: string[];
    after: string[];
  }>;
  counts: { total: number; closed: number; open: number };
  signoffs: HandoverSignoffView[];
}

export function handoverUrl(projectId: string, jobStages: string[]) {
  const qs = jobStages.length ? `?jobStages=${encodeURIComponent(jobStages.join(","))}` : "";
  return `/api/projects/${projectId}/handover${qs}`;
}

/** A photo shrunk to a small JPEG square for the PDF. Null if it won't load. */
async function thumbnail(url: string, size = 160): Promise<string | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}${url}`, { credentials: "include" });
    if (!res.ok) return null;
    const bitmap = await createImageBitmap(await res.blob());
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
    bitmap.close?.();
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch {
    return null;
  }
}

export function useHandoverPdfExport() {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);

  const exportPdf = useCallback(
    async (projectId: string, jobStages: string[]) => {
      if (isExporting) return;
      setIsExporting(true);
      try {
        const res = await fetch(`${getApiBaseUrl()}${handoverUrl(projectId, jobStages)}`, { credentials: "include" });
        const list = (await res.json().catch(() => ({}))) as HandoverListResponse & { error?: string };
        if (!res.ok) throw new Error(list.error || "Couldn't load the handover list");

        const [{ pdf }, { HandoverPdfDocument }] = await Promise.all([
          import("@react-pdf/renderer"),
          import("./pdf/HandoverPdfDocument"),
        ]);
        const urls = Array.from(new Set(list.defects.flatMap((d) => [...d.before, ...d.after])));
        const images: Record<string, string> = {};
        // A few at a time: a big list is dozens of photos.
        for (let i = 0; i < urls.length; i += 6) {
          await Promise.all(urls.slice(i, i + 6).map(async (u) => {
            const uri = await thumbnail(u);
            if (uri) images[u] = uri;
          }));
        }
        const rawLogo = list.branding.logoUrl;
        const blob = await pdf(
          HandoverPdfDocument({
            projectName: list.project.name,
            projectAddress: list.project.address,
            companyName: list.branding.companyName,
            logoUrl: rawLogo ? (rawLogo.startsWith("http") ? rawLogo : `${window.location.origin}${rawLogo}`) : null,
            brandColor: list.branding.brandColor || "#87749A",
            documentStyle: list.branding.documentStyle === "style2" ? "style2" : "style1",
            phone: list.branding.phone,
            email: list.branding.email,
            abn: list.branding.abn,
            jobStages: list.jobStages,
            defects: list.defects,
            images,
            signoff: list.signoffs[0] ?? null,
            generatedOn: format(new Date(), "d MMMM yyyy"),
          }),
        ).toBlob();

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `handover-defects-${list.project.name}-${format(new Date(), "yyyy-MM-dd")}.pdf`
          .replace(/[\\/:*?"<>|]+/g, "-")
          .replace(/\s+/g, "-")
          .toLowerCase();
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (error: any) {
        console.error("Handover PDF export failed:", error);
        toast({ title: "Couldn't export the PDF", description: error?.message || "Please try again.", variant: "destructive" });
      } finally {
        setIsExporting(false);
      }
    },
    [isExporting, toast],
  );

  return { exportPdf, isExporting };
}
