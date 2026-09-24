import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AlertTriangle, Check, Clock, Loader2, Mail, Send } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  describeProposalTrigger,
  proposalReminderDueAt,
  PROPOSAL_REMINDER_PLACEHOLDERS,
} from "@shared/proposalReminders";
import type { Proposal, ProposalReminderTemplate, ProposalReminderLogEntry } from "@shared/schema";

interface ProposalRemindersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposal: Proposal;
}

export function ProposalRemindersDialog({ open, onOpenChange, proposal }: ProposalRemindersDialogProps) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<Record<string, { subject: string; body: string }>>({});

  const { data: templates = [], isLoading } = useQuery<ProposalReminderTemplate[]>({
    queryKey: ["/api/proposal-reminder-templates"],
    enabled: open,
  });

  const { data: log = [] } = useQuery<ProposalReminderLogEntry[]>({
    queryKey: ["/api/proposals", proposal.id, "reminder-log"],
    enabled: open,
  });

  const chasing = proposal.remindersEnabled === true;
  const awaitingReply = proposal.status === "sent" || proposal.status === "viewed";

  const toggleChasing = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest(`/api/proposals/${proposal.id}`, "PATCH", { remindersEnabled: enabled }),
    onSuccess: (_d, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", proposal.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      toast({ title: enabled ? "Follow-ups on" : "Follow-ups off" });
    },
    onError: () => toast({ variant: "destructive", title: "Could not change follow-ups" }),
  });

  const saveTemplate = useMutation({
    mutationFn: ({ id, subject, body }: { id: string; subject: string; body: string }) =>
      apiRequest(`/api/proposal-reminder-templates/${id}`, "PATCH", { subject, body }),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposal-reminder-templates"] });
      setDraft((prev) => {
        const next = { ...prev };
        delete next[vars.id];
        return next;
      });
      toast({ title: "Wording saved" });
    },
    onError: () => toast({ variant: "destructive", title: "Could not save the wording" }),
  });

  const toggleTemplate = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiRequest(`/api/proposal-reminder-templates/${id}`, "PATCH", { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/proposal-reminder-templates"] }),
    onError: () => toast({ variant: "destructive", title: "Could not update that follow-up" }),
  });

  const sendNow = useMutation({
    mutationFn: (templateId: string) =>
      apiRequest(`/api/proposals/${proposal.id}/reminders/${templateId}/send`, "POST", {}),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", proposal.id, "reminder-log"] });
      const failed = (result?.results ?? []).filter((r: any) => r.status === "failed");
      if (failed.length) {
        toast({
          variant: "destructive",
          title: "Some follow-ups failed",
          description: failed.map((f: any) => `${f.email}: ${f.error}`).join("; "),
        });
      } else {
        toast({ title: "Follow-up sent" });
      }
    },
    onError: (e: unknown) =>
      toast({
        variant: "destructive",
        title: "Could not send",
        description: e instanceof Error ? e.message : undefined,
      }),
  });

  // What has already gone out, keyed by template, so each row can say whether
  // it has fired rather than only when it is due.
  const sentByTemplate = new Map<string, ProposalReminderLogEntry[]>();
  for (const entry of log) {
    if (!entry.templateId) continue;
    const list = sentByTemplate.get(entry.templateId);
    if (list) list.push(entry);
    else sentByTemplate.set(entry.templateId, [entry]);
  }

  const recipients = (proposal.sentTo ?? []) as Array<{ name?: string; email: string }>;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dialog-proposal-reminders">
        <DialogHeader>
          <DialogTitle>Follow-ups</DialogTitle>
          <DialogDescription>
            Automatic nudges to the people this proposal was sent to. They stop
            by themselves the moment the client accepts or declines.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-md border p-3">
            <Switch
              checked={chasing}
              onCheckedChange={(v) => toggleChasing.mutate(v)}
              disabled={toggleChasing.isPending}
              id="chase-toggle"
              className="mt-0.5"
              data-testid="switch-proposal-chasing"
            />
            <div className="space-y-1">
              <Label htmlFor="chase-toggle" className="cursor-pointer">
                Follow up on this proposal
              </Label>
              <p className="text-xs text-muted-foreground">
                {chasing
                  ? `Sending to ${recipients.map((r) => r.email).join(", ") || "nobody — no recipients were recorded"}.`
                  : "Nothing is sent automatically while this is off."}
              </p>
            </div>
          </div>

          {!awaitingReply && (
            <p
              className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground"
              data-testid="text-not-awaiting"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                This proposal is {proposal.status}, so nothing will be sent — follow-ups
                only run while a proposal is awaiting the client's response.
              </span>
            </p>
          )}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading follow-ups…</p>
          ) : (
            <Accordion type="single" collapsible className="w-full">
              {templates.map((t) => {
                const dueAt = proposalReminderDueAt(t, {
                  sentDate: proposal.sentDate,
                  expiryDate: proposal.expiryDate,
                });
                const entries = sentByTemplate.get(t.id) ?? [];
                const alreadySent = entries.some((e) => e.status === "sent");
                const failed = entries.filter((e) => e.status === "failed");
                const current = draft[t.id] ?? { subject: t.subject, body: t.body };
                const dirty = !!draft[t.id];

                return (
                  <AccordionItem key={t.id} value={t.id} className="border rounded-md mb-2 px-3">
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={t.enabled}
                        onCheckedChange={(v) => toggleTemplate.mutate({ id: t.id, enabled: v })}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Enable ${t.name}`}
                        data-testid={`switch-template-${t.id}`}
                      />
                      <div className="flex-1 min-w-0 py-3">
                        <p className="text-sm font-medium truncate">{t.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {describeProposalTrigger(t)}
                          {dueAt ? ` · ${format(dueAt, "d MMM yyyy")}` : " · no date to work from"}
                        </p>
                      </div>
                      {alreadySent ? (
                        <Badge variant="secondary" className="gap-1 text-xs" data-testid={`badge-sent-${t.id}`}>
                          <Check className="h-3 w-3" /> Sent
                        </Badge>
                      ) : failed.length ? (
                        <Badge variant="destructive" className="gap-1 text-xs">
                          <AlertTriangle className="h-3 w-3" /> Failed
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-xs">
                          <Clock className="h-3 w-3" /> Scheduled
                        </Badge>
                      )}
                      <AccordionTrigger className="hover:no-underline px-1" />
                    </div>

                    <AccordionContent className="pb-4 space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor={`subj-${t.id}`}>Subject</Label>
                        <Input
                          id={`subj-${t.id}`}
                          value={current.subject}
                          onChange={(e) =>
                            setDraft((prev) => ({ ...prev, [t.id]: { ...current, subject: e.target.value } }))
                          }
                          data-testid={`input-template-subject-${t.id}`}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`body-${t.id}`}>Message</Label>
                        <Textarea
                          id={`body-${t.id}`}
                          rows={8}
                          value={current.body}
                          onChange={(e) =>
                            setDraft((prev) => ({ ...prev, [t.id]: { ...current, body: e.target.value } }))
                          }
                          data-testid={`textarea-template-body-${t.id}`}
                        />
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {PROPOSAL_REMINDER_PLACEHOLDERS.map((ph) => (
                          <Badge key={ph.token} variant="outline" className="font-mono text-[10px]">
                            {ph.token}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          disabled={!dirty || saveTemplate.isPending}
                          onClick={() => saveTemplate.mutate({ id: t.id, ...current })}
                          data-testid={`button-save-template-${t.id}`}
                        >
                          {saveTemplate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Save wording
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!awaitingReply || recipients.length === 0 || sendNow.isPending}
                          onClick={() => sendNow.mutate(t.id)}
                          data-testid={`button-send-now-${t.id}`}
                        >
                          {sendNow.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="mr-2 h-4 w-4" />
                          )}
                          Send now
                        </Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">History</Label>
            {log.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="text-no-reminder-log">
                Nothing has been sent yet.
              </p>
            ) : (
              <div className="space-y-1">
                {log.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs"
                    data-testid={`row-reminder-log-${entry.id}`}
                  >
                    <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate flex-1">{entry.subject}</span>
                    <span className="text-muted-foreground">{entry.toEmail}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {format(new Date(entry.sentAt), "d MMM")}
                    </span>
                    {entry.status === "failed" ? (
                      <Badge variant="destructive" className="text-[10px]">Failed</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">Sent</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
