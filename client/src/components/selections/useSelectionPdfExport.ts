// Shared PDF export for the Selections surfaces (list, detail, quick-view drawer).
//
// Rendered in the browser with @react-pdf, like every other document in the
// app. It used to be rendered on the server with puppeteer, which needs a
// Chromium the Replit deployment doesn't have — so in production the export
// failed every time.
//
// The document is CLIENT-SAFE whoever exports it (hidden options left out,
// prices only where the client may see them, no cost, no notes) — see
// shared/selectionsPdfModel.ts.

import { useCallback, useState } from "react";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { buildSelectionsPdfModel } from "@shared/selectionsPdfModel";

export type SelectionPdfTarget =
  | { projectId: string; filename: string }
  | { selectionId: string; filename: string };

async function loadBranding() {
  const [settings, company] = await Promise.all([
    apiRequest("/api/company-settings", "GET").catch(() => null),
    apiRequest("/api/company", "GET").catch(() => null),
  ]);
  const rawLogo: string | undefined = settings?.logoUrl || undefined;
  return {
    brandColor: (settings?.brandColor as string | undefined) || "#87749A",
    documentStyle: ((settings?.documentStyle as "style1" | "style2" | undefined) || "style1"),
    logoUrl: rawLogo ? (rawLogo.startsWith("http") ? rawLogo : `${window.location.origin}${rawLogo}`) : null,
    companyName: (company?.nickname || company?.name || null) as string | null,
  };
}

export function useSelectionPdfExport() {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);

  const exportPdf = useCallback(
    async (target: SelectionPdfTarget) => {
      if (isExporting) return;
      setIsExporting(true);
      try {
        const selections: any[] = "projectId" in target
          ? await apiRequest(`/api/selections/with-options?projectId=${encodeURIComponent(target.projectId)}`, "GET")
          : [await apiRequest(`/api/selections/${encodeURIComponent(target.selectionId)}`, "GET")];
        const projectId = "projectId" in target ? target.projectId : selections[0]?.projectId;

        const [branding, project, { pdf }, { SelectionsPdfDocument }, { cropImageForPdf }] = await Promise.all([
          loadBranding(),
          projectId ? apiRequest(`/api/projects/${projectId}`, "GET").catch(() => null) : Promise.resolve(null),
          import("@react-pdf/renderer"),
          import("./pdf/SelectionsPdfDocument"),
          import("./pdf/cropImageForPdf"),
        ]);

        const model = buildSelectionsPdfModel(selections);
        const refs = new Map<string, any>();
        for (const room of model.rooms)
          for (const sel of room.selections)
            for (const o of sel.options) if (o.image) refs.set(o.image.filePath, o.image);
        const images: Record<string, string> = {};
        await Promise.all(
          Array.from(refs.values()).map(async (ref) => {
            const uri = await cropImageForPdf(ref);
            if (uri) images[ref.filePath] = uri;
          }),
        );

        const blob = await pdf(
          SelectionsPdfDocument({
            model,
            images,
            projectName: project?.name ?? null,
            companyName: branding.companyName,
            logoUrl: branding.logoUrl,
            brandColor: branding.brandColor,
            documentStyle: branding.documentStyle,
            generatedOn: format(new Date(), "d MMMM yyyy"),
          }),
        ).toBlob();

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = target.filename.replace(/[\\/:*?"<>|]+/g, "-");
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (error: any) {
        console.error("Selections PDF export failed:", error);
        toast({
          title: "Couldn't export the PDF",
          description: String(error?.message || "").replace(/^\d+:\s*/, "") || "Please try again.",
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
