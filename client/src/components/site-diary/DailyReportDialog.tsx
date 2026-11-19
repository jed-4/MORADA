import { lazy, Suspense, useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Download, Eye, Loader2, Mail } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, getApiBaseUrl } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const PdfInlineViewer = lazy(() => import("@/components/PdfInlineViewer"));

interface DailyReportSummary {
  date: string;
  dateLabel: string;
  filename: string;
  counts: { entries: number; photos: number; crew: number; schedule: number; defects: number };
  client: { name: string; email: string | null } | null;
}

/**
 * The daily site report for one project: pick a day, then preview, download
 * or email it to the client.
 *
 * The PDF is rendered by the server (the phone opens the same route), so
 * preview and download are just that URL — no @react-pdf in the browser.
 * Emailing asks the office to confirm the address first: it defaults to the
 * project's client contact but is never sent without a second click.
 */
export function DailyReportDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const base = `/api/projects/${projectId}/daily-report`;
  const { data: summary, isLoading } = useQuery<DailyReportSummary>({
    queryKey: [`${base}/summary?date=${date}`],
    enabled: open && validDate,
  });

  // A new day is a new document: drop the preview and any half-made send.
  useEffect(() => {
    setPreviewing(false);
    setConfirming(false);
  }, [date]);
  useEffect(() => {
    if (!open) {
      setPreviewing(false);
      setConfirming(false);
      setMessage("");
    }
  }, [open]);

  const pdfUrl = `${getApiBaseUrl()}${base}/pdf?date=${date}`;

  const send = useMutation({
    mutationFn: () =>
      apiRequest(`${base}/email`, "POST", {
        date,
        to: to.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean),
        message: message.trim() || undefined,
      }),
    onSuccess: (res: any) => {
      toast({ title: "Daily report sent", description: `To ${(res?.to ?? []).join(", ")}` });
      setConfirming(false);
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Email not sent", description: err?.message ?? "Something went wrong", variant: "destructive" });
    },
  });

  const startEmail = () => {
    setTo(summary?.client?.email ?? "");
    setConfirming(true);
  };

  const c = summary?.counts;
  const nothing = c && !c.entries && !c.crew && !c.schedule && !c.defects && !c.photos;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={previewing ? "max-w-3xl" : "max-w-md"} data-testid="dialog-daily-report">
        <DialogHeader>
          <DialogTitle>Daily report</DialogTitle>
          <DialogDescription>
            A one-page PDF of the day for the client: diary, photos, weather, who was on site (hours only),
            schedule and defects.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="daily-report-date">Day</Label>
            <Input
              id="daily-report-date"
              type="date"
              value={date}
              max={format(new Date(), "yyyy-MM-dd")}
              onChange={(e) => setDate(e.target.value)}
              data-testid="input-daily-report-date"
            />
          </div>

          <div className="text-xs text-muted-foreground min-h-[1.25rem]" data-testid="text-daily-report-summary">
            {isLoading ? (
              <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Checking the day…</span>
            ) : c ? (
              nothing ? (
                "Nothing recorded on this day yet — the report would be empty."
              ) : (
                [
                  `${c.entries} diary ${c.entries === 1 ? "entry" : "entries"}`,
                  `${c.photos} ${c.photos === 1 ? "photo" : "photos"}`,
                  `${c.crew} on site`,
                  `${c.schedule} scheduled`,
                  c.defects ? `${c.defects} ${c.defects === 1 ? "defect" : "defects"}` : null,
                ].filter(Boolean).join(" · ")
              )
            ) : null}
          </div>

          {previewing && validDate && (
            <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading PDF…</div>}>
              <PdfInlineViewer url={pdfUrl} />
            </Suspense>
          )}

          {confirming && (
            <div className="space-y-2 rounded-md border p-3" data-testid="panel-daily-report-email">
              <div className="space-y-1">
                <Label htmlFor="daily-report-to">Send to</Label>
                <Input
                  id="daily-report-to"
                  type="text"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="client@example.com"
                  data-testid="input-daily-report-to"
                />
                <p className="text-[11px] text-muted-foreground">
                  {summary?.client
                    ? summary.client.email
                      ? `The project's client is ${summary.client.name}. Check the address before sending.`
                      : `${summary.client.name} has no email address on their contact.`
                    : "This project has no client contact — enter the address."}
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="daily-report-message">Message (optional)</Label>
                <Textarea
                  id="daily-report-message"
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={`Attached is the daily site report for ${summary?.dateLabel ?? "the day"}.`}
                  data-testid="input-daily-report-message"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {confirming ? (
            <>
              <Button variant="outline" onClick={() => setConfirming(false)} disabled={send.isPending}>
                Back
              </Button>
              <Button
                onClick={() => send.mutate()}
                disabled={send.isPending || !to.trim()}
                data-testid="button-daily-report-send"
              >
                {send.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Mail className="w-4 h-4 mr-1" />}
                {send.isPending ? "Sending…" : "Send"}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setPreviewing((p) => !p)}
                disabled={!validDate}
                data-testid="button-daily-report-preview"
              >
                <Eye className="w-4 h-4 mr-1" />
                {previewing ? "Hide preview" : "Preview"}
              </Button>
              <Button variant="outline" asChild disabled={!validDate} data-testid="button-daily-report-download">
                <a href={`${pdfUrl}&download=1`} download={summary?.filename}>
                  <Download className="w-4 h-4 mr-1" />
                  Download
                </a>
              </Button>
              <Button onClick={startEmail} disabled={!validDate || isLoading} data-testid="button-daily-report-email">
                <Mail className="w-4 h-4 mr-1" />
                Email to client
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
