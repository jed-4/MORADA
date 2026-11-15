import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format, isBefore, startOfDay } from "date-fns";
import { Check, Plus, Trash2, Tag, ListChecks, CalendarClock, User, ShieldCheck, ListTodo, AlertTriangle, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { MORADA_PALETTE_HEXES } from "@/lib/colors";
import type { Doc, LibraryProperty } from "@shared/schema";

/**
 * Notion-style properties for Library documents (migration 0128), the simple
 * version: a company defines a few properties, each a SELECT (one choice) or
 * TAGS (several), with coloured options. Documents show them as chips under
 * the title; the Library filter can narrow by them.
 */

export const PROPS_KEY = ["/api/library-properties"];
export const useLibraryProperties = () => useQuery<LibraryProperty[]>({ queryKey: PROPS_KEY });

const newId = () => Math.random().toString(36).slice(2, 10);

export function OptionChip({ label, color, className }: { label: string; color: string; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium leading-none", className)}
      style={{ backgroundColor: `${color}26`, color }}
    >
      {label}
    </span>
  );
}

const valuesOf = (doc: Doc, p: LibraryProperty): string[] => {
  const v = (doc.properties ?? {})[p.id];
  return Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
};

/** The chips row under a document's title; editable when the doc is. */
export function DocPropertiesRow({ doc, editable, onSave }: {
  doc: Doc;
  editable: boolean;
  onSave: (properties: Record<string, string | string[]>) => void;
}) {
  const { data: props = [] } = useLibraryProperties();
  const shown = props.filter((p) => editable ? p.options.length > 0 : valuesOf(doc, p).length > 0);
  if (shown.length === 0) return null;

  const set = (p: LibraryProperty, next: string[]) => {
    const all = { ...(doc.properties ?? {}) } as Record<string, string | string[]>;
    if (p.kind === "select") { if (next[0]) all[p.id] = next[0]; else delete all[p.id]; }
    else all[p.id] = next;
    onSave(all);
  };

  return (
    <div className="flex flex-col gap-1.5 mb-4" data-testid="library-doc-properties">
      {shown.map((p) => {
        const vals = valuesOf(doc, p);
        const chips = vals
          .map((id) => p.options.find((o) => o.id === id))
          .filter((o): o is NonNullable<typeof o> => !!o);
        const body = (
          <div className="flex items-center gap-1 flex-wrap min-h-[22px]">
            {chips.length ? chips.map((o) => <OptionChip key={o.id} label={o.label} color={o.color} />)
              : <span className="text-xs text-muted-foreground/60">{editable ? "Empty" : "—"}</span>}
          </div>
        );
        return (
          <div key={p.id} className="flex items-start gap-3 text-xs" data-testid={`library-doc-prop-${p.id}`}>
            <span className="w-28 shrink-0 pt-1 text-muted-foreground flex items-center gap-1.5">
              {p.kind === "select" ? <ListChecks className="h-3 w-3" /> : <Tag className="h-3 w-3" />}
              <span className="truncate">{p.name}</span>
            </span>
            {editable ? (
              <Popover>
                <PopoverTrigger asChild>
                  <button className="rounded-md px-1.5 py-0.5 -ml-1.5 hover-elevate text-left" data-testid={`library-doc-prop-edit-${p.id}`}>{body}</button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-56 p-1">
                  {p.options.map((o) => {
                    const on = vals.includes(o.id);
                    return (
                      <button
                        key={o.id}
                        className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-left hover-elevate"
                        onClick={() => set(p, p.kind === "select" ? (on ? [] : [o.id]) : on ? vals.filter((x) => x !== o.id) : [...vals, o.id])}
                        data-testid={`library-prop-option-${o.id}`}
                      >
                        <span className="w-3.5 shrink-0">{on && <Check className="h-3.5 w-3.5 text-primary" />}</span>
                        <OptionChip label={o.label} color={o.color} />
                      </button>
                    );
                  })}
                </PopoverContent>
              </Popover>
            ) : body}
          </div>
        );
      })}
    </div>
  );
}

export const isReviewOverdue = (doc: Pick<Doc, "reviewDueAt">) =>
  !!doc.reviewDueAt && isBefore(new Date(doc.reviewDueAt), startOfDay(new Date()));

/**
 * What sets an SOP apart from other documents: who owns it, what was signed
 * off, when it's next due a look, and which tasks rely on it.
 */
export function SopStrip({ doc, editable, usedBy, onReviewDate }: {
  doc: Doc;
  editable: boolean;
  usedBy: number;
  onReviewDate: (d: Date | null) => void;
}) {
  const overdue = isReviewOverdue(doc);
  return (
    <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap mb-5 rounded-md border border-primary/15 bg-primary/5 px-3 py-2 text-xs" data-testid="library-sop-strip">
      <span className="flex items-center gap-1.5 text-muted-foreground"><User className="h-3 w-3" />{doc.ownerName || "No owner"}</span>
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <ShieldCheck className="h-3 w-3" />
        {doc.currentVersion > 0 && doc.approvedAt
          ? `v${doc.currentVersion} approved ${format(new Date(doc.approvedAt), "d MMM yyyy")}`
          : "Not approved yet"}
      </span>
      <span className={cn("flex items-center gap-1.5", overdue ? "text-[hsl(var(--status-danger-fg,var(--coral)))] font-medium" : "text-muted-foreground")} data-testid="library-sop-review">
        {overdue ? <AlertTriangle className="h-3 w-3" /> : <CalendarClock className="h-3 w-3" />}
        {editable ? (
          <span className="flex items-center gap-1">
            Review by
            <input
              type="date"
              className="bg-transparent border-b border-border/60 text-xs outline-none"
              value={doc.reviewDueAt ? format(new Date(doc.reviewDueAt), "yyyy-MM-dd") : ""}
              onChange={(e) => onReviewDate(e.target.value ? new Date(`${e.target.value}T00:00:00`) : null)}
              data-testid="library-sop-review-input"
            />
          </span>
        ) : doc.reviewDueAt ? (
          <>{overdue ? "Review overdue" : "Review by"} {format(new Date(doc.reviewDueAt), "d MMM yyyy")}</>
        ) : "No review date"}
      </span>
      <span className="flex items-center gap-1.5 text-muted-foreground"><ListTodo className="h-3 w-3" />Used by {usedBy} task{usedBy === 1 ? "" : "s"}</span>
    </div>
  );
}

/** Settings → Library and the Library's ⋮ menu: define properties (admins). */
export function LibraryPropertiesManager() {
  const { toast } = useToast();
  const { data: props = [], isLoading } = useLibraryProperties();
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<"select" | "tags">("select");
  const [optionDraft, setOptionDraft] = useState<Record<string, string>>({});
  const invalidate = () => queryClient.invalidateQueries({ queryKey: PROPS_KEY });
  const fail = (t: string) => (e: any) => toast({ title: t, description: e?.message, variant: "destructive" });

  const add = useMutation({
    mutationFn: () => apiRequest("/api/library-properties", "POST", { name: newName.trim(), kind: newKind, options: [], sortOrder: props.length }),
    onSuccess: () => { invalidate(); setNewName(""); },
    onError: fail("Couldn't add the property"),
  });
  const save = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<LibraryProperty> }) => apiRequest(`/api/library-properties/${id}`, "PATCH", data),
    onSuccess: invalidate,
    onError: fail("Couldn't save"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/library-properties/${id}`, "DELETE"),
    onSuccess: invalidate,
    onError: fail("Couldn't delete"),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-3" data-testid="library-properties-manager">
      {props.map((p) => (
        <div key={p.id} className="rounded-md border p-3 space-y-2" data-testid={`library-property-${p.id}`}>
          <div className="flex items-center gap-2">
            {p.kind === "select" ? <ListChecks className="h-3.5 w-3.5 text-muted-foreground" /> : <Tag className="h-3.5 w-3.5 text-muted-foreground" />}
            <Input
              defaultValue={p.name}
              className="h-7 text-sm flex-1"
              onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== p.name && save.mutate({ id: p.id, data: { name: e.target.value.trim() } })}
            />
            <span className="text-xs text-muted-foreground w-24">{p.kind === "select" ? "One choice" : "Several (tags)"}</span>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove.mutate(p.id)} title="Delete property">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {p.options.map((o) => (
              <span key={o.id} className="group inline-flex items-center gap-0.5">
                <Popover>
                  <PopoverTrigger asChild>
                    <button title="Change colour"><OptionChip label={o.label} color={o.color} /></button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2">
                    <div className="grid grid-cols-6 gap-1">
                      {MORADA_PALETTE_HEXES.map((hex) => (
                        <button
                          key={hex}
                          className={cn("h-5 w-5 rounded border", hex === o.color && "ring-2 ring-primary")}
                          style={{ backgroundColor: hex }}
                          onClick={() => save.mutate({ id: p.id, data: { options: p.options.map((x) => (x.id === o.id ? { ...x, color: hex } : x)) } })}
                        />
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <button
                  className="invisible group-hover:visible text-muted-foreground hover:text-destructive"
                  onClick={() => save.mutate({ id: p.id, data: { options: p.options.filter((x) => x.id !== o.id) } })}
                  title="Remove option"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <Input
              value={optionDraft[p.id] ?? ""}
              onChange={(e) => setOptionDraft((d) => ({ ...d, [p.id]: e.target.value }))}
              onKeyDown={(e) => {
                const label = (optionDraft[p.id] ?? "").trim();
                if (e.key !== "Enter" || !label) return;
                const color = MORADA_PALETTE_HEXES[p.options.length % MORADA_PALETTE_HEXES.length];
                save.mutate({ id: p.id, data: { options: [...p.options, { id: newId(), label, color }] } });
                setOptionDraft((d) => ({ ...d, [p.id]: "" }));
              }}
              placeholder="Add option, press Enter"
              className="h-6 w-44 text-xs"
              data-testid={`library-property-add-option-${p.id}`}
            />
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New property, e.g. Department" className="h-7 text-sm flex-1" data-testid="input-new-library-property" />
        <select value={newKind} onChange={(e) => setNewKind(e.target.value as any)} className="h-7 rounded-md border bg-background px-2 text-xs">
          <option value="select">One choice</option>
          <option value="tags">Several (tags)</option>
        </select>
        <Button size="sm" className="h-7" onClick={() => add.mutate()} disabled={!newName.trim() || add.isPending} data-testid="button-add-library-property">
          <Plus className="h-3.5 w-3.5 mr-1" />Add
        </Button>
      </div>
    </div>
  );
}
