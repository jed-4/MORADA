import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  describeVariationTrigger,
  renderVariationReminderText,
  VARIATION_REMINDER_PLACEHOLDERS,
} from "@shared/variationReminders";
import type { VariationReminderTemplate } from "@shared/schema";

/**
 * Settings → Variation Reminders. The company's chase steps: when each goes
 * (days after sending, or days before the approval deadline) and what it says.
 * Which variations get chased is a switch on each variation — off by default.
 */

type Draft = Pick<VariationReminderTemplate, "name" | "trigger" | "offsetDays" | "subject" | "body">;

const SAMPLE = {
  variation: { variationNumber: "4501-VO-007", name: "Upgrade to stone benchtops", approvalDeadline: new Date(Date.now() + 5 * 86400000) },
  clientName: "Sam",
  senderName: "You",
  companyName: "Your company",
  projectName: "12 Example St",
};

const KEY = ["/api/variation-reminder-templates"];

export function VariationRemindersSettings() {
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const { data: templates = [], isLoading } = useQuery<VariationReminderTemplate[]>({ queryKey: KEY });

  const err = (e: any) => e?.payload?.error || e?.message || "Please try again";
  const save = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Draft & { enabled: boolean }> }) =>
      apiRequest(`/api/variation-reminder-templates/${id}`, "PATCH", data),
    onSuccess: (_r, vars) => {
      queryClient.invalidateQueries({ queryKey: KEY });
      setDrafts((d) => { const n = { ...d }; delete n[vars.id]; return n; });
    },
    onError: (e) => toast({ title: "Couldn't save the reminder", description: err(e), variant: "destructive" }),
  });
  const add = useMutation({
    mutationFn: () =>
      apiRequest("/api/variation-reminder-templates", "POST", {
        name: "New reminder",
        trigger: "after_send",
        offsetDays: 10,
        subject: "Variation {{variation_number}} — {{variation_name}}",
        body: "Hi {{client_name}},\n\n\n\nThanks,\n{{sender_name}}\n{{company_name}}",
        enabled: false,
        displayOrder: templates.length,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      toast({ title: "Reminder added", description: "It's off until you switch it on." });
    },
    onError: (e) => toast({ title: "Couldn't add a reminder", description: err(e), variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/variation-reminder-templates/${id}`, "DELETE"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
    onError: (e) => toast({ title: "Couldn't delete the reminder", description: err(e), variant: "destructive" }),
  });

  return (
    <Card data-testid="settings-variation-reminders">
      <CardHeader>
        <CardTitle>Variation Reminders</CardTitle>
        <CardDescription>
          Emails that chase a client who hasn't signed a variation. Chasing is off on every variation until you
          switch it on there, and stops by itself the moment the client signs or rejects it. Each email carries a
          "Review and approve" button to the variation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <Accordion type="single" collapsible className="w-full">
            {templates.map((t) => {
              const d: Draft = drafts[t.id] ?? { name: t.name, trigger: t.trigger, offsetDays: t.offsetDays, subject: t.subject, body: t.body };
              const dirty = !!drafts[t.id];
              const set = (patch: Partial<Draft>) => setDrafts((all) => ({ ...all, [t.id]: { ...d, ...patch } }));
              return (
                <AccordionItem key={t.id} value={t.id} className="border rounded-md mb-2 px-3" data-testid={`variation-reminder-${t.id}`}>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={t.enabled}
                      onCheckedChange={(v) => save.mutate({ id: t.id, data: { enabled: v } })}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Turn ${t.name} on or off`}
                      data-testid={`switch-variation-reminder-${t.id}`}
                    />
                    <div className="flex-1 min-w-0 py-3">
                      <p className="text-sm font-medium truncate">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{describeVariationTrigger(t)}</p>
                    </div>
                    {!t.enabled && <Badge variant="outline" className="text-xs">Off</Badge>}
                    <AccordionTrigger className="hover:no-underline px-1" />
                  </div>
                  <AccordionContent className="pb-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <Label>Name</Label>
                        <Input value={d.name} onChange={(e) => set({ name: e.target.value })} data-testid={`input-reminder-name-${t.id}`} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Days</Label>
                        <Input
                          type="number"
                          min={0}
                          max={365}
                          value={d.offsetDays}
                          onChange={(e) => set({ offsetDays: Math.max(0, Math.min(365, parseInt(e.target.value || "0", 10) || 0)) })}
                          data-testid={`input-reminder-days-${t.id}`}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Counted from</Label>
                        <Select value={d.trigger} onValueChange={(v) => set({ trigger: v })}>
                          <SelectTrigger data-testid={`select-reminder-trigger-${t.id}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="after_send">After it's sent</SelectItem>
                            <SelectItem value="before_deadline">Before the approval deadline</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{describeVariationTrigger(d)}
                      {d.trigger === "before_deadline" && " — only for variations that have an approval deadline."}</p>
                    <div className="space-y-1.5">
                      <Label>Subject</Label>
                      <Input value={d.subject} onChange={(e) => set({ subject: e.target.value })} data-testid={`input-reminder-subject-${t.id}`} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Message</Label>
                      <Textarea rows={8} value={d.body} onChange={(e) => set({ body: e.target.value })} data-testid={`textarea-reminder-body-${t.id}`} />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {VARIATION_REMINDER_PLACEHOLDERS.map((ph) => (
                        <Badge key={ph.token} variant="outline" className="font-mono text-[10px]" title={ph.label}>{ph.token}</Badge>
                      ))}
                    </div>
                    <div className="rounded-md border bg-muted/30 p-3 space-y-1" data-testid={`preview-reminder-${t.id}`}>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Preview (sample variation)</p>
                      <p className="text-sm font-medium">{renderVariationReminderText(d.subject, SAMPLE)}</p>
                      <p className="text-xs whitespace-pre-wrap text-muted-foreground">{renderVariationReminderText(d.body, SAMPLE)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        disabled={!dirty || save.isPending || !d.name.trim() || !d.subject.trim() || !d.body.trim()}
                        onClick={() => save.mutate({ id: t.id, data: d })}
                        data-testid={`button-save-reminder-${t.id}`}
                      >
                        {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Save
                      </Button>
                      {dirty && (
                        <Button size="sm" variant="ghost" onClick={() => setDrafts((all) => { const n = { ...all }; delete n[t.id]; return n; })}>
                          Discard
                        </Button>
                      )}
                      <span className="flex-1" />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => remove.mutate(t.id)}
                        disabled={remove.isPending}
                        data-testid={`button-delete-reminder-${t.id}`}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
        <Button variant="outline" size="sm" onClick={() => add.mutate()} disabled={add.isPending} data-testid="button-add-variation-reminder">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add a reminder
        </Button>
      </CardContent>
    </Card>
  );
}
