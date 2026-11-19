import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { format } from "date-fns";
import { Download, FileSignature, Loader2, ClipboardCheck, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/EmptyState";
import { ClientListPage, ClientGroupHeader } from "@/components/client/ClientListPage";
import { usePermission } from "@/hooks/use-permission";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { PORTAL_KEYS } from "@shared/clientPortalPermissions";
import { DEFECT_STAGE_LABELS } from "@shared/defects";
import { useHandoverPdfExport, handoverUrl, type HandoverListResponse } from "@/components/defects/useHandoverPdfExport";

/**
 * The client's read-only "Handover defects" page (Defects v2 stage 3).
 *
 * Shown only when the builder switches on "Share handover list with client"
 * for the project — the server refuses otherwise, and leaves trade names and
 * money out of what a client receives. A client with sign-off permission can
 * sign the list as it stands (typed name, like signing a variation).
 */
export default function ClientHandover() {
  const { projectId } = useParams<{ projectId: string }>();
  const { toast } = useToast();
  const canSign = usePermission(PORTAL_KEYS.handover, "approve");
  const { exportPdf, isExporting } = useHandoverPdfExport();
  const url = handoverUrl(projectId ?? "", []);
  const { data, isLoading, error } = useQuery<HandoverListResponse>({
    queryKey: [url],
    enabled: !!projectId,
    retry: false,
  });
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);

  const sign = useMutation({
    mutationFn: () => apiRequest(`/api/projects/${projectId}/handover/signoff`, "POST", { name: name.trim(), agree: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [url] });
      setName("");
      setAgree(false);
      toast({ title: "Signed off — thank you" });
    },
    onError: (e: any) => toast({ title: "Couldn't sign off", description: e?.payload?.error || e?.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="Handover list not shared yet"
        description="When your builder is ready for handover, the list of defects will show up here."
        variant="inline"
        className="py-16"
      />
    );
  }

  const latest = data.signoffs[0];
  return (
    <ClientListPage
      title="Handover defects"
      chips={[
        { label: `${data.counts.total} item${data.counts.total === 1 ? "" : "s"}` },
        ...(data.counts.open ? [{ label: `${data.counts.open} still open`, tone: "alert" as const }] : []),
      ]}
      controls={
        <Button size="sm" variant="outline" className="gap-1.5" disabled={isExporting} onClick={() => exportPdf(projectId!, data.jobStages)} data-testid="client-handover-pdf">
          <Download className="h-4 w-4" /> {isExporting ? "Building…" : "PDF"}
        </Button>
      }
    >
      {data.defects.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No handover defects" description="Nothing has been listed yet." variant="inline" className="py-16" />
      ) : (
        data.defects.map((d) => (
          <div key={d.id} className="px-4 py-3 border-b last:border-b-0 space-y-2" data-testid={`client-handover-${d.id}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground font-semibold">{d.ref}</div>
                <div className="font-medium">{d.title}</div>
                {d.location && <div className="text-sm text-muted-foreground flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{d.location}</div>}
              </div>
              <div className="text-right text-sm shrink-0">
                <div className={d.stage === "closed" ? "text-[hsl(var(--sage))] font-medium" : "text-muted-foreground"}>
                  {d.stage === "closed" ? "Closed" : DEFECT_STAGE_LABELS[d.stage] ?? d.stage}
                </div>
                {d.closedAt && <div className="text-xs text-muted-foreground">{format(new Date(d.closedAt), "d MMM yyyy")}</div>}
              </div>
            </div>
            {(d.before.length > 0 || d.after.length > 0) && (
              <div className="flex gap-2 overflow-x-auto">
                {d.before.map((u) => <img key={u} src={u} alt="Before" loading="lazy" className="h-20 w-20 rounded-md border object-cover" />)}
                {d.after.map((u) => <img key={u} src={u} alt="After" loading="lazy" className="h-20 w-20 rounded-md border-2 border-[hsl(var(--sage))] object-cover" />)}
              </div>
            )}
          </div>
        ))
      )}

      <div className="px-4 py-4 border-t">
        <ClientGroupHeader title="Sign-off" />
        {latest ? (
          <p className="text-sm flex items-center gap-1.5 mt-2" data-testid="client-handover-signed">
            <FileSignature className="h-4 w-4 text-[hsl(var(--sage))]" />
            Signed by {latest.signerName} on {format(new Date(latest.signedAt), "d MMM yyyy, h:mma")}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground mt-2">Not signed off yet.</p>
        )}
        {canSign && data.defects.length > 0 && (
          <div className="mt-3 space-y-2 max-w-md">
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <Checkbox checked={agree} onCheckedChange={(v) => setAgree(!!v)} className="mt-0.5" data-testid="client-handover-agree" />
              I've reviewed the handover list above{data.counts.open ? ` (${data.counts.open} still open)` : ""} and sign it off as it stands.
            </label>
            <div className="flex gap-2">
              <Input placeholder="Type your full name" value={name} onChange={(e) => setName(e.target.value)} data-testid="client-handover-name" />
              <Button disabled={!agree || name.trim().length < 2 || sign.isPending} onClick={() => sign.mutate()} data-testid="client-handover-sign">
                {sign.isPending ? "Signing…" : "Sign off"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </ClientListPage>
  );
}
