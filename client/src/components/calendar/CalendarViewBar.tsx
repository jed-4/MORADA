import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ChevronDown, Pencil, Plus, Trash2, Users, Check, RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { CalendarView } from "@/components/SavedViews";

/**
 * The saved-view tabs for BOTH calendars (personal and business used to carry
 * a copy each, and the copies had drifted: the business "save changes" handler
 * was never wired to a button, and the personal "+" saved OVER the current
 * view instead of making a new one).
 *
 * The model: set the calendar up how you want it, then save it.
 *  - Change anything and the tab shows a dot, with Save / Discard.
 *  - "+" saves what's on screen as a NEW view.
 *  - Rename / share / delete live in the tab's menu — owner only.
 *  - The default view can't be saved over (Save as new instead); the company
 *    default business view is admin-only, and never deletable.
 */

export interface CalendarViewSnapshot {
  filters: Record<string, unknown>;
  calendarMode: string;
}

interface Props {
  calendarType: "personal" | "business";
  views: CalendarView[];
  selectedViewId?: string;
  currentUserId?: string;
  isAdmin?: boolean;
  isDirty: boolean;
  /** What's on screen now — saved by Save and by "+". */
  getCurrent: () => CalendarViewSnapshot;
  onSelect: (view: CalendarView) => void;
  /** Put the selected view's saved settings back on screen. */
  onDiscard: () => void;
  /** A view was saved from the screen (new or updated) — select it and rebaseline. */
  onSaved: (view: CalendarView) => void;
  /** Business only: people a view can be shared with. Omit to hide sharing. */
  shareable?: { id: string; name: string }[];
}

const isBaseView = (v?: CalendarView | null) => !!v && (v.isDefault || !!(v as any).isCompanyDefault);

export function canEditCalendarView(v: CalendarView | undefined, userId?: string, isAdmin?: boolean) {
  if (!v) return false;
  if ((v as any).isCompanyDefault) return !!isAdmin;
  return v.userId === userId;
}

