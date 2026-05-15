import { useState, useEffect } from "react";
import { BUILDPRO_PALETTE_HEXES } from '@/lib/colors';
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { FocusBlock, InsertFocusBlock, FieldCategoryWithOptions } from "@shared/schema";

interface Project {
  id: string;
  name: string;
}

interface FocusBlockCreatorProps {
  open: boolean;
  onClose?: () => void;
  onOpenChange?: (open: boolean) => void;
  onCreated?: () => void;
  editBlock?: FocusBlock | null;
}


const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function FocusBlockCreator({ open, onClose, onOpenChange, onCreated, editBlock }: FocusBlockCreatorProps) {
  const closeDialog = () => {
    onClose?.();
    onOpenChange?.(false);
  };
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [color, setColor] = useState(BUILDPRO_PALETTE_HEXES[0]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("11:00");
  const [isRecurring, setIsRecurring] = useState(false);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5]);
  const [specificDate, setSpecificDate] = useState("");
  const [categoryType, setCategoryType] = useState<"project" | "business" | "tag" | "general">("general");
  const [categoryId, setCategoryId] = useState<string>("");

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: fieldCategories = [] } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });
  const labelCategory = fieldCategories.find((c) => c.key === "task.labels");
  const labelOptions = (labelCategory?.options || []).filter((o) => o.isActive);

  useEffect(() => {
    if (editBlock) {
      setTitle(editBlock.title);
      setColor(editBlock.color);
      setStartTime(editBlock.startTime);
      setEndTime(editBlock.endTime);
      setIsRecurring(editBlock.isRecurring);
      setDaysOfWeek((editBlock.daysOfWeek as number[]) || [1, 2, 3, 4, 5]);
      setSpecificDate(editBlock.specificDate || "");
      setCategoryType((editBlock.categoryType as "project" | "business" | "tag" | "general") || "general");
      setCategoryId(editBlock.categoryId || "");
    } else {
      setTitle("");
      setColor(BUILDPRO_PALETTE_HEXES[0]);
      setStartTime("09:00");
      setEndTime("11:00");
      setIsRecurring(false);
      setDaysOfWeek([1, 2, 3, 4, 5]);
      setSpecificDate("");
      setCategoryType("general");
      setCategoryId("");
    }
  }, [editBlock, open]);

  const createMutation = useMutation({
    mutationFn: (data: Partial<InsertFocusBlock>) => apiRequest("/api/focus-blocks", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/focus-blocks"] });
      toast({ title: "Focus block created" });
      onCreated?.();
      closeDialog();
    },
    onError: () => toast({ title: "Failed to create focus block", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<InsertFocusBlock>) => apiRequest(`/api/focus-blocks/${editBlock!.id}`, "PATCH", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/focus-blocks"] });
      toast({ title: "Focus block updated" });
      onCreated?.();
      closeDialog();
    },
    onError: () => toast({ title: "Failed to update focus block", variant: "destructive" }),
  });

  const handleSave = () => {
    if (!title.trim()) {
      toast({ title: "Please enter a block name", variant: "destructive" });
      return;
    }
    if (!isRecurring && !specificDate) {
      toast({ title: "Please select a date for the one-off block", variant: "destructive" });
      return;
    }
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    if (eh * 60 + em <= sh * 60 + sm) {
      toast({ title: "End time must be after start time", variant: "destructive" });
      return;
    }

    const data: Partial<InsertFocusBlock> = {
      title: title.trim(),
      color,
      startTime,
      endTime,
      isRecurring,
      daysOfWeek: isRecurring ? daysOfWeek : [],
      specificDate: isRecurring ? null : specificDate,
      categoryType,
      categoryId: (categoryType === "project" || categoryType === "tag") ? (categoryId || null) : null,
      pinnedTaskIds: editBlock?.pinnedTaskIds as string[] || [],
    };

    if (editBlock) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const toggleDay = (day: number) => {
    setDaysOfWeek(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && closeDialog()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editBlock ? "Edit Focus Block" : "New Focus Block"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Block Name</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Project Management"
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Color</Label>
            <div className="flex gap-2 flex-wrap">
              {BUILDPRO_PALETTE_HEXES.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    "w-6 h-6 rounded-full border-2 transition-all",
                    color === c ? "border-foreground scale-110" : "border-transparent"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                type="color"
                value={color?.match(/^#[0-9A-Fa-f]{6}$/) ? color : '#a890d4'}
                onChange={e => setColor(e.target.value)}
                className="w-6 h-6 rounded-full border border-black/10 cursor-pointer p-0.5 bg-transparent"
              />
              <span className="text-xs text-muted-foreground">Custom colour</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Start Time</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">End Time</Label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs font-medium">Recurring</Label>
              <p className="text-data text-muted-foreground">Repeat on selected days</p>
            </div>
            <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
          </div>

          {isRecurring ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Days of Week</Label>
              <div className="flex gap-1.5">
                {DAY_LABELS.map((day, idx) => (
                  <button
                    key={idx}
                    onClick={() => toggleDay(idx)}
                    className={cn(
                      "w-8 h-8 rounded-full text-table font-medium border transition-all",
                      daysOfWeek.includes(idx)
                        ? "text-white border-transparent"
                        : "border-border text-muted-foreground"
                    )}
                    style={daysOfWeek.includes(idx) ? { backgroundColor: color } : undefined}
                  >
                    {day[0]}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={specificDate}
                onChange={(e) => setSpecificDate(e.target.value)}
                className="h-9"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Link to</Label>
            <Select value={categoryType} onValueChange={(v) => {
              setCategoryType(v as "project" | "business" | "tag" | "general");
              setCategoryId("");
            }}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General (all my unscheduled tasks)</SelectItem>
                <SelectItem value="project">Specific Project</SelectItem>
                <SelectItem value="business">Business Tasks</SelectItem>
                <SelectItem value="tag">By Label</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {categoryType === "project" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Project</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {categoryType === "tag" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Label</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="h-9" data-testid="select-focus-block-label">
                  <SelectValue placeholder={labelOptions.length === 0 ? "No labels configured in Settings" : "Select a label"} />
                </SelectTrigger>
                <SelectContent>
                  {labelOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: opt.color || "#6b7280" }}
                        />
                        {opt.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {labelOptions.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Add labels under Settings → Field Settings → Task Labels.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={closeDialog} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving..." : editBlock ? "Update" : "Create Block"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
