import { useState, useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, Trash2, Image as ImageIcon, Eye, EyeOff, Upload, Send, AlertTriangle, Bell } from "lucide-react";
import { SetReminderDialog } from "@/components/SetReminderDialog";
import { format } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { useAuth } from "@/hooks/use-auth";
import {
  DEFECT_JOB_STAGES,
  DEFECT_JOB_STAGE_LABELS,
  DEFECT_STAGE_LABELS,
  allowedDefectTransitions,
  type DefectDetailView,
  type DefectEventView,
  type DefectPhotoKind,
  type DefectStage,
  type DefectView,
} from "@shared/defects";
import { useDefectPriorityOptions } from "@/hooks/useDefectPriorityOptions";
import { useDefectTypeOptions } from "@/hooks/useDefectTypeOptions";
import { useDefectTradeOptions } from "@/hooks/useDefectTradeOptions";
import {
  stageBadgeClass,
  priorityBadgeClass,
  priorityLabel,
  invalidateDefectQueries,
} from "./defectStyles";
import { useDefectPermissions, useTeamUsers, type TeamUserOption } from "./defectHooks";
import { DefectLocationPicker } from "./DefectLocationPicker";

interface DefectDrawerProps {
  defect: DefectView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (defect: DefectView) => void;
}

type Draft = {
  title: string;
  description: string;
  priority: string;
  type: string;
  trade: string;
  jobStage: string;
  ownerUserId: string | null;
  locationId: string | null;
  location: string | null;
  dueDate: string;
};

const NONE = "__none__";
const toDateInput = (d: string | null | undefined) => (d ? format(new Date(d), "yyyy-MM-dd") : "");

function draftFrom(d: DefectView): Draft {
  return {
    title: d.title,
    description: d.description ?? "",
    priority: d.priority,
    type: d.type,
    trade: d.trade ?? "",
    jobStage: d.jobStage,
    ownerUserId: d.ownerUserId,
    locationId: d.locationId,
    location: d.location,
    dueDate: toDateInput(d.dueDate),
  };
}

