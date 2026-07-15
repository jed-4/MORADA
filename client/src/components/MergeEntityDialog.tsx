import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Loader2 } from "lucide-react";
import type { CostCategory, CostCode } from "@shared/schema";

export type MergeEntityKind = "category" | "costCode";

type MergeEntityDialogProps = {
  kind: MergeEntityKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The source entity to merge (will be archived) */
  entity: CostCategory | CostCode | null;
};

const configs = {
  category: {
    dialogTestId: "dialog-merge-category",
    title: "Merge Cost Category",
    description:
      "Select the category to merge into. All cost codes from the source category will be moved to the target category.",
    sourceLabel: "Source Category (will be archived)",
    targetLabel: "Target Category (merge into)",
    targetSelectId: "target-category",
    targetSelectTestId: "select-target-category",
    selectPlaceholder: "Select a category",
    emptyOptionsText: "No available categories to merge into",
    optionTestIdPrefix: "option-category-",
    targetDetailsLabel: "Target Category Details",
    warningText:
      "All cost codes from the source category will be moved to the target category. The source category will be archived.",
    mergeUrl: "/api/cost-categories/merge",
    invalidateKeys: ["/api/cost-categories", "/api/cost-codes"],
    successToast: { title: "Categories merged", description: "The categories have been merged successfully." },
    errorDescription: "Failed to merge categories.",
    submitLabel: "Merge Categories",
  },
  costCode: {
    dialogTestId: "dialog-merge-cost-code",
    title: "Merge Cost Code",
    description:
      "Select the cost code to merge into. All references to the source cost code will be updated to use the target cost code.",
    sourceLabel: "Source Cost Code (will be archived)",
    targetLabel: "Target Cost Code (merge into)",
    targetSelectId: "target-code",
    targetSelectTestId: "select-target-code",
    selectPlaceholder: "Select a cost code",
    emptyOptionsText: "No available cost codes to merge into",
    optionTestIdPrefix: "option-code-",
    targetDetailsLabel: "Target Cost Code Details",
    warningText:
      "All estimates, bills, and other records using the source cost code will be updated to use the target cost code. The source cost code will be archived.",
    mergeUrl: "/api/cost-codes/merge",
    invalidateKeys: ["/api/cost-codes"],
    successToast: { title: "Cost codes merged", description: "The cost codes have been merged successfully." },
    errorDescription: "Failed to merge cost codes.",
    submitLabel: "Merge Cost Codes",
  },
} as const;

export default function MergeEntityDialog({ kind, open, onOpenChange, entity }: MergeEntityDialogProps) {
  const config = configs[kind];
  const { toast } = useToast();
  const [targetId, setTargetId] = useState<string>("");

  const { data: allCategories = [] } = useQuery<CostCategory[]>({
    queryKey: ["/api/cost-categories"],
  });

  const { data: allCodes = [] } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
  });

  const mergeMutation = useMutation({
    mutationFn: (data: { sourceId: string; targetId: string }) =>
      apiRequest(config.mergeUrl, "POST", data),
    onSuccess: () => {
      config.invalidateKeys.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: [key] });
      });
      toast({
        title: config.successToast.title,
        description: config.successToast.description,
      });
      handleClose();
    },
    onError: () => {
      toast({
        title: "Error",
        description: config.errorDescription,
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setTargetId("");
    onOpenChange(false);
  };

  const handleMerge = () => {
    if (!entity || !targetId) return;
    mergeMutation.mutate({
      sourceId: entity.id,
      targetId,
    });
  };

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return "Uncategorized";
    const category = allCategories.find((c) => c.id === categoryId);
    return category ? `${category.code} - ${category.title}` : "Unknown";
  };

  // Available targets to merge into (exclude the source and archived items)
  const availableItems: (CostCategory | CostCode)[] =
    kind === "category"
      ? allCategories.filter((cat) => cat.id !== entity?.id && cat.isActive)
      : allCodes.filter((code) => code.id !== entity?.id && !code.isArchived);

  const selectedTarget =
    kind === "category"
      ? allCategories.find((c) => c.id === targetId)
      : allCodes.find((c) => c.id === targetId);

  const detailLine = (item: CostCategory | CostCode) =>
    kind === "category"
      ? `${allCodes.filter((code) => code.categoryId === item.id).length} cost codes`
      : `Category: ${getCategoryName((item as CostCode).categoryId)}`;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl" data-testid={config.dialogTestId}>
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Source */}
          {entity && (
            <div className="space-y-2">
              <Label>{config.sourceLabel}</Label>
              <div className="p-3 bg-muted rounded-md">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{entity.code}</span>
                  <span className="text-muted-foreground">-</span>
                  <span>{entity.title}</span>
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {detailLine(entity)}
                </div>
              </div>
            </div>
          )}

          {/* Target Selection */}
          <div className="space-y-2">
            <Label htmlFor={config.targetSelectId}>{config.targetLabel}</Label>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger id={config.targetSelectId} data-testid={config.targetSelectTestId}>
                <SelectValue placeholder={config.selectPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {availableItems.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground">
                    {config.emptyOptionsText}
                  </div>
                ) : (
                  availableItems.map((item) => (
                    <SelectItem
                      key={item.id}
                      value={item.id}
                      data-testid={`${config.optionTestIdPrefix}${item.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.code}</span>
                        <span className="text-muted-foreground">-</span>
                        <span>{item.title}</span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Target Preview */}
          {selectedTarget && (
            <div className="space-y-2">
              <Label>{config.targetDetailsLabel}</Label>
              <div className="p-3 bg-muted rounded-md">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{selectedTarget.code}</span>
                  <span className="text-muted-foreground">-</span>
                  <span>{selectedTarget.title}</span>
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {detailLine(selectedTarget)}
                </div>
                {kind === "costCode" && (selectedTarget as CostCode).availableInTimesheets && (
                  <Badge variant="outline" className="mt-2">
                    Available in Timesheets
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Warning */}
          <div className="flex gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-md">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                This action cannot be undone
              </p>
              <p className="text-sm text-amber-800 dark:text-amber-200">
                {config.warningText}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} data-testid="button-cancel-merge">
            Cancel
          </Button>
          <Button
            onClick={handleMerge}
            disabled={!targetId || mergeMutation.isPending}
            data-testid="button-confirm-merge"
          >
            {mergeMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Merging...
              </>
            ) : (
              config.submitLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
