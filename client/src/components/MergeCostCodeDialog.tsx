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
import { AlertCircle } from "lucide-react";
import type { CostCode, CostCategory } from "@shared/schema";

interface MergeCostCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  costCode: CostCode | null;
}

export default function MergeCostCodeDialog({
  open,
  onOpenChange,
  costCode,
}: MergeCostCodeDialogProps) {
  const { toast } = useToast();
  const [targetCodeId, setTargetCodeId] = useState<string>("");

  const { data: allCodes = [] } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
  });

  const { data: categories = [] } = useQuery<CostCategory[]>({
    queryKey: ["/api/cost-categories"],
  });

  const mergeMutation = useMutation({
    mutationFn: (data: { sourceId: string; targetId: string }) =>
      apiRequest("/api/cost-codes/merge", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cost-codes"] });
      toast({
        title: "Cost codes merged",
        description: "The cost codes have been merged successfully.",
      });
      handleClose();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to merge cost codes.",
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setTargetCodeId("");
    onOpenChange(false);
  };

  const handleMerge = () => {
    if (!costCode || !targetCodeId) return;
    mergeMutation.mutate({
      sourceId: costCode.id,
      targetId: targetCodeId,
    });
  };

  // Get available codes to merge into (exclude current code and archived ones)
  const availableCodes = allCodes.filter(
    (code) => code.id !== costCode?.id && !code.isArchived
  );

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return "Uncategorized";
    const category = categories.find((c) => c.id === categoryId);
    return category ? `${category.code} - ${category.title}` : "Unknown";
  };

  const selectedTargetCode = allCodes.find((c) => c.id === targetCodeId);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl" data-testid="dialog-merge-cost-code">
        <DialogHeader>
          <DialogTitle>Merge Cost Code</DialogTitle>
          <DialogDescription>
            Select the cost code to merge into. All references to the source cost code will be
            updated to use the target cost code.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Source Code */}
          {costCode && (
            <div className="space-y-2">
              <Label>Source Cost Code (will be archived)</Label>
              <div className="p-3 bg-muted rounded-md">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{costCode.code}</span>
                  <span className="text-muted-foreground">-</span>
                  <span>{costCode.title}</span>
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  Category: {getCategoryName(costCode.categoryId)}
                </div>
              </div>
            </div>
          )}

          {/* Target Code Selection */}
          <div className="space-y-2">
            <Label htmlFor="target-code">Target Cost Code (merge into)</Label>
            <Select value={targetCodeId} onValueChange={setTargetCodeId}>
              <SelectTrigger id="target-code" data-testid="select-target-code">
                <SelectValue placeholder="Select a cost code" />
              </SelectTrigger>
              <SelectContent>
                {availableCodes.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground">
                    No available cost codes to merge into
                  </div>
                ) : (
                  availableCodes.map((code) => (
                    <SelectItem key={code.id} value={code.id} data-testid={`option-code-${code.id}`}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{code.code}</span>
                        <span className="text-muted-foreground">-</span>
                        <span>{code.title}</span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Target Code Preview */}
          {selectedTargetCode && (
            <div className="space-y-2">
              <Label>Target Cost Code Details</Label>
              <div className="p-3 bg-muted rounded-md">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{selectedTargetCode.code}</span>
                  <span className="text-muted-foreground">-</span>
                  <span>{selectedTargetCode.title}</span>
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  Category: {getCategoryName(selectedTargetCode.categoryId)}
                </div>
                {selectedTargetCode.availableInTimesheets && (
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
                All estimates, bills, and other records using the source cost code will be
                updated to use the target cost code. The source cost code will be archived.
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
            disabled={!targetCodeId || mergeMutation.isPending}
            data-testid="button-confirm-merge"
          >
            {mergeMutation.isPending ? "Merging..." : "Merge Cost Codes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
