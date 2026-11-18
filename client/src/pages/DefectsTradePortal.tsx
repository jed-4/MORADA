import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { format } from "date-fns";
import { AlertTriangle, Camera, CheckCircle2, Loader2, MapPin, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { PortalLoading, PortalError } from "@/components/portal/PortalStateBoundary";
import type { TradePortalView } from "@shared/defectTrades";
import { getApiBaseUrl } from "@shared/api";

/**
 * A trade's private defects page (Defects v2 stage 2): /portal/defects/:token.
 * One link per trade per job, no sign-in. Lists only this trade's defects —
 * with photos, location, due date and priority — and lets them Accept and
 * Mark as fixed (with an optional photo). No money, no other trades.
 */

type PortalDefect = TradePortalView["defects"][number];

const STAGE_TEXT: Record<string, string> = {
  sent: "New — please accept",
  accepted: "Accepted — in progress",
  rejected: "Sent back — please fix again",
  fixed: "Marked fixed — builder to check",
};

const api = (path: string) => `${getApiBaseUrl()}${path}`;

/** Shrink a phone photo to a reasonable JPEG data URL (long side ≤ 1600px). */
async function photoToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", 0.82);
}

export default function DefectsTradePortal() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<TradePortalView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch(api(`/api/portal/defects/${token}`))
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) setError(body.error || "This link isn't working");
        else setData(body);
      })
      .catch(() => setError("Couldn't reach the server — check your signal and try again"))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <PortalLoading message="Loading your defects…" />;
  if (error) return <PortalError title="Can't open this link" description={error} />;
  if (!data) return null;

  const todo = data.defects.filter((d) => d.stage !== "fixed");
  const waiting = data.defects.filter((d) => d.stage === "fixed");

  return (
    <PortalLayout
      title={data.projectName ? `Defects — ${data.projectName}` : "Your defects"}
      subtitle={[data.companyName, data.tradeName].filter(Boolean).join(" · ")}
      maxWidth="max-w-2xl"
      footerNote="This page is just for you — it only shows your defects on this job."
    >
      <div className="space-y-4">
        {data.projectAddress && (
          <div className="text-sm text-muted-foreground flex items-center gap-1.5">
            <MapPin className="h-4 w-4" /> {data.projectAddress}
          </div>
        )}
        {data.defects.length === 0 && (
          <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Nothing to do here right now. Thanks!</CardContent></Card>
        )}
        {todo.map((d) => (
          <DefectCard key={d.id} token={token!} defect={d} onUpdated={setData} />
        ))}
        {waiting.length > 0 && (
          <div className="pt-2 space-y-3">
            <div className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">Waiting on the builder's check</div>
            {waiting.map((d) => (
              <DefectCard key={d.id} token={token!} defect={d} onUpdated={setData} />
            ))}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}

function DefectCard({
  token,
  defect: d,
  onUpdated,
}: {
  token: string;
  defect: PortalDefect;
  onUpdated: (v: TradePortalView) => void;
}) {
  const [busy, setBusy] = useState<null | "accept" | "fixed">(null);
  const [err, setErr] = useState<string | null>(null);
  const [fixing, setFixing] = useState(false);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<{ dataUrl: string; name: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const act = async (action: "accept" | "fixed") => {
    setErr(null);
    setBusy(action);
    try {
      const res = await fetch(api(`/api/portal/defects/${token}/defects/${d.id}/action`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          note: action === "fixed" ? note.trim() || undefined : undefined,
          photo: action === "fixed" ? photo?.dataUrl : undefined,
          photoName: action === "fixed" ? photo?.name : undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "That didn't work — try again");
      onUpdated(body);
      setFixing(false);
      setPhoto(null);
      setNote("");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    try {
      setPhoto({ dataUrl: await photoToDataUrl(file), name: file.name || "photo.jpg" });
    } catch {
      setErr("Couldn't read that photo");
    }
  };

  const canAccept = d.stage === "sent" || d.stage === "rejected";
  const canFix = d.stage === "sent" || d.stage === "accepted" || d.stage === "rejected";
  const priorityHigh = d.priority === "critical" || d.priority === "high";

  return (
    <Card data-testid={`trade-defect-${d.id}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground font-semibold">{d.ref}</div>
            <div className="font-semibold leading-snug">{d.title}</div>
            {d.location && <div className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin className="h-3.5 w-3.5" />{d.location}</div>}
          </div>
          <div className="text-right shrink-0 space-y-1">
            {priorityHigh && (
              <div className="inline-flex items-center rounded text-[11px] font-semibold px-1.5 py-0.5 bg-[hsl(var(--coral-light))] text-[hsl(var(--coral))] capitalize">
                {d.priority}
              </div>
            )}
            {d.dueDate && (
              <div className={`text-xs ${d.overdue ? "text-[hsl(var(--coral))] font-semibold" : "text-muted-foreground"}`}>
                {d.overdue && <AlertTriangle className="inline h-3 w-3 mr-0.5" />}
                Due {format(new Date(d.dueDate), "d MMM")}
              </div>
            )}
          </div>
        </div>

        {d.description && <p className="text-sm whitespace-pre-line">{d.description}</p>}

        {d.photos.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {d.photos.map((p) => (
              <a key={p.url} href={api(p.url)} target="_blank" rel="noreferrer" className="shrink-0">
                <img src={api(p.url)} alt={p.name || "Defect photo"} className="h-24 w-24 rounded-md object-cover border border-border" loading="lazy" />
              </a>
            ))}
          </div>
        )}

        {d.rejectedNote && (
          <div className="text-sm rounded-md bg-[hsl(var(--coral-light))] p-2.5">
            <span className="font-semibold">Sent back: </span>{d.rejectedNote}
          </div>
        )}

        <div className="text-xs font-medium text-muted-foreground">{STAGE_TEXT[d.stage] ?? d.stage}</div>

        {fixing && (
          <div className="space-y-2 rounded-md border border-border p-3">
            <Textarea rows={2} placeholder="Anything the builder should know? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            {photo ? (
              <div className="flex items-center gap-2">
                <img src={photo.dataUrl} alt="Your photo" className="h-16 w-16 rounded object-cover" />
                <Button size="sm" variant="ghost" onClick={() => setPhoto(null)}>Remove</Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => fileRef.current?.click()}>
                <Camera className="h-4 w-4" /> Add a photo (optional)
              </Button>
            )}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setFixing(false)}>Cancel</Button>
              <Button size="sm" className="gap-1.5" disabled={!!busy} onClick={() => act("fixed")} data-testid={`trade-confirm-fixed-${d.id}`}>
                {busy === "fixed" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
                It's fixed
              </Button>
            </div>
          </div>
        )}

        {err && <div className="text-sm text-destructive">{err}</div>}

        {!fixing && (canAccept || canFix) && (
          <div className="flex gap-2">
            {canAccept && (
              <Button variant="outline" className="flex-1 gap-1.5" disabled={!!busy} onClick={() => act("accept")} data-testid={`trade-accept-${d.id}`}>
                {busy === "accept" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Accept
              </Button>
            )}
            {canFix && (
              <Button className="flex-1 gap-1.5" disabled={!!busy} onClick={() => setFixing(true)} data-testid={`trade-fixed-${d.id}`}>
                <Wrench className="h-4 w-4" /> Mark as fixed
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