export function CalendarViewBar({
  calendarType,
  views,
  selectedViewId,
  currentUserId,
  isAdmin,
  isDirty,
  getCurrent,
  onSelect,
  onDiscard,
  onSaved,
  shareable,
}: Props) {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editView, setEditView] = useState<CalendarView | null>(null);
  const [deleteView, setDeleteView] = useState<CalendarView | null>(null);
  const [name, setName] = useState("");
  const [sharedWith, setSharedWith] = useState<string[]>([]);

  const current = views.find((v) => v.id === selectedViewId);
  // The personal "All Events" is the starting point, not something to save
  // over; the company default is, but only by an admin.
  const canSaveOverCurrent =
    !!current && canEditCalendarView(current, currentUserId, isAdmin) &&
    (!isBaseView(current) || ((current as any).isCompanyDefault && isAdmin));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/calendar-views", calendarType] });
  const errMsg = (e: any) => e?.payload?.error || e?.message || "Please try again";

  const createMutation = useMutation({
    mutationFn: async () => {
      const snap = getCurrent();
      return apiRequest("/api/calendar-views", "POST", {
        name: name.trim(),
        calendarType,
        filters: snap.filters,
        calendarMode: snap.calendarMode,
        ...(shareable ? { sharedWith } : {}),
      });
    },
    onSuccess: (view: any) => {
      invalidate();
      setCreateOpen(false);
      onSaved(view);
      toast({ title: "View saved", description: `"${view.name}" is saved with what's on screen.` });
    },
    onError: (e) => toast({ title: "Couldn't save the view", description: errMsg(e), variant: "destructive" }),
  });

  const saveCurrentMutation = useMutation({
    mutationFn: async () => {
      const snap = getCurrent();
      return apiRequest(`/api/calendar-views/${current!.id}`, "PATCH", {
        filters: snap.filters,
        calendarMode: snap.calendarMode,
      });
    },
    onSuccess: (view: any) => {
      invalidate();
      onSaved(view);
      toast({ title: "View updated", description: `"${view.name}" now shows what's on screen.` });
    },
    onError: (e) => toast({ title: "Couldn't save the view", description: errMsg(e), variant: "destructive" }),
  });

  // Rename / share only — it does NOT take the screen's filters. Editing the
  // name used to quietly overwrite the view's filters too.
  const editMutation = useMutation({
    mutationFn: async () =>
      apiRequest(`/api/calendar-views/${editView!.id}`, "PATCH", {
        name: name.trim(),
        ...(shareable ? { sharedWith } : {}),
      }),
    onSuccess: () => {
      invalidate();
      setEditView(null);
      toast({ title: "View updated" });
    },
    onError: (e) => toast({ title: "Couldn't update the view", description: errMsg(e), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => apiRequest(`/api/calendar-views/${deleteView!.id}`, "DELETE"),
    onSuccess: () => {
      const removed = deleteView!;
      invalidate();
      setDeleteView(null);
      if (removed.id === selectedViewId) {
        const fallback = views.find((v) => v.id !== removed.id && isBaseView(v)) ?? views.find((v) => v.id !== removed.id);
        if (fallback) onSelect(fallback);
      }
      toast({ title: "View deleted", description: `"${removed.name}" has been removed.` });
    },
    onError: (e) => toast({ title: "Couldn't delete the view", description: errMsg(e), variant: "destructive" }),
  });

  const openCreate = () => { setName(""); setSharedWith([]); setCreateOpen(true); };
  const openEdit = (v: CalendarView) => {
    setName(v.name);
    setSharedWith(Array.isArray(v.sharedWith) ? v.sharedWith : []);
    setEditView(v);
  };

  const renderShare = () => {
    if (!shareable) return null;
    const people = shareable.filter((p) => p.id !== currentUserId);
    return (
      <div className="grid gap-2">
        <Label>Share with</Label>
        <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-md border p-2">
          {people.length === 0 && <p className="text-xs text-muted-foreground">No one else on the team yet.</p>}
          {people.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-2">
              <Checkbox
                checked={sharedWith.includes(p.id)}
                onCheckedChange={() =>
                  setSharedWith((cur) => (cur.includes(p.id) ? cur.filter((id) => id !== p.id) : [...cur, p.id]))
                }
                data-testid={`share-with-${p.id}`}
              />
              <span className="text-xs">{p.name}</span>
            </label>
          ))}
        </div>
        <p className="text-data text-muted-foreground">
          Everyone already sees the company's default view. This shares this one on top of it.
        </p>
      </div>
    );
  };

  return (
    <div className="flex items-center gap-0.5 min-w-0" data-testid="tabs-calendar-views">
      <div className="flex items-center gap-0.5 min-w-0 overflow-x-auto">
        {views.map((view) => {
          const selected = view.id === selectedViewId;
          const mine = canEditCalendarView(view, currentUserId, isAdmin);
          const shared = !!currentUserId && view.userId !== currentUserId && !(view as any).isCompanyDefault;
          return (
            <div key={view.id} className="flex items-center flex-shrink-0">
              <button
                onClick={() => onSelect(view)}
                className={`relative h-9 px-2 text-xs flex items-center gap-1 transition-colors ${
                  selected ? "text-primary font-medium" : "text-muted-foreground hover:text-foreground"
                }`}
                title={shared ? "Shared with you" : undefined}
                data-testid={`tab-${view.id}`}
              >
                {shared && <Users className="h-3 w-3" />}
                <span>{view.name}</span>
                {selected && isDirty && (
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" title="Changed since it was saved" data-testid="view-dirty-dot" />
                )}
                {selected && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
              </button>
              {selected && mine && !isBaseView(view) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="h-5 px-0.5 text-primary hover:text-primary/80 flex items-center" data-testid={`button-view-options-${view.id}`}>
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => openEdit(view)} data-testid={`menu-edit-${view.id}`}>
                      <Pencil className="h-3 w-3 mr-2" />
                      {shareable ? "Rename & share" : "Rename"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDeleteView(view)} className="text-destructive" data-testid={`menu-delete-${view.id}`}>
                      <Trash2 className="h-3 w-3 mr-2" />
                      Delete view
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          );
        })}
      </div>

      {isDirty && (
        <div className="flex items-center gap-0.5 ml-1 flex-shrink-0">
          {canSaveOverCurrent && (
            <button
              className="h-6 px-2 text-xs rounded-md bg-primary text-white hover:bg-primary/90 flex items-center gap-1"
              onClick={() => saveCurrentMutation.mutate()}
              disabled={saveCurrentMutation.isPending}
              title={`Save these settings to "${current?.name}"`}
              data-testid="button-save-view"
            >
              <Check className="w-3 h-3" />
              Save
            </button>
          )}
          <button
            className="h-6 px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1 text-muted-foreground"
            onClick={onDiscard}
            title="Put the view back how it was saved"
            data-testid="button-discard-view"
          >
            <RotateCcw className="w-3 h-3" />
            Discard
          </button>
        </div>
      )}

      <button
        className="h-6 w-6 ml-0.5 flex-shrink-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
        onClick={openCreate}
        title="Save what's on screen as a new view"
        data-testid="button-add-view"
      >
        <Plus className="w-3 h-3" />
      </button>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent data-testid="dialog-create-view">
          <DialogHeader>
            <DialogTitle>Save as a new view</DialogTitle>
            <DialogDescription>Saves the filters and the day / week / month setting you're looking at now.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="new-view-name">Name</Label>
              <Input
                id="new-view-name"
                autoFocus
                placeholder="e.g. My jobs this month"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) createMutation.mutate(); }}
                data-testid="input-view-name"
              />
            </div>
            {renderShare()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!name.trim() || createMutation.isPending} data-testid="button-confirm-create-view">
              {createMutation.isPending ? "Saving…" : "Save view"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editView} onOpenChange={(o) => !o && setEditView(null)}>
        <DialogContent data-testid="dialog-edit-view">
          <DialogHeader>
            <DialogTitle>{shareable ? "Rename & share" : "Rename view"}</DialogTitle>
            <DialogDescription>This doesn't change what the view shows — use Save for that.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-view-name">Name</Label>
              <Input
                id="edit-view-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) editMutation.mutate(); }}
                data-testid="input-edit-view-name"
              />
            </div>
            {renderShare()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditView(null)}>Cancel</Button>
            <Button onClick={() => editMutation.mutate()} disabled={!name.trim() || editMutation.isPending} data-testid="button-confirm-edit-view">
              {editMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteView} onOpenChange={(o) => !o && setDeleteView(null)}>
        <DialogContent data-testid="dialog-delete-view">
          <DialogHeader>
            <DialogTitle>Delete view</DialogTitle>
            <DialogDescription>
              Delete "{deleteView?.name}"?{deleteView && Array.isArray(deleteView.sharedWith) && deleteView.sharedWith.length > 0
                ? " It's shared, so it will go for the people you shared it with too." : ""} This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteView(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending} data-testid="button-confirm-delete-view">
              {deleteMutation.isPending ? "Deleting…" : "Delete view"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * A stable fingerprint of a calendar's settings, for "has this changed since
 * the view was applied". Empty arrays and unset values count as "not set";
 * dates compare by local day; array order doesn't matter.
 */
export function calendarSnapshotKey(filters: Record<string, unknown>, calendarMode: string): string {
  const norm = (v: unknown): unknown => {
    if (v === null || v === undefined || v === "") return undefined;
    if (v instanceof Date || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v))) {
      const d = v instanceof Date ? v : new Date(v);
      if (Number.isNaN(d.getTime())) return undefined;
      return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    }
    if (Array.isArray(v)) {
      const items = v.map(norm).filter((x) => x !== undefined).map((x) => JSON.stringify(x)).sort();
      return items.length ? items : undefined;
    }
    if (typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as object).sort()) {
        if (k === "eventTypesV") continue; // a format marker, not a setting
        const n = norm((v as any)[k]);
        if (n !== undefined) out[k] = n;
      }
      return Object.keys(out).length ? out : undefined;
    }
    return v;
  };
  return JSON.stringify({ f: norm(filters) ?? {}, m: calendarMode });
}

/** Last view opened on this calendar, per person — so the page reopens on it. */
export const lastViewStore = {
  key: (type: string, userId?: string) => `calendarLastView:${type}:${userId ?? "anon"}`,
  read(type: string, userId?: string): string | null {
    try { return localStorage.getItem(this.key(type, userId)); } catch { return null; }
  },
  write(type: string, userId: string | undefined, viewId: string) {
    try { localStorage.setItem(this.key(type, userId), viewId); } catch { /* private mode */ }
  },
};
