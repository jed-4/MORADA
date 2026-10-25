import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2 } from "lucide-react";
import type { TakeoffMeasurement, TakeoffCategory } from "@shared/schema";

export type TemplateItem = {
  name: string;
  measurementType: "area" | "linear" | "count" | "manual";
  color: string;
  categoryName: string | null;
  multiplier: number;
  wastePercent: number;
  /** Wall height in mm for a linear item, or null/absent for a plain run. */
  heightMm?: number | null;
  /**
   * How the item is DRAWN. These were missing, so a template restored an item's
   * colour but reset its fill, line style and line weight to the schema
   * defaults — the template looked right in the list and wrong on the plan.
   *
   * Optional because templates saved before this carry none of them; absent
   * means "the default", which is exactly what those templates produced.
   */
  fillPattern?: string;
  lineType?: string;
  lineSize?: number;
  /**
   * The unit as it was. Previously re-derived from measurementType on apply,
   * which silently overwrote anything hand-set on the original item.
   */
  unit?: string;
};
export type Template = {
  id: string;
  name: string;
  items: TemplateItem[];
};

interface SaveProps {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  measurements: TakeoffMeasurement[];
  categories: TakeoffCategory[];
}

export function SaveTemplateModal({ open, onOpenChange, measurements, categories }: SaveProps) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Read through the take-off templates route, which is the same blob the
  // management page uses. Reading company-settings here instead put the two
  // surfaces on different cache keys, so a template edited on one looked stale
  // on the other until a reload.
  const { data: existingData } = useQuery<Template[]>({ queryKey: ["/api/takeoff-templates"] });
  const existing: Template[] = existingData ?? [];

  useEffect(() => {
    if (open) {
      setName("");
      setSelected(new Set(measurements.map((m) => m.id)));
    }
  }, [open, measurements]);

  const save = useMutation({
    mutationFn: async () => {
      const items: TemplateItem[] = measurements
        .filter((m) => selected.has(m.id))
        .map((m) => ({
          name: m.name,
          measurementType: m.measurementType as TemplateItem["measurementType"],
          color: m.color,
          categoryName: m.categoryId ? categories.find((c) => c.id === m.categoryId)?.name ?? null : null,
          multiplier: m.multiplier ?? 1,
          wastePercent: m.wastePercent ?? 0,
          // The height is part of what the item IS, so it travels with it.
          heightMm: (m as { heightMm?: number | null }).heightMm ?? null,
          // So does how it looks on the plan.
          fillPattern: m.fillPattern,
          lineType: m.lineType,
          lineSize: m.lineSize,
          unit: m.unit,
        }));
      // The server appends under its own read of the array. Building the next
      // array HERE meant anything saved by someone else since this dialog
      // opened was overwritten on save.
      return await apiRequest("/api/takeoff-templates", "POST", { name: name.trim(), items });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/takeoff-templates"] });
      toast({ title: "Template saved" });
      onOpenChange(false);
    },
    onError: (e: any) => {
      toast({ title: "Save failed", description: e?.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    if (!name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (selected.size === 0) {
      toast({ title: "Pick at least one measurement", variant: "destructive" });
      return;
    }
    save.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save as template</DialogTitle>
          <DialogDescription>
            Save these measurements as a reusable template for other projects.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="Template name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="input-template-name"
          />
          <ScrollArea className="h-72 border border-border rounded-md p-2">
            {measurements.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">
                No measurements yet on this project.
              </div>
            ) : (
              measurements.map((m) => (
                <label
                  key={m.id}
                  className="flex items-center gap-2 py-1.5 px-1 hover-elevate rounded-sm cursor-pointer"
                >
                  <Checkbox
                    checked={selected.has(m.id)}
                    onCheckedChange={(c) => {
                      const next = new Set(selected);
                      if (c) next.add(m.id);
                      else next.delete(m.id);
                      setSelected(next);
                    }}
                  />
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: m.color }} />
                  <span className="text-sm flex-1 truncate">{m.name}</span>
                  <span className="text-xs text-muted-foreground">{m.measurementType}</span>
                </label>
              ))
            )}
          </ScrollArea>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={save.isPending} data-testid="button-save-template">
            Save template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface LoadProps {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  projectId: string;
  plans: { id: string }[];
  categories: TakeoffCategory[];
  targetPageNumber?: number;
  onSuccess?: () => void;
}

export function LoadTemplateModal({ open, onOpenChange, projectId, plans, categories, targetPageNumber = 1, onSuccess }: LoadProps) {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Read through the take-off templates route, which is the same blob the
  // management page uses. Reading company-settings here instead put the two
  // surfaces on different cache keys, so a template edited on one looked stale
  // on the other until a reload.
  const { data: existingData } = useQuery<Template[]>({ queryKey: ["/api/takeoff-templates"] });
  const existing: Template[] = existingData ?? [];
  const selected = existing.find((t) => t.id === selectedId);

  const apply = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Pick a template");
      if (plans.length === 0) throw new Error("This project has no plans yet — upload a plan first.");
      const targetPlanId = plans[0].id;
      // Ensure the target page row exists (lazy upsert via server route).
      const page = await apiRequest(
        `/api/projects/${projectId}/takeoff/plans/${targetPlanId}/pages`,
        "POST",
        { pageNumber: targetPageNumber },
      );
      // Pre-fetch existing categories to match by name.
      const existingCats = new Map<string, string>();
      categories.forEach((c) => existingCats.set(c.name.toLowerCase(), c.id));

      /* ORDER. Both takeoff_categories and takeoff_measurements have an
         `order` column that this path never set, so everything arrived at 0
         and the take-off fell back to createdAt — the insert order, which is
         near enough right but is not the template's order, and ties whenever
         two rows share a timestamp.

         The template's array IS the order: the management page arranges
         categories and items by moving them within it. So both are numbered
         from that, and the categories a template brings start AFTER whatever
         the project already has rather than renumbering it — applying a
         template must not rearrange categories the builder already made. */
      let nextCategoryOrder =
        categories.reduce((max, c) => Math.max(max, (c as { order?: number }).order ?? 0), -1) + 1;
      let nextMeasurementOrder = 0;

      for (const item of selected.items) {
        let categoryId: string | null = null;
        if (item.categoryName) {
          const key = item.categoryName.toLowerCase();
          if (existingCats.has(key)) {
            categoryId = existingCats.get(key)!;
          } else {
            const cat = await apiRequest(
              `/api/projects/${projectId}/takeoff/categories`,
              "POST",
              { name: item.categoryName, order: nextCategoryOrder++ },
            );
            existingCats.set(key, cat.id);
            categoryId = cat.id;
          }
        }
        await apiRequest(`/api/projects/${projectId}/takeoff/measurements`, "POST", {
          planId: targetPlanId,
          pageId: page.id,
          order: nextMeasurementOrder++,
          categoryId,
          name: item.name,
          measurementType: item.measurementType,
          color: item.color,
          geometry: [],
          quantity: 0,
          // The saved unit wins; the derivation is the fallback for templates
          // that predate it.
          unit:
            item.unit ??
            (item.measurementType === "area" || (item.measurementType === "linear" && item.heightMm)
              ? "m²"
              : item.measurementType === "linear" ? "lm"
              : item.measurementType === "count" ? "each" : ""),
          heightMm: item.heightMm ?? null,
          multiplier: item.multiplier,
          wastePercent: item.wastePercent,
          // Omitted on a template saved before these were captured; the server
          // then applies the same defaults it always did.
          ...(item.fillPattern ? { fillPattern: item.fillPattern } : {}),
          ...(item.lineType ? { lineType: item.lineType } : {}),
          ...(item.lineSize ? { lineSize: item.lineSize } : {}),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "takeoff/measurements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "takeoff/categories"] });
      toast({ title: "Template applied" });
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (e: any) => {
      toast({ title: "Apply failed", description: e?.message, variant: "destructive" });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      await apiRequest(`/api/takeoff-templates/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/takeoff-templates"] });
      setSelectedId(null);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Load template</DialogTitle>
          <DialogDescription>
            Apply a saved set of measurements to this project.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 min-h-[300px]">
          <ScrollArea className="border border-border rounded-md p-1">
            {existing.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">
                No templates saved yet.
              </div>
            ) : (
              existing.map((t) => (
                <div
                  key={t.id}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer ${selectedId === t.id ? "bg-primary/10" : "hover-elevate"}`}
                  onClick={() => setSelectedId(t.id)}
                  data-testid={`template-row-${t.id}`}
                >
                  <span className="text-sm flex-1 truncate">{t.name}</span>
                  <span className="text-xs text-muted-foreground">{t.items.length}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={(e) => { e.stopPropagation(); remove.mutate(t.id); }}
                    aria-label="Delete template"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              ))
            )}
          </ScrollArea>
          <ScrollArea className="border border-border rounded-md p-2">
            {selected ? (
              selected.items.map((it, i) => (
                <div key={i} className="flex items-center gap-2 py-1">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: it.color }} />
                  <span className="text-sm flex-1 truncate">{it.name}</span>
                  <span className="text-xs text-muted-foreground">{it.measurementType}</span>
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground text-center py-6">
                Select a template to preview its items.
              </div>
            )}
          </ScrollArea>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => apply.mutate()}
            disabled={!selected || apply.isPending}
            data-testid="button-apply-template"
          >
            Apply to project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
