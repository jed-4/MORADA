import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Download, FileSignature } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DEFECT_JOB_STAGES, DEFECT_JOB_STAGE_LABELS } from "@shared/defects";
import { HANDOVER_DEFAULT_JOB_STAGES } from "@shared/defectTrades";
import { useHandoverPdfExport, handoverUrl, type HandoverListResponse } from "./useHandoverPdfExport";

/**
 * Handover (Defects v2 stage 3) for the office: pick the job stages, download
 * the handover list PDF, share it with the client, and see their sign-offs.
 */
export function DefectHandoverDialog({
  projectId,
  open,
  onOpenChange,
  canEdit,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const [stages, setStages] = useState<string[]>([...HANDOVER_DEFAULT_JOB_STAGES]);
  const { exportPdf, isExporting } = useHandoverPdfExport();
  const url = handoverUrl(projectId, stages);
  const { data, isLoading } = useQuery<HandoverListResponse>({ queryKey: [url], enabled: open });

  const share = useMutation({
    mutationFn: (shareWithClient: boolean) => apiRequest(`/api/projects/${projectId}/handover/settings`, "PATCH", { shareWithClient }),
    onSuccess: (_r, v) => {
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? "").startsWith(`/api/projects/${projectId}/handover`) });
      toast({ title: v ? "Shared with the client" : "No longer shared with the client" });
    },
    onError: (e: any) => toast({ title: "Couldn't save", description: e?.payload?.error || e?.message, variant: "destructive" }),
  });

  const toggle = (s: string) =>
    setStages((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Handover list</DialogTitle>
          <DialogDescription>
            Every defect in the chosen job stages, with before and after photos, status and closed date.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Job stages</div>
            <div className="flex flex-wrap gap-1.5">
              {DEFECT_JOB_STAGES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggle(s)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${stages.includes(s) ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover-elevate"}`}
                  data-testid={`handover-stage-${s}`}
                >
                  {DEFECT_JOB_STAGE_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          <div className="text-sm" data-testid="handover-counts">
            {isLoading || !data
              ? "Loading…"
              : `${data.counts.total} defect${data.counts.total === 1 ? "" : "s"} · ${data.counts.closed} closed · ${data.counts.open} still open`}
          </div>

          {canEdit && (
            <label className="flex items-center justify-between gap-3 rounded-md border border-border p-3 cursor-pointer" data-testid="handover-share">
              <div>
                <div className="text-sm font-medium">Share handover list with client</div>
                <div className="text-[11px] text-muted-foreground">
                  Their portal shows the list (no trade names, no money) and lets them sign it off.
                </div>
              </div>
              <Switch
                checked={!!data?.shareWithClient}
                disabled={!data || share.isPending}
                onCheckedChange={(v) => share.mutate(v)}
              />
            </label>
          )}

          <div className="space-y-1.5">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Client sign-offs</div>
            {!data?.signoffs.length ? (
              <div className="text-xs text-muted-foreground">Not signed yet.</div>
            ) : (
              <ul className="text-xs space-y-1">
                {data.signoffs.map((s) => (
                  <li key={s.id} className="flex items-center gap-1.5">
                    <FileSignature className="h-3.5 w-3.5 text-[hsl(var(--sage))]" />
                    <span className="font-medium">{s.signerName}</span>
                    <span className="text-muted-foreground">
                      {format(new Date(s.signedAt), "d MMM yyyy, h:mma")} · {s.defectCount} defects, {s.openCount} open
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => exportPdf(projectId, stages)}
              disabled={isExporting || !stages.length}
              className="gap-1.5"
              data-testid="handover-download"
            >
              <Download className="h-4 w-4" />
              {isExporting ? "Building PDF…" : "Download PDF"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
