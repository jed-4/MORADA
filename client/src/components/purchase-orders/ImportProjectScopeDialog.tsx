import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type { ScopeItem } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// A shared empty list: `data = []` would be a new array every render, and the
// tick-seeding effect below would then run forever.
const NO_ITEMS: ScopeItem[] = [];

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The picked items as scope text: one heading per stage, then each item's
 *  title and its own description (already rich text). */
export function scopeItemsToHtml(items: Pick<ScopeItem, "stage" | "title" | "description">[]): string {
  const byStage = new Map<string, typeof items>();
  for (const item of items) {
    const list = byStage.get(item.stage) ?? [];
    list.push(item);
    byStage.set(item.stage, list);
  }
  let html = "";
  byStage.forEach((stageItems, stage) => {
    html += `<h3>${escapeHtml(stage)}</h3>`;
    for (const item of stageItems) {
      html += `<p><strong>${escapeHtml(item.title)}</strong></p>`;
      if (item.description && item.description.replace(/<[^>]*>/g, "").trim()) html += item.description;
    }
  });
  return html;
}

/**
 * Pick items from the project's Scope page to add to this PO's scope of work.
 * Items on the PO's own cost codes start ticked. Adds to what's there; never
 * replaces it.
 */
export function ImportProjectScopeDialog({
  open,
  onOpenChange,
  projectId,
  poCostCodeIds,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null | undefined;
  poCostCodeIds: string[];
  onImport: (html: string, count: number) => void;
}) {
  const { data: items = NO_ITEMS, isLoading } = useQuery<ScopeItem[]>({
    queryKey: [`/api/projects/${projectId}/scope`],
    enabled: open && !!projectId,
  });

  // Stage order as it first appears, then each item's own order.
  const ordered = useMemo(() => {
    const stageOrder = new Map<string, number>();
    items.forEach((i) => { if (!stageOrder.has(i.stage)) stageOrder.set(i.stage, stageOrder.size); });
    return [...items]
      .filter((i) => i.title?.trim())
      .sort((a, b) => (stageOrder.get(a.stage)! - stageOrder.get(b.stage)!) || (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  }, [items]);

  // Seed the ticks once per opening, when the items arrive — not on every
  // render, which would also wipe the user's own ticks.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (!open) {
      setSeeded(false);
      return;
    }
    if (seeded || isLoading) return;
    const codes = new Set(poCostCodeIds);
    setPicked(new Set(ordered.filter((i) => i.costCodeId && codes.has(i.costCodeId)).map((i) => i.id)));
    setSeeded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isLoading, seeded]);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const stages = useMemo(() => {
    const out: { stage: string; items: ScopeItem[] }[] = [];
    for (const item of ordered) {
      const last = out[out.length - 1];
      if (last && last.stage === item.stage) last.items.push(item);
      else out.push({ stage: item.stage, items: [item] });
    }
    return out;
  }, [ordered]);

  const handleImport = () => {
    const chosen = ordered.filter((i) => picked.has(i.id));
    onImport(scopeItemsToHtml(chosen), chosen.length);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="dialog-import-scope">
        <DialogHeader>
          <DialogTitle>Add scope from the project</DialogTitle>
          <DialogDescription>
            Tick the scope items this order covers. They're added to the end of the PO's scope of work.
            Items on this PO's cost codes are ticked for you.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-y-auto -mx-1 px-1 space-y-3">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : stages.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4" data-testid="text-no-project-scope">
              This project has no scope items yet. Add them on the project's Scope page.
            </p>
          ) : (
            stages.map(({ stage, items: stageItems }) => (
              <div key={stage}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{stage}</p>
                <div className="space-y-0.5">
                  {stageItems.map((item) => (
                    // The label points at the box rather than wrapping it: a
                    // Radix checkbox inside a <label> gets two clicks and ends
                    // up where it started.
                    <div
                      key={item.id}
                      className="flex items-start gap-2 rounded-md px-2 py-1.5 hover-elevate"
                      data-testid={`scope-item-${item.id}`}
                    >
                      <Checkbox
                        id={`scope-item-cb-${item.id}`}
                        checked={picked.has(item.id)}
                        onCheckedChange={() => toggle(item.id)}
                        className="mt-0.5"
                      />
                      <label htmlFor={`scope-item-cb-${item.id}`} className="flex-1 min-w-0 cursor-pointer">
                        <span className="text-sm block truncate">{item.title}</span>
                        {item.costCodeTitle && (
                          <span className="text-[11px] text-muted-foreground">{item.costCodeTitle}</span>
                        )}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={picked.size === 0} data-testid="button-confirm-import-scope">
            Add {picked.size || ""} item{picked.size === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
