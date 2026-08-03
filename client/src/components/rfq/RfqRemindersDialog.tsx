import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Bell, Check, Clock, Loader2, Plus, Send, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  RFQ_REMINDER_PLACEHOLDERS,
  type Rfq,
  type RfqRecipient,
  type RfqReminderTemplate,
  type RfqReminderLogEntry,
} from "@shared/schema";
import { describeTrigger, renderReminderText, reminderDueAt } from "@shared/rfqReminders";
import { cn } from "@/lib/utils";

/**
 * Reminder settings: a row per reminder, click through to edit.
 *
 * Templates are company-level — every RFQ chases the same way, so the wording
 * is written once rather than re-typed per RFQ. The per-RFQ control is just the
 * on/off switch in the sidebar.
 *
 * The preview renders through the same shared function the scheduler uses, so
 * what's shown here is exactly what the supplier receives.
 */
export function RfqRemindersDialog({
  open,
  onOpenChange,
  rfq,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rfq: Rfq;
}) {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const { data: templates = [], isLoading } = useQuery<RfqReminderTemplate[]>({
    queryKey: ["/api/rfq-reminder-templates"],
    enabled: open,
  });

  const { data: recipients = [] } = useQuery<RfqRecipient[]>({
    queryKey: ["/api/rfqs", rfq.id, "recipients"],
    enabled: open,
  });

  const { data: log = [] } = useQuery<RfqReminderLogEntry[]>({
    queryKey: ["/api/rfqs", rfq.id, "reminder-log"],
    enabled: open,
  });

  // Who is still being chased. A supplier who has quoted or declined drops out
  // automatically — the single most important behaviour here, since chasing a
  // supplier who already answered is what damages the relationship.
  const awaiting = useMemo(
    () => recipients.filter((r) => !r.isExternal && (r.status === "sent" || r.status === "viewed")),
    [recipients],
  );
  const answered = recipients.length - awaiting.length;

  const editing = templates.find((t) => t.id === editingId) ?? null;
  const [draft, setDraft] = useState<Partial<RfqReminderTemplate>>({});

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/rfq-reminder-templates"] });
    queryClient.invalidateQueries({ queryKey: ["/api/rfqs", rfq.id, "reminder-log"] });
  };

  const saveMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<RfqReminderTemplate> }) =>
      apiRequest(`/api/rfq-reminder-templates/${id}`, "PATCH", patch),
    onSuccess: () => {
      invalidate();
      toast({ title: "Reminder saved" });
      setEditingId(null);
    },
    onError: (e: any) => toast({ title: "Could not save", description: e.message, variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: async () =>
      apiRequest("/api/rfq-reminder-templates", "POST", {
        name: "New reminder",
        trigger: "after_send",
        offsetDays: 7,
        subject: "Following up: {{rfq_number}}",
        body: "Hi {{supplier_name}},\n\nJust checking in on {{rfq_title}}.\n\n{{portal_link}}\n\nThanks,\n{{sender_name}}",
        displayOrder: templates.length,
      }),
    onSuccess: (t: any) => {
      invalidate();
      setEditingId(t.id);
      setDraft(t);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest(`/api/rfq-reminder-templates/${id}`, "DELETE"),
    onSuccess: () => {
      invalidate();
      setEditingId(null);
      toast({ title: "Reminder removed" });
    },
  });

  const sendNowMutation = useMutation({
    mutationFn: async (templateId: string) =>
      apiRequest(`/api/rfqs/${rfq.id}/reminders/${templateId}/send`, "POST", {}),
    onSuccess: (res: any) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["/api/rfqs", rfq.id, "recipients"] });
      const sent = (res?.results ?? []).filter((r: any) => r.status === "sent").length;
      toast({
        title: sent > 0 ? `Reminder sent to ${sent} supplier${sent === 1 ? "" : "s"}` : "Nothing to send",
      });
    },
    onError: (e: any) => toast({ title: "Could not send", description: e.message, variant: "destructive" }),
  });

  const startEdit = (template: RfqReminderTemplate) => {
    setEditingId(template.id);
    setDraft(template);
  };

  const insertPlaceholder = (token: string) => {
    const el = bodyRef.current;
    const current = draft.body ?? "";
    if (!el) {
      setDraft((d) => ({ ...d, body: current + token }));
      return;
    }
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    setDraft((d) => ({ ...d, body: next }));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  // Preview against a real supplier where there is one, so the copy is checked
  // against actual data rather than lorem.
  const previewCtx = {
    rfq,
    recipient:
      awaiting[0] ??
      recipients[0] ?? { supplierName: "Smith Concrete", portalToken: "preview-token" },
    senderName: rfq.ownerName || rfq.createdByName,
    companyName: "Your company",
    baseUrl: typeof window !== "undefined" ? window.location.origin : "",
  } as any;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="dialog-rfq-reminders">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {editing && (
              <button
                onClick={() => setEditingId(null)}
                className="h-6 w-6 rounded-md hover-elevate flex items-center justify-center"
                aria-label="Back to reminders"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            {editing ? draft.name || "Edit reminder" : "Reminders"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "These apply to every RFQ. Placeholders are filled in per supplier when the email goes out."
              : "Chase suppliers who haven't come back. Set once, applies to every RFQ."}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading reminders…
          </div>
        ) : editing ? (
          // ── Editor ──────────────────────────────────────────────────────
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Name</Label>
                <Input
                  value={draft.name ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  data-testid="input-reminder-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">When</Label>
                <Select
                  value={draft.trigger ?? "after_send"}
                  onValueChange={(v) => setDraft((d) => ({ ...d, trigger: v as any }))}
                >
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="after_send">Days after sending</SelectItem>
                    <SelectItem value="before_due">Days before due date</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Days</Label>
                <Input
                  type="number"
                  min={0}
                  value={draft.offsetDays ?? 0}
                  onChange={(e) => setDraft((d) => ({ ...d, offsetDays: parseInt(e.target.value) || 0 }))}
                  data-testid="input-reminder-days"
                />
              </div>
            </div>

            {draft.trigger === "before_due" && !rfq.dueDate && (
              <p className="text-xs text-amber">
                This RFQ has no response due date, so a "before due" reminder will never fire on it.
              </p>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Subject</Label>
              <Input
                value={draft.subject ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
                data-testid="input-reminder-subject"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Message</Label>
              <Textarea
                ref={bodyRef}
                value={draft.body ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                className="min-h-[160px] text-sm font-mono"
                data-testid="textarea-reminder-body"
              />
              <div className="flex flex-wrap gap-1 pt-1">
                {RFQ_REMINDER_PLACEHOLDERS.map((p) => (
                  <button
                    key={p.token}
                    type="button"
                    onClick={() => insertPlaceholder(p.token)}
                    className="px-1.5 py-0.5 rounded border border-border/60 text-data hover-elevate"
                    title={`Insert ${p.token}`}
                    data-testid={`chip-${p.token.replace(/[{}]/g, "")}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Rendered through the same function the scheduler uses. */}
            <div className="rounded-md border border-border/60 bg-muted/20 overflow-hidden">
              <div className="h-7 flex items-center px-3 border-b border-border/40 bg-muted/40">
                <span className="text-data text-muted-foreground">
                  Preview — as {previewCtx.recipient.supplierName} will see it
                </span>
              </div>
              <div className="p-3 space-y-2">
                <p className="text-xs font-medium">
                  {renderReminderText(draft.subject ?? "", previewCtx)}
                </p>
                <p className="text-xs whitespace-pre-wrap text-muted-foreground">
                  {renderReminderText(draft.body ?? "", previewCtx)}
                </p>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              <Button
                variant="ghost"
                className="text-destructive"
                onClick={() => deleteMutation.mutate(editing.id)}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                <Button
                  onClick={() => saveMutation.mutate({ id: editing.id, patch: draft })}
                  disabled={saveMutation.isPending}
                  className="bg-primary hover:bg-primary/90 text-white"
                  data-testid="button-save-reminder"
                >
                  {saveMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </DialogFooter>
          </div>
        ) : (
          // ── List ────────────────────────────────────────────────────────
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Bell className="w-3.5 h-3.5" />
              {awaiting.length === 0 ? (
                <span>No suppliers are awaiting a response — nothing will be chased.</span>
              ) : (
                <span>
                  Chasing {awaiting.length} of {recipients.length} supplier
                  {recipients.length === 1 ? "" : "s"}
                  {answered > 0 && ` — ${answered} already answered and won't be chased`}
                </span>
              )}
            </div>

            <div className="border rounded-md divide-y divide-border/40">
              {templates.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No reminders set up.</p>
              ) : (
                templates.map((template) => {
                  const alreadySent = log.filter((l) => l.templateId === template.id && l.status === "sent");
                  const nextAt = awaiting.length
                    ? reminderDueAt(template, {
                        sentAt: awaiting[0].sentAt,
                        dueDate: rfq.dueDate,
                      })
                    : null;
                  return (
                    <div
                      key={template.id}
                      className="flex items-center gap-3 px-3 py-2.5 hover-elevate"
                      data-testid={`row-reminder-${template.id}`}
                    >
                      <button
                        type="button"
                        onClick={() => startEdit(template)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <p className={cn("text-sm font-medium truncate", !template.enabled && "text-muted-foreground")}>
                          {template.name}
                        </p>
                        <p className="text-data text-muted-foreground truncate">
                          {describeTrigger(template)} · {template.subject}
                        </p>
                      </button>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {alreadySent.length > 0 ? (
                          <Badge variant="secondary" className="text-data gap-1">
                            <Check className="w-3 h-3" />
                            Sent {alreadySent.length}
                          </Badge>
                        ) : nextAt ? (
                          <span className="text-data text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {nextAt > new Date() ? format(nextAt, "d MMM") : "due"}
                          </span>
                        ) : (
                          <span className="text-data text-muted-foreground/50">—</span>
                        )}

                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-xs"
                          disabled={awaiting.length === 0 || sendNowMutation.isPending}
                          onClick={() => sendNowMutation.mutate(template.id)}
                          data-testid={`button-send-now-${template.id}`}
                        >
                          <Send className="w-3 h-3 mr-1" />
                          Send now
                        </Button>

                        <Switch
                          checked={template.enabled}
                          onCheckedChange={(enabled) =>
                            saveMutation.mutate({ id: template.id, patch: { enabled } })
                          }
                          aria-label={`${template.enabled ? "Pause" : "Enable"} ${template.name}`}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              data-testid="button-add-reminder"
            >
              <Plus className="w-3 h-3 mr-1" />
              Add reminder
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
