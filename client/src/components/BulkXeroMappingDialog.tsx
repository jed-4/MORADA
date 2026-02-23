import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Wand2, Save, RotateCcw, Check } from "lucide-react";
import type { CostCode, CostCategory } from "@shared/schema";

type TrackingOption = {
  trackingOptionId: string;
  name: string;
  status: string;
};

type BulkXeroMappingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function normalizeForMatch(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCode(str: string): string {
  const match = str.match(/^[\d.]+/);
  return match ? match[0] : "";
}

function similarity(a: string, b: string): number {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.8;
  const codeA = extractCode(a);
  const codeB = extractCode(b);
  if (codeA && codeB && codeA === codeB) return 0.7;
  const wordsA = na.split(" ");
  const wordsB = nb.split(" ");
  const common = wordsA.filter((w) => wordsB.includes(w));
  const score = (common.length * 2) / (wordsA.length + wordsB.length);
  return score;
}

export default function BulkXeroMappingDialog({
  open,
  onOpenChange,
}: BulkXeroMappingDialogProps) {
  const { toast } = useToast();
  const [mappings, setMappings] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState(false);

  const { data: codes = [] } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
  });

  const { data: categories = [] } = useQuery<CostCategory[]>({
    queryKey: ["/api/cost-categories"],
  });

  const { data: xeroStatus } = useQuery<any>({
    queryKey: ["/api/xero/status"],
  });

  const trackingCategory1Id = xeroStatus?.trackingCategory1Id;
  const trackingCategory1Name = xeroStatus?.trackingCategory1Name;

  const { data: trackingCategories = [] } = useQuery<any[]>({
    queryKey: ["/api/xero/tracking-categories"],
    enabled: !!trackingCategory1Id,
  });

  const trackingCategory1 = trackingCategories.find(
    (tc: any) => tc.trackingCategoryId === trackingCategory1Id
  );
  const trackingOptions: TrackingOption[] =
    trackingCategory1?.options?.filter((o: any) => o.status === "ACTIVE") || [];

  const activeCodes = useMemo(
    () => codes.filter((c) => c.isActive !== false),
    [codes]
  );

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return "";
    const cat = categories.find((c) => c.id === categoryId);
    return cat ? `${cat.code} - ${cat.title}` : "";
  };

  const getCurrentMapping = (code: CostCode): string | null => {
    if (code.id in mappings) return mappings[code.id];
    return (code as any).xeroTrackingOptionId ?? null;
  };

  const getOptionName = (optionId: string | null): string => {
    if (!optionId) return "";
    const opt = trackingOptions.find((o) => o.trackingOptionId === optionId);
    return opt?.name ?? "";
  };

  const handleAutoMatch = () => {
    const newMappings: Record<string, string | null> = {};
    let matched = 0;

    for (const code of activeCodes) {
      const codeLabel = `${code.code} ${code.title}`.trim();
      let bestMatch: TrackingOption | null = null;
      let bestScore = 0;

      for (const option of trackingOptions) {
        const score = similarity(codeLabel, option.name);
        if (score > bestScore && score >= 0.4) {
          bestScore = score;
          bestMatch = option;
        }
      }

      if (bestMatch) {
        newMappings[code.id] = bestMatch.trackingOptionId;
        matched++;
      }
    }

    setMappings((prev) => ({ ...prev, ...newMappings }));
    toast({
      title: "Auto-match complete",
      description: `Matched ${matched} of ${activeCodes.length} cost codes.`,
    });
  };

  const handleClearAll = () => {
    const cleared: Record<string, string | null> = {};
    for (const code of activeCodes) {
      cleared[code.id] = null;
    }
    setMappings(cleared);
  };

  const handleSaveAll = async () => {
    const changedCodes = activeCodes.filter((code) => {
      const current = (code as any).xeroTrackingOptionId ?? null;
      const newVal = mappings[code.id];
      return code.id in mappings && newVal !== current;
    });

    if (changedCodes.length === 0) {
      toast({
        title: "No changes",
        description: "No mappings have been changed.",
      });
      return;
    }

    setSaving(true);
    let succeeded = 0;
    let failed = 0;

    for (const code of changedCodes) {
      try {
        const optionId = mappings[code.id];
        const optionName = optionId ? getOptionName(optionId) : null;
        await apiRequest(`/api/cost-codes/${code.id}`, "PATCH", {
          xeroTrackingOptionId: optionId,
          xeroTrackingOptionName: optionName,
        });
        succeeded++;
      } catch {
        failed++;
      }
    }

    setSaving(false);
    queryClient.invalidateQueries({ queryKey: ["/api/cost-codes"] });

    if (failed === 0) {
      toast({
        title: "Mappings saved",
        description: `Updated ${succeeded} cost code${succeeded === 1 ? "" : "s"}.`,
      });
      onOpenChange(false);
    } else {
      toast({
        title: "Partial save",
        description: `${succeeded} saved, ${failed} failed.`,
        variant: "destructive",
      });
    }
  };

  const changedCount = activeCodes.filter((code) => {
    const current = (code as any).xeroTrackingOptionId ?? null;
    return code.id in mappings && mappings[code.id] !== current;
  }).length;

  const mappedCount = activeCodes.filter((code) => {
    return getCurrentMapping(code) !== null;
  }).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Bulk Xero Mapping — Cost Codes</DialogTitle>
          <DialogDescription>
            Map cost codes to Xero tracking options
            {trackingCategory1Name ? ` (${trackingCategory1Name})` : ""}.
            Use Auto-Match to quickly pair by name similarity, then adjust as
            needed.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 flex-wrap py-2 border-b">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleAutoMatch}
              disabled={trackingOptions.length === 0}
            >
              <Wand2 className="w-3.5 h-3.5 mr-1.5" />
              Auto-Match
            </Button>
            <Button variant="ghost" size="sm" onClick={handleClearAll}>
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Clear All
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {mappedCount}/{activeCodes.length} mapped
            </Badge>
            {changedCount > 0 && (
              <Badge variant="default" className="text-xs">
                {changedCount} changed
              </Badge>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background z-10">
              <tr className="border-b">
                <th className="text-left py-2 px-2 font-medium text-muted-foreground w-[100px]">
                  Code
                </th>
                <th className="text-left py-2 px-2 font-medium text-muted-foreground">
                  Title
                </th>
                <th className="text-left py-2 px-2 font-medium text-muted-foreground">
                  Category
                </th>
                <th className="text-left py-2 px-2 font-medium text-muted-foreground w-[280px]">
                  Xero Tracking Option
                </th>
              </tr>
            </thead>
            <tbody>
              {activeCodes.map((code) => {
                const currentMapping = getCurrentMapping(code);
                const original =
                  (code as any).xeroTrackingOptionId ?? null;
                const isChanged =
                  code.id in mappings && mappings[code.id] !== original;

                return (
                  <tr
                    key={code.id}
                    className={`border-b ${isChanged ? "bg-primary/5" : ""}`}
                  >
                    <td className="py-1.5 px-2 font-mono text-xs">
                      {code.code}
                    </td>
                    <td className="py-1.5 px-2">{code.title}</td>
                    <td className="py-1.5 px-2 text-muted-foreground text-xs">
                      {getCategoryName(code.categoryId)}
                    </td>
                    <td className="py-1.5 px-2">
                      <div className="flex items-center gap-1">
                        <Select
                          value={currentMapping || "__none__"}
                          onValueChange={(value) => {
                            setMappings((prev) => ({
                              ...prev,
                              [code.id]:
                                value === "__none__" ? null : value,
                            }));
                          }}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">None</SelectItem>
                            {trackingOptions.map((option) => (
                              <SelectItem
                                key={option.trackingOptionId}
                                value={option.trackingOptionId}
                              >
                                {option.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {isChanged && (
                          <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSaveAll}
            disabled={changedCount === 0 || saving}
          >
            <Save className="w-3.5 h-3.5 mr-1.5" />
            {saving ? "Saving..." : `Save ${changedCount} Change${changedCount === 1 ? "" : "s"}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