export function DefectDrawer({ defect: listDefect, open, onOpenChange, onDelete }: DefectDrawerProps) {
  const { toast } = useToast();
  const perms = useDefectPermissions();
  const { priorityOptions } = useDefectPriorityOptions();
  const { typeOptions } = useDefectTypeOptions();
  const tradeOptions = useDefectTradeOptions();
  const teamUsers = useTeamUsers();

  const id = listDefect?.id;
  const { data: detail } = useQuery<DefectDetailView>({
    queryKey: ["/api/defects", id],
    enabled: open && !!id,
    staleTime: 0,
  });
  const defect: DefectView | null = detail ?? listDefect;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [showReminder, setShowReminder] = useState(false);

  useEffect(() => {
    if (defect) setDraft(draftFrom(defect));
    // Re-seed when a different defect opens, or the server copy changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defect?.id, defect?.updatedAt]);
  useEffect(() => {
    if (!open) { setRejecting(false); setRejectNote(""); }
  }, [open, id]);

  const onDone = (msg?: string) => {
    invalidateDefectQueries(queryClient);
    if (msg) toast({ title: msg });
  };
  const onFail = (title: string) => (e: any) =>
    toast({ title, description: e?.payload?.error || e?.message || "Please try again", variant: "destructive" });

  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiRequest(`/api/defects/${id}`, "PATCH", payload),
    onSuccess: () => onDone("Defect saved"),
    onError: onFail("Couldn't save the defect"),
  });

  const transitionMutation = useMutation({
    mutationFn: (body: { to: DefectStage; note?: string }) => apiRequest(`/api/defects/${id}/transition`, "POST", body),
    onSuccess: (_d, v) => {
      setRejecting(false);
      setRejectNote("");
      onDone(`Moved to ${DEFECT_STAGE_LABELS[v.to]}`);
    },
    onError: onFail("Couldn't move the defect"),
  });

  const watchMutation = useMutation({
    mutationFn: (watch: boolean) => apiRequest(`/api/defects/${id}/watch`, watch ? "POST" : "DELETE"),
    onSuccess: () => onDone(),
    onError: onFail("Couldn't change watching"),
  });

  const photoMutation = useMutation({
    mutationFn: (photos: Array<{ url: string; name: string; type?: string; kind?: DefectPhotoKind }>) =>
      apiRequest(`/api/defects/${id}/photos`, "POST", { photos }),
    onSuccess: () => onDone("Photo added"),
    onError: onFail("Couldn't add the photo"),
  });

  const dirtyPatch = useMemo(() => {
    if (!defect || !draft) return {};
    const base = draftFrom(defect);
    const p: Record<string, unknown> = {};
    if (draft.title.trim() && draft.title !== base.title) p.title = draft.title.trim();
    if (draft.description !== base.description) p.description = draft.description || null;
    if (draft.priority !== base.priority) p.priority = draft.priority;
    if (draft.type !== base.type) p.type = draft.type;
    if (draft.trade !== base.trade) p.trade = draft.trade || null;
    if (draft.jobStage !== base.jobStage) p.jobStage = draft.jobStage;
    if (draft.ownerUserId !== base.ownerUserId) p.ownerUserId = draft.ownerUserId;
    if (draft.locationId !== base.locationId) p.locationId = draft.locationId;
    if (draft.dueDate !== base.dueDate) p.dueDate = draft.dueDate ? new Date(`${draft.dueDate}T00:00:00`).toISOString() : null;
    return p;
  }, [defect, draft]);
  const dirty = Object.keys(dirtyPatch).length > 0;

  if (!defect || !draft) return null;

  const canEdit = perms.edit;
  const nextStages = allowedDefectTransitions(defect.stage, { canEdit: perms.edit, canClose: perms.close });
  const attachments = defect.attachments ?? [];
  const watchers = detail?.watchers ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[520px] sm:max-w-[520px] p-0 flex flex-col gap-0">
        {/* Header */}
        <SheetHeader className="px-5 py-4 border-b border-border flex-row items-start justify-between gap-3 space-y-0">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold text-muted-foreground" data-testid="drawer-ref">
              {defect.ref}
              {defect.projectName && <span className="font-normal"> · {defect.projectName}</span>}
            </div>
            <SheetTitle className="text-base font-semibold text-foreground line-clamp-2 text-left">
              {defect.title}
            </SheetTitle>
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              <span
                className={`inline-flex items-center rounded text-[10px] font-medium px-1.5 py-0.5 ${stageBadgeClass(defect.stage)}`}
                data-testid="drawer-stage-badge"
              >
                {DEFECT_STAGE_LABELS[defect.stage] ?? defect.stage}
              </span>
              <span
                className={`inline-flex items-center rounded text-[10px] font-medium px-1.5 py-0.5 ${priorityBadgeClass(defect.priority)}`}
                data-testid="drawer-priority-badge"
              >
                {priorityLabel(defect.priority, priorityOptions)}
              </span>
              {defect.overdue && (
                <span className="inline-flex items-center gap-0.5 rounded text-[10px] font-semibold px-1.5 py-0.5 bg-[hsl(var(--coral-bg))] text-[hsl(var(--coral))]">
                  <AlertTriangle className="h-3 w-3" /> Overdue
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] gap-1" data-testid="drawer-watchers">
                  {defect.isWatching ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  {defect.watcherCount}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" align="end">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-1 mb-1">Watching</div>
                {watchers.length === 0 ? (
                  <div className="text-xs text-muted-foreground px-1 py-1">Nobody yet</div>
                ) : (
                  <ul className="text-xs space-y-0.5 mb-2">
                    {watchers.map((w) => <li key={w.userId} className="px-1">{w.name}</li>)}
                  </ul>
                )}
                <Button
                  size="sm"
                  variant={defect.isWatching ? "outline" : "default"}
                  className="w-full h-7 text-xs"
                  disabled={watchMutation.isPending}
                  onClick={() => watchMutation.mutate(!defect.isWatching)}
                  data-testid="drawer-watch-toggle"
                >
                  {defect.isWatching ? "Stop watching" : "Watch"}
                </Button>
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="icon" className="h-7 w-7 -mt-1 -mr-1" onClick={() => onOpenChange(false)} data-testid="drawer-close">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Stage actions */}
          {nextStages.length > 0 && (
            <div className="space-y-2">
              <SectionLabel>Move to</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {nextStages.map((to) => (
                  <button
                    key={to}
                    type="button"
                    disabled={transitionMutation.isPending}
                    onClick={() => (to === "rejected" ? setRejecting(true) : transitionMutation.mutate({ to }))}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border border-transparent hover-elevate ${stageBadgeClass(to)}`}
                    data-testid={`drawer-transition-${to}`}
                  >
                    {to === "open" && defect.stage === "closed" ? "Reopen" : DEFECT_STAGE_LABELS[to]}
                  </button>
                ))}
              </div>
              {rejecting && (
                <div className="space-y-2 rounded-md border border-border p-2.5">
                  <Label className="text-xs">Why did the check fail? (goes back to the trade)</Label>
                  <Textarea
                    autoFocus
                    rows={2}
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                    className="text-sm"
                    placeholder="e.g. Still leaking at the shower screen"
                    data-testid="drawer-reject-note"
                  />
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setRejecting(false)}>Cancel</Button>
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      disabled={!rejectNote.trim() || transitionMutation.isPending}
                      onClick={() => transitionMutation.mutate({ to: "rejected", note: rejectNote.trim() })}
                      data-testid="drawer-reject-confirm"
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Title */}
          {canEdit && (
            <div className="space-y-2">
              <SectionLabel>Title</SectionLabel>
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                className="h-9"
                data-testid="drawer-title"
              />
            </div>
          )}

          {/* Priority */}
          <div className="space-y-2">
            <SectionLabel>Priority</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {priorityOptions.map((opt) => {
                const active = draft.priority === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => setDraft({ ...draft, priority: opt.key })}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors disabled:cursor-default ${
                      active
                        ? `${priorityBadgeClass(opt.key)} border-transparent`
                        : "bg-card border-border text-muted-foreground hover-elevate"
                    }`}
                    data-testid={`drawer-priority-${opt.key}`}
                  >
                    {opt.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Owner / Job stage */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <SectionLabel>Owner</SectionLabel>
              <OwnerSelect
                users={teamUsers}
                value={draft.ownerUserId}
                fallbackName={defect.ownerName}
                disabled={!canEdit}
                onChange={(v) => setDraft({ ...draft, ownerUserId: v })}
              />
            </div>
            <div className="space-y-2">
              <SectionLabel>Job stage</SectionLabel>
              <Select value={draft.jobStage} onValueChange={(v) => setDraft({ ...draft, jobStage: v })} disabled={!canEdit}>
                <SelectTrigger className="h-9" data-testid="drawer-job-stage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEFECT_JOB_STAGES.map((js) => (
                    <SelectItem key={js} value={js}>{DEFECT_JOB_STAGE_LABELS[js]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Type / Trade */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <SectionLabel>Type</SectionLabel>
              <Select value={draft.type} onValueChange={(v) => setDraft({ ...draft, type: v })} disabled={!canEdit}>
                <SelectTrigger className="h-9" data-testid="drawer-type-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((opt) => (
                    <SelectItem key={opt.key} value={opt.key}>{opt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <SectionLabel>Trade</SectionLabel>
              <Select
                value={draft.trade || NONE}
                onValueChange={(v) => setDraft({ ...draft, trade: v === NONE ? "" : v })}
                disabled={!canEdit}
              >
                <SelectTrigger className="h-9" data-testid="drawer-trade-select">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {/* Keep a trade that's no longer an option selectable, or Radix wipes it. */}
                  {draft.trade && !tradeOptions.some((o) => o.value === draft.trade) && (
                    <SelectItem value={draft.trade}>{draft.trade}</SelectItem>
                  )}
                  {tradeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Location / Due */}
          <div className="grid grid-cols-[1fr_150px] gap-3">
            <div className="space-y-2 min-w-0">
              <SectionLabel>Location</SectionLabel>
              <DefectLocationPicker
                projectId={defect.projectId}
                value={draft.locationId}
                fallbackText={draft.locationId ? null : draft.location}
                canAdd={perms.add}
                disabled={!canEdit}
                onChange={(locationId, path) => setDraft({ ...draft, locationId, location: path })}
                testId="drawer-location"
              />
            </div>
            <div className="space-y-2">
              <SectionLabel>Due</SectionLabel>
              <Input
                type="date"
                value={draft.dueDate}
                onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
                disabled={!canEdit}
                className="h-9"
                data-testid="drawer-due-date"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <SectionLabel>Description</SectionLabel>
            <Textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="What's the issue?"
              rows={3}
              disabled={!canEdit}
              className="text-sm"
              data-testid="drawer-description"
            />
          </div>

          {/* Photos */}
          <PhotosSection
            attachments={attachments}
            canAdd={canEdit}
            busy={photoMutation.isPending}
            defaultKind={defect.stage === "fixed" || defect.stage === "accepted" ? "after" : "before"}
            onAdd={(photos) => photoMutation.mutate(photos)}
          />

          {/* Facts */}
          <div className="grid grid-cols-2 gap-3 text-[11px] text-muted-foreground">
            <Fact label="Reported">
              {defect.dateIdentified ? format(new Date(defect.dateIdentified), "MMM d, yyyy") : "—"}
              {defect.createdByName ? ` · ${defect.createdByName}` : ""}
            </Fact>
            <Fact label="Trade contact">{defect.assignedContactName || "—"}</Fact>
            {defect.closedAt && (
              <Fact label="Closed">
                {format(new Date(defect.closedAt), "MMM d, yyyy")}
                {defect.closedByName ? ` · ${defect.closedByName}` : ""}
              </Fact>
            )}
          </div>

          {/* History + comments */}
          <HistorySection defectId={defect.id} events={detail?.events ?? []} users={teamUsers} />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          {perms.delete ? (
            <Button
              variant="ghost"
              onClick={() => onDelete(defect)}
              className="text-[hsl(var(--coral))] hover:text-[hsl(var(--coral))]"
              data-testid="drawer-delete"
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Delete
            </Button>
          ) : <span />}
          <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => setShowReminder(true)} data-testid="drawer-set-reminder">
            <Bell className="h-4 w-4 mr-1.5" />
            Reminder
          </Button>
          {canEdit && (
            <Button
              onClick={() => updateMutation.mutate(dirtyPatch)}
              disabled={!dirty || updateMutation.isPending}
              data-testid="drawer-save"
            >
              {updateMutation.isPending ? "Saving..." : "Save changes"}
            </Button>
          )}
          </div>
        </div>
        <SetReminderDialog
          open={showReminder}
          onOpenChange={setShowReminder}
          linkedItemType="defect"
          linkedItemId={defect.id}
          linkedItemTitle={`${defect.ref} ${defect.title}`}
          projectId={defect.projectId}
        />
      </SheetContent>
    </Sheet>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Label className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">{children}</Label>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="uppercase tracking-wide font-semibold mb-1">{label}</div>
      <div className="text-foreground">{children}</div>
    </div>
  );
}

export function OwnerSelect({
  users,
  value,
  fallbackName,
  disabled,
  onChange,
  testId = "drawer-owner-select",
}: {
  users: TeamUserOption[];
  value: string | null;
  fallbackName?: string | null;
  disabled?: boolean;
  onChange: (v: string | null) => void;
  testId?: string;
}) {
  return (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)} disabled={disabled}>
      <SelectTrigger className="h-9" data-testid={testId}>
        <SelectValue placeholder="No owner" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>No owner</SelectItem>
        {value && !users.some((u) => u.id === value) && (
          <SelectItem value={value}>{fallbackName || "Former team member"}</SelectItem>
        )}
        {users.map((u) => (
          <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const KIND_LABEL: Record<DefectPhotoKind, string> = { before: "Before", after: "After", trade: "Trade" };

function PhotosSection({
  attachments,
  canAdd,
  busy,
  defaultKind,
  onAdd,
}: {
  attachments: Array<{ url: string; name: string; kind?: DefectPhotoKind }>;
  canAdd: boolean;
  busy: boolean;
  defaultKind: DefectPhotoKind;
  onAdd: (photos: Array<{ url: string; name: string; type?: string; kind?: DefectPhotoKind }>) => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<DefectPhotoKind>(defaultKind);
  useEffect(() => setKind(defaultKind), [defaultKind]);
  const { uploadFile, isUploading } = useUpload();

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const out: Array<{ url: string; name: string; type?: string; kind?: DefectPhotoKind }> = [];
    for (const f of Array.from(files)) {
      const r = await uploadFile(f);
      if (r?.objectPath) out.push({ url: r.objectPath, name: f.name, type: f.type || undefined, kind });
    }
    if (fileRef.current) fileRef.current.value = "";
    if (out.length) onAdd(out);
    else toast({ title: "Upload failed", variant: "destructive" });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <SectionLabel>Photos ({attachments.length})</SectionLabel>
        {canAdd && (
          <div className="flex items-center gap-1.5">
            <Select value={kind} onValueChange={(v) => setKind(v as DefectPhotoKind)}>
              <SelectTrigger className="h-7 w-[92px] text-xs" data-testid="drawer-photo-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(KIND_LABEL) as DefectPhotoKind[]).map((k) => (
                  <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              disabled={isUploading || busy}
              onClick={() => fileRef.current?.click()}
              data-testid="drawer-photo-add"
            >
              <Upload className="h-3 w-3" />
              {isUploading ? "Uploading…" : "Add"}
            </Button>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
          </div>
        )}
      </div>
      {attachments.length === 0 ? (
        <div className="flex items-center justify-center h-20 rounded-md border border-dashed border-border text-xs text-muted-foreground">
          <ImageIcon className="h-4 w-4 mr-1.5" />
          No photos attached
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {attachments.map((a, i) => (
            <a
              key={`${a.url}-${i}`}
              href={a.url}
              target="_blank"
              rel="noreferrer"
              className="relative block aspect-square rounded-md overflow-hidden border border-border hover-elevate"
            >
              <img src={a.url} alt={a.name} className="w-full h-full object-cover" />
              {a.kind && (
                <span className="absolute bottom-1 left-1 rounded bg-black/60 text-white text-[9px] font-semibold px-1 py-0.5">
                  {KIND_LABEL[a.kind]}
                </span>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── History + comments ─────────────────────────────────────────────────── */

const FIELD_LABELS: Record<string, string> = {
  title: "title", description: "description", location: "location", locationId: "location",
  type: "type", priority: "priority", trade: "trade", assignedContactId: "trade contact",
  assignedContactName: "trade contact", ownerUserId: "owner", ownerName: "owner", jobStage: "job stage",
  dueDate: "due date", dateIdentified: "date reported", notes: "notes",
};

function describeEvent(e: DefectEventView): string {
  const d = e.data ?? {};
  switch (e.type) {
    case "created":
      return "raised this defect";
    case "transition": {
      const to = DEFECT_STAGE_LABELS[d.to as DefectStage] ?? d.to;
      return d.from === "closed" && d.to === "open" ? "reopened it" : `moved it to ${to}`;
    }
    case "updated": {
      const names = Array.from(new Set(Object.keys(d.fields ?? {}).map((k) => FIELD_LABELS[k] ?? k)));
      if (d.photos) names.push("photos");
      return names.length ? `changed ${names.join(", ")}` : "edited it";
    }
    case "photo":
      return `added ${d.count ?? 1} photo${(d.count ?? 1) === 1 ? "" : "s"}`;
    case "watcher_added":
      return "started watching";
    case "watcher_removed":
      return "stopped watching";
    default:
      return e.type;
  }
}

function HistorySection({ defectId, events, users }: { defectId: string; events: DefectEventView[]; users: TeamUserOption[] }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [mentions, setMentions] = useState<TeamUserOption[]>([]);
  const [query, setQuery] = useState<{ q: string; start: number } | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  const candidates = query
    ? users.filter((u) => u.id !== (user as any)?.id && u.name.toLowerCase().includes(query.q.toLowerCase())).slice(0, 6)
    : [];

  const commentMutation = useMutation({
    mutationFn: (body: { text: string; mentions: string[] }) => apiRequest(`/api/defects/${defectId}/comments`, "POST", body),
    onSuccess: () => {
      setText("");
      setMentions([]);
      invalidateDefectQueries(queryClient);
    },
    onError: (e: any) => toast({ title: "Couldn't post the comment", description: e?.message, variant: "destructive" }),
  });

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setText(v);
    const cursor = e.target.selectionStart ?? v.length;
    const m = v.slice(0, cursor).match(/(?:^|\s)@([\w'-]*)$/);
    setQuery(m ? { q: m[1] ?? "", start: cursor - (m[1]?.length ?? 0) - 1 } : null);
  };

  const pick = (u: TeamUserOption) => {
    if (!query) return;
    const cursor = ref.current?.selectionStart ?? text.length;
    const inserted = `@${u.name} `;
    const next = `${text.slice(0, query.start)}${inserted}${text.slice(cursor)}`;
    setText(next);
    setMentions((m) => (m.some((x) => x.id === u.id) ? m : [...m, u]));
    setQuery(null);
    requestAnimationFrame(() => {
      const pos = query.start + inserted.length;
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
    });
  };

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    // Only people whose @name is still in the text.
    const ids = mentions.filter((m) => t.includes(`@${m.name}`)).map((m) => m.id);
    commentMutation.mutate({ text: t, mentions: ids });
  };

  return (
    <div className="space-y-3">
      <SectionLabel>History</SectionLabel>
      <ol className="space-y-2.5" data-testid="drawer-history">
        {events.length === 0 && <li className="text-xs text-muted-foreground">No history yet</li>}
        {events.map((e) => (
          <li key={e.id} className="text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-foreground">
                <span className="font-semibold">{e.actorName || "Someone"}</span>{" "}
                {e.type === "comment" ? "commented" : describeEvent(e)}
              </span>
              <span className="text-[10px] text-muted-foreground flex-shrink-0">
                {format(new Date(e.createdAt), "d MMM, h:mma")}
              </span>
            </div>
            {e.type === "comment" && (
              <div className="mt-1 rounded-md bg-muted/40 px-2.5 py-1.5 text-[12px] text-foreground whitespace-pre-wrap">
                {e.data?.text}
              </div>
            )}
            {e.type === "transition" && e.data?.note && (
              <div className="mt-1 rounded-md bg-[hsl(var(--coral-bg))] px-2.5 py-1.5 text-[12px] text-foreground whitespace-pre-wrap">
                {e.data.note}
              </div>
            )}
          </li>
        ))}
      </ol>

      <div className="relative">
        <Textarea
          ref={ref}
          value={text}
          onChange={onChange}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
          }}
          rows={2}
          placeholder="Add a comment… use @ to mention a teammate"
          className="text-sm pr-10"
          data-testid="drawer-comment-input"
        />
        <Button
          size="icon"
          variant="ghost"
          className="absolute right-1.5 bottom-1.5 h-7 w-7"
          disabled={!text.trim() || commentMutation.isPending}
          onClick={submit}
          data-testid="drawer-comment-send"
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
        {candidates.length > 0 && (
          <div className="absolute left-0 bottom-full mb-1 w-56 rounded-md border border-border bg-popover shadow-md z-50 py-1">
            {candidates.map((u) => (
              <button
                key={u.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(u); }}
                className="w-full text-left px-2.5 py-1.5 text-xs hover-elevate"
                data-testid={`mention-option-${u.id}`}
              >
                {u.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
