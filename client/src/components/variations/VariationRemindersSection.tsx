import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AlertTriangle, Check, Clock, Loader2, Mail, Send, Settings2 } from "lucide-react";
import { format } from "date-fns";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { DocumentSection } from "@/components/detail/DocumentSection";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { describeVariationTrigger, variationReminderDueAt } from "@shared/variationReminders";
import type { VariationReminderTemplate, VariationReminderLogEntry } from "@shared/schema";

/**
 * "Client Reminders" on a variation: the switch that turns chasing on for this
 * one (off by default), which steps will go and when, and what already went.
 * The steps themselves are edited in Settings → Variation Reminders.
 */
export function VariationRemindersSection({
  variationId,
  status,
  portalSentAt,
  approvalDeadline,
  signed,
}: {
  variationId: string;
  status?: string | null;
  portalSentAt?: Date | string | null;
  approvalDeadline?: Date | string | null;
  signed: boolean;
}) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const key = [`/api/variations/${variationId}/reminders`];

  const { data } = useQuery<{ enabled: boolean; recipients: Array<{ email: string }>; log: VariationReminderLogEntry[] }>({
    queryKey: key,
  });
  const { data: templates = [] } = useQuery<VariationReminderTemplate[]>({
    queryKey: ["/api/variation-reminder-templates"],
  });

  const enabled = !!data?.enabled;
  const awaiting = status === "pending" && !signed;
  const decided = status === "approved" || status === "rejected" || signed;
  const live = templates.filter((t) => t.enabled);
  const recipients = data?.recipients ?? [];
  const log = data?.log ?? [];
  const sentFor = new Map<string, VariationReminderLogEntry[]>();
  for (const e of log) {
    if (!e.templateId) continue;
    sentFor.set(e.templateId, [...(sentFor.get(e.templateId) ?? []), e]);
  }

  const toggle = useMutation({
    mutationFn: (on: boolean) => apiRequest(`/api/variations/${variationId}/reminders`, "PATCH", { enabled: on }),
    onSuccess: (_r, on) => {
      queryClient.invalidateQueries({ queryKey: key });
      toast({ title: on ? "Reminders on" : "Reminders off" });
    },
    onError: () => toast({ title: "Couldn't change reminders", variant: "destructive" }),
  });
  const sendNow = useMutation({
    mutationFn: (templateId: string) => apiRequest(`/api/variations/${variationId}/reminders/${templateId}/send`, "POST", {}),
    onSuccess: (r: any) => {
      queryClient.invalidateQueries({ queryKey: key });
      const failed = (r?.results ?? []).filter((x: any) => x.status === "failed");
      toast(failed.length
        ? { title: "Some reminders failed", description: failed.map((f: any) => `${f.email}: ${f.error}`).join("; "), variant: "destructive" }
        : { title: "Reminder sent" });
    },
    onError: (e: any) => toast({ title: "Couldn't send", description: e?.payload?.error || e?.message, variant: "destructive" }),
  });

  const summary = decided
    ? "Not needed — the client has responded"
    : enabled
    ? `On · ${live.length} step${live.length === 1 ? "" : "s"}`
    : "Off";

  return (
    <DocumentSection
      title="Client Reminders"
      role="client"
      summary={summary}
      defaultOpen={enabled && !decided}
      isEmpty={false}
      data-testid="section-variation-reminders"
    >
      <div className="px-3.5 pb-3.5 space-y-3">
        {/* Not inside the page's locked fieldset rules: the switch is about
            chasing, not the document, so it stays usable. */}
        <div className="flex items-start gap-3 rounded-md border p-3">
          <Switch
            checked={enabled}
            onCheckedChange={(v) => toggle.mutate(v)}
            disabled={toggle.isPending || decided}
            className="mt-0.5"
            data-testid="switch-variation-reminders"
          />
          <div className="space-y-1 min-w-0">
            <p className="text-sm font-medium">Chase the client until they sign</p>
            <p className="text-xs text-muted-foreground">
              {decided
                ? "The client has already responded, so nothing will be sent."
                : !portalSentAt
                ? "Switch this on now and reminders start counting once you send the variation."
                : enabled
                ? `Sending to ${recipients.map((r) => r.email).join(", ") || "nobody — no recipient was recorded when it was sent"}.`
                : "Nothing is sent automatically while this is off."}
            </p>
          </div>
        </div>

        {live.length === 0 ? (
          <p className="text-xs text-muted-foreground">No reminder steps are switched on for your company.</p>
        ) : (
          <div className="space-y-1.5">
            {live.map((t) => {
              const dueAt = variationReminderDueAt(t, { sentAt: portalSentAt, approvalDeadline });
              const entries = sentFor.get(t.id) ?? [];
              const wasSent = entries.some((e) => e.status === "sent");
              const failed = entries.some((e) => e.status === "failed");
              const skipped = !wasSent && entries.some((e) => e.status === "skipped");
              const overdue = !!dueAt && dueAt <= new Date();
              return (
                <div key={t.id} className="flex items-center gap-2 rounded-md border px-3 py-2" data-testid={`row-variation-reminder-${t.id}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {describeVariationTrigger(t)}
                      {dueAt ? ` · ${format(dueAt, "d MMM yyyy")}` : t.trigger === "before_deadline" && !approvalDeadline ? " · no approval deadline set" : ""}
                    </p>
                  </div>
                  {wasSent ? (
                    <Badge variant="secondary" className="gap-1 text-xs"><Check className="h-3 w-3" /> Sent</Badge>
                  ) : failed ? (
                    <Badge variant="destructive" className="gap-1 text-xs"><AlertTriangle className="h-3 w-3" /> Failed</Badge>
                  ) : skipped ? (
                    <Badge variant="outline" className="text-xs text-muted-foreground" title="A later reminder was due at the same time, so only that one was sent">Skipped</Badge>
                  ) : enabled && awaiting && dueAt ? (
                    overdue ? (
                      <Badge variant="outline" className="gap-1 text-xs" title="Goes out within the hour. If several are due, only the latest is sent.">
                        <Clock className="h-3 w-3" /> Due now
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 text-xs"><Clock className="h-3 w-3" /> Scheduled</Badge>
                    )
                  ) : null}
                  {awaiting && recipients.length > 0 && (
                    <button
                      type="button"
                      onClick={() => sendNow.mutate(t.id)}
                      disabled={sendNow.isPending}
                      className="h-6 px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1 flex-shrink-0"
                      title="Send this reminder now"
                      data-testid={`button-send-reminder-now-${t.id}`}
                    >
                      {sendNow.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                      Send now
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {log.length > 0 && (
          <div className="space-y-1">
            <p className="doc-field-label">Sent</p>
            {log.map((e) => (
              <div key={e.id} className="flex items-center gap-2 text-xs" data-testid={`row-variation-reminder-log-${e.id}`}>
                <Mail className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <span className="truncate flex-1">{e.status === "skipped" ? (templates.find((t) => t.id === e.templateId)?.name ?? "Reminder") + " — skipped" : e.subject}</span>
                <span className="text-muted-foreground">{e.toEmail}</span>
                <span className="text-muted-foreground tabular-nums">{format(new Date(e.sentAt), "d MMM")}</span>
                {e.status === "failed" && <Badge variant="destructive" className="text-[10px]" title={e.error ?? undefined}>Failed</Badge>}
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => setLocation("/settings?tab=variation-reminders")}
          className="text-xs text-primary hover:underline flex items-center gap-1"
          data-testid="link-variation-reminder-settings"
        >
          <Settings2 className="h-3 w-3" />
          Change the timing and wording in Settings
        </button>
      </div>
    </DocumentSection>
  );
}
