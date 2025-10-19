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
import type { CostCategory, CostCode } from "@shared/schema";

interface MergeCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: CostCategory | null;
}

export default function MergeCategoryDialog({
  open,
  onOpenChange,
  category,
}: MergeCategoryDialogProps) {
  const { toast } = useToast();
  const [targetCategoryId, setTargetCategoryId] = useState<string>("");

  const { data: allCategories = [] } = useQuery<CostCategory[]>({
    queryKey: ["/api/cost-categories"],
  });

  const { data: allCodes = [] } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
  });

  const mergeMutation = useMutation({
    mutationFn: (data: { sourceId: string; targetId: string }) =>
      apiRequest("/api/cost-categories/merge", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cost-categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cost-codes"] });
      toast({
        title: "Categories merged",
        description: "The categories have been merged successfully.",
      });
      handleClose();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to merge categories.",
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setTargetCategoryId("");
    onOpenChange(false);
  };

  const handleMerge = () => {
    if (!category || !targetCategoryId) return;
    mergeMutation.mutate({
      sourceId: category.id,
      targetId: targetCategoryId,
    });
  };

  // Get available categories to merge into (exclude current category and archived ones)
  const availableCategories = allCategories.filter(
    (cat) => cat.id !== category?.id && cat.isActive
  );

  const selectedTargetCategory = allCategories.find((c) => c.id === targetCategoryId);
  
  // Count codes in source category
  const sourceCategoryCodeCount = category 
    ? allCodes.filter(code => code.categoryId === category.id).length 
    : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl" data-testid="dialog-merge-category">
        <DialogHeader>
          <DialogTitle>Merge Cost Category</DialogTitle>
          <DialogDescription>
            Select the category to merge into. All cost codes from the source category will be
            moved to the target category.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Source Category */}
          {category && (
            <div className="space-y-2">
              <Label>Source Category (will be archived)</Label>
              <div className="p-3 bg-muted rounded-md">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{category.code}</span>
                  <span className="text-muted-foreground">-</span>
                  <span>{category.title}</span>
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {sourceCategoryCodeCount} cost codes
                </div>
              </div>
            </div>
          )}

          {/* Target Category Selection */}
          <div className="space-y-2">
            <Label htmlFor="target-category">Target Category (merge into)</Label>
            <Select value={targetCategoryId} onValueChange={setTargetCategoryId}>
              <SelectTrigger id="target-category" data-testid="select-target-category">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {availableCategories.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground">
                    No available categories to merge into
                  </div>
                ) : (
                  availableCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id} data-testid={`option-category-${cat.id}`}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{cat.code}</span>
                        <span className="text-muted-foreground">-</span>
                        <span>{cat.title}</span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Target Category Preview */}
          {selectedTargetCategory && (
            <div className="space-y-2">
              <Label>Target Category Details</Label>
              <div className="p-3 bg-muted rounded-md">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{selectedTargetCategory.code}</span>
                  <span className="text-muted-foreground">-</span>
                  <span>{selectedTargetCategory.title}</span>
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {allCodes.filter(code => code.categoryId === selectedTargetCategory.id).length} cost codes
                </div>
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
                All cost codes from the source category will be moved to the target category. 
                The source category will be archived.
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
            disabled={!targetCategoryId || mergeMutation.isPending}
            data-testid="button-confirm-merge"
          >
            {mergeMutation.isPending ? "Merging..." : "Merge Categories"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
