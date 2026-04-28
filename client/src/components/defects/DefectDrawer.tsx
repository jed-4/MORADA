import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, Trash2, Image as ImageIcon } from "lucide-react";
import { format } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Defect } from "@shared/schema";
import { useDefectStatusOptions } from "@/hooks/useDefectStatusOptions";
import { useDefectPriorityOptions } from "@/hooks/useDefectPriorityOptions";
import { useDefectTypeOptions } from "@/hooks/useDefectTypeOptions";
import { useDefectTradeOptions } from "@/hooks/useDefectTradeOptions";
import {
  statusBadgeClass,
  priorityBadgeClass,
  statusLabel,
  priorityLabel,
} from "./defectStyles";

interface DefectDrawerProps {
  defect: Defect | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (defect: Defect) => void;
}

export function DefectDrawer({ defect, open, onOpenChange, onDelete }: DefectDrawerProps) {
  const { toast } = useToast();
  const { statusOptions } = useDefectStatusOptions();
  const { priorityOptions } = useDefectPriorityOptions();
  const { typeOptions } = useDefectTypeOptions();
  const tradeOptions = useDefectTradeOptions();

  const [draft, setDraft] = useState<Partial<Defect>>({});

  useEffect(() => {
    if (defect) {
      setDraft({
        title: defect.title,
        description: defect.description ?? "",
        location: defect.location ?? "",
        status: defect.status,
        priority: defect.priority,
        type: defect.type,
        trade: defect.trade ?? "",
      });
    }
  }, [defect]);

  const updateMutation = useMutation({
    mutationFn: async (payload: Partial<Defect>) => {
      if (!defect) return null;
      return apiRequest(`/api/defects/${defect.id}`, "PATCH", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/defects"] });
      toast({ title: "Saved", description: "Defect updated" });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save defect", variant: "destructive" });
    },
  });

  if (!defect) return null;

  const attachments = (defect.attachments as Array<{ url: string; name: string }>) || [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[480px] sm:max-w-[480px] p-0 flex flex-col gap-0"
      >
        {/* Header */}
        <SheetHeader className="px-5 py-4 border-b border-border flex-row items-start justify-between gap-3 space-y-0">
          <div className="flex-1 min-w-0">
            <SheetTitle className="text-base font-semibold text-foreground line-clamp-2 text-left">
              {defect.title}
            </SheetTitle>
            <div className="mt-2 flex items-center gap-1.5">
              <span
                className={`inline-flex items-center rounded text-[10px] font-medium px-1.5 py-0.5 ${statusBadgeClass(
                  defect.status,
                )}`}
                data-testid="drawer-status-badge"
              >
                {statusLabel(defect.status, statusOptions)}
              </span>
              <span
                className={`inline-flex items-center rounded text-[10px] font-medium px-1.5 py-0.5 ${priorityBadgeClass(
                  defect.priority,
                )}`}
                data-testid="drawer-priority-badge"
              >
                {priorityLabel(defect.priority, priorityOptions)}
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 -mt-1 -mr-1"
            onClick={() => onOpenChange(false)}
            data-testid="drawer-close"
          >
            <X className="h-4 w-4" />
          </Button>
        </SheetHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Status pills */}
          <div className="space-y-2">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
              Status
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {statusOptions.map((opt) => {
                const active = (draft.status ?? defect.status) === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setDraft((d) => ({ ...d, status: opt.key }))}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                      active
                        ? `${statusBadgeClass(opt.key)} border-transparent`
                        : "bg-card border-border text-muted-foreground hover-elevate"
                    }`}
                    data-testid={`drawer-status-${opt.key}`}
                  >
                    {opt.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Priority pills */}
          <div className="space-y-2">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
              Priority
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {priorityOptions.map((opt) => {
                const active = (draft.priority ?? defect.priority) === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setDraft((d) => ({ ...d, priority: opt.key }))}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
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

          {/* Type / Trade */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                Type
              </Label>
              <Select
                value={draft.type ?? defect.type}
                onValueChange={(v) => setDraft((d) => ({ ...d, type: v }))}
              >
                <SelectTrigger className="h-9" data-testid="drawer-type-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((opt) => (
                    <SelectItem key={opt.key} value={opt.key}>
                      {opt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                Trade
              </Label>
              <Select
                value={draft.trade || "__none__"}
                onValueChange={(v) =>
                  setDraft((d) => ({ ...d, trade: v === "__none__" ? "" : v }))
                }
              >
                <SelectTrigger className="h-9" data-testid="drawer-trade-select">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {tradeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
              Location
            </Label>
            <Input
              value={draft.location ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
              placeholder="e.g. Master bedroom"
              className="h-9"
              data-testid="drawer-location"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
              Description
            </Label>
            <Textarea
              value={draft.description ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="What's the issue?"
              rows={4}
              className="text-sm"
              data-testid="drawer-description"
            />
          </div>

          {/* Photos */}
          <div className="space-y-2">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
              Photos ({attachments.length})
            </Label>
            {attachments.length === 0 ? (
              <div className="flex items-center justify-center h-20 rounded-md border border-dashed border-border text-xs text-muted-foreground">
                <ImageIcon className="h-4 w-4 mr-1.5" />
                No photos attached
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {attachments.map((a, i) => (
                  <a
                    key={i}
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block aspect-square rounded-md overflow-hidden border border-border hover-elevate"
                  >
                    <img src={a.url} alt={a.name} className="w-full h-full object-cover" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Dates / Assignee */}
          <div className="grid grid-cols-2 gap-3 text-[11px] text-muted-foreground">
            <div>
              <div className="uppercase tracking-wide font-semibold mb-1">Reported</div>
              <div className="text-foreground">
                {defect.dateIdentified
                  ? format(new Date(defect.dateIdentified), "MMM d, yyyy")
                  : "—"}
              </div>
            </div>
            <div>
              <div className="uppercase tracking-wide font-semibold mb-1">Resolved</div>
              <div className="text-foreground">
                {defect.dateResolved
                  ? format(new Date(defect.dateResolved), "MMM d, yyyy")
                  : "—"}
              </div>
            </div>
            <div className="col-span-2">
              <div className="uppercase tracking-wide font-semibold mb-1">Assigned to</div>
              <div className="text-foreground">{defect.assignedContactName || "Unassigned"}</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <Button
            variant="ghost"
            onClick={() => onDelete(defect)}
            className="text-[hsl(var(--coral))] hover:text-[hsl(var(--coral))]"
            data-testid="drawer-delete"
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Delete
          </Button>
          <Button
            onClick={() => updateMutation.mutate(draft)}
            disabled={updateMutation.isPending}
            data-testid="drawer-save"
          >
            {updateMutation.isPending ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
