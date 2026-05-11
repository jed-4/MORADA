import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Pencil, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CostCodeSelect } from "@/components/CostCodeSelect";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { EstimateGroup } from "@shared/schema";

type FieldKey =
  | "type"
  | "costCode"
  | "groupId"
  | "markupPercent"
  | "quantity"
  | "unitType"
  | "unitCostExTax"
  | "unitCostIncTax"
  | "status"
  | "allowance"
  | "wastagePercent"
  | "proposalVisible"
  | "trackLabourHours"
  | "requestForQuote"
  | "isSelection";

interface FieldDef {
  key: FieldKey;
  label: string;
  kind: "select" | "number" | "switch" | "costCode";
  selectOptions?: Array<{ value: string; label: string }>;
  step?: string;
  min?: number;
  max?: number;
  suffix?: string;
}

interface Props {
  estimateId: string;
  selectedItemIds: string[];
  groups: EstimateGroup[];
  unitOptions: Array<{ name: string; isActive: boolean; sortOrder: number }>;
  statusOptions: Array<{ key: string; name: string; isActive: boolean }>;
  taxRate: number;
  disabled?: boolean;
  onComplete: () => void;
}

export function BulkEditDropdown({
  estimateId,
  selectedItemIds,
  groups,
  unitOptions,
  statusOptions,
  taxRate,
  disabled,
  onComplete,
}: Props) {
  const { toast } = useToast();
  const [openField, setOpenField] = useState<FieldKey | null>(null);
  const [stringValue, setStringValue] = useState("");
  const [numberValue, setNumberValue] = useState("");
  const [boolValue, setBoolValue] = useState(false);

  const fields: FieldDef[] = [
    {
      key: "type",
      label: "Cost Type",
      kind: "select",
      selectOptions: [
        { value: "Material", label: "Material" },
        { value: "Labour", label: "Labour" },
        { value: "Subcontractor", label: "Subcontractor" },
        { value: "Fee", label: "Fee" },
      ],
    },
    { key: "costCode", label: "Cost Code", kind: "costCode" },
    {
      key: "groupId",
      label: "Group",
      kind: "select",
      selectOptions: [
        { value: "none", label: "None (ungrouped)" },
        ...groups.map((g) => ({ value: g.id, label: g.name })),
      ],
    },
    { key: "markupPercent", label: "Markup", kind: "number", min: 0, max: 1000, step: "0.1", suffix: "%" },
    { key: "quantity", label: "Quantity", kind: "number", step: "0.01" },
    {
      key: "unitType",
      label: "Unit Type",
      kind: "select",
      selectOptions: unitOptions
        .filter((o) => o.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((o) => ({ value: o.name, label: o.name })),
    },
    { key: "unitCostExTax", label: "Unit Cost (Ex Tax)", kind: "number", step: "0.01", min: 0, suffix: "$" },
    { key: "unitCostIncTax", label: "Unit Cost (Inc Tax)", kind: "number", step: "0.01", min: 0, suffix: "$" },
    {
      key: "status",
      label: "Status",
      kind: "select",
      selectOptions: statusOptions
        .filter((o) => o.isActive)
        .map((o) => ({ value: o.key, label: o.name })),
    },
    {
      key: "allowance",
      label: "Allowance",
      kind: "select",
      selectOptions: [
        { value: "None", label: "None" },
        { value: "Prime Cost", label: "Prime Cost" },
        { value: "Provisional Sum", label: "Provisional Sum" },
      ],
    },
    { key: "wastagePercent", label: "Wastage", kind: "number", min: 0, max: 100, step: "1", suffix: "%" },
    { key: "proposalVisible", label: "Visible in Proposal", kind: "switch" },
    { key: "trackLabourHours", label: "Track Labour Hours", kind: "switch" },
    { key: "requestForQuote", label: "Request for Quote", kind: "switch" },
    { key: "isSelection", label: "Is Selection", kind: "switch" },
  ];

  const currentField = openField ? fields.find((f) => f.key === openField) : null;

  const bulkMutation = useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      return await apiRequest(
        `/api/estimates/${estimateId}/items/bulk-update`,
        "PATCH",
        { itemIds: selectedItemIds, patch },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", estimateId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", estimateId, "summary"] });
      toast({
        title: "Updated",
        description: `Updated ${selectedItemIds.length} item${selectedItemIds.length !== 1 ? "s" : ""}.`,
      });
      setOpenField(null);
      setStringValue("");
      setNumberValue("");
      setBoolValue(false);
      onComplete();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update items.",
        variant: "destructive",
      });
    },
  });

  const handleOpenField = (key: FieldKey) => {
    setStringValue("");
    setNumberValue("");
    setBoolValue(false);
    setOpenField(key);
  };

  const handleApply = () => {
    if (!currentField) return;
    const patch: Record<string, any> = {};
    switch (currentField.kind) {
      case "select":
      case "costCode":
        patch[currentField.key] = stringValue;
        break;
      case "number": {
        const n = parseFloat(numberValue);
        if (isNaN(n)) return;
        if (currentField.key === "unitCostIncTax") {
          // Back-calc to ex-tax using estimate tax rate
          const exTax = n / (1 + (Number(taxRate) || 0) / 100);
          patch.unitCostExTax = Math.round(exTax * 100) / 100;
        } else {
          patch[currentField.key] = n;
        }
        break;
      }
      case "switch":
        patch[currentField.key] = boolValue;
        break;
    }
    bulkMutation.mutate(patch);
  };

  const canSubmit = (() => {
    if (!currentField) return false;
    if (currentField.kind === "switch") return true;
    if (currentField.kind === "number") {
      const n = parseFloat(numberValue);
      return !isNaN(n);
    }
    return stringValue !== "" || currentField.key === "groupId" || currentField.key === "costCode";
  })();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || selectedItemIds.length === 0}
            data-testid="button-bulk-edit"
          >
            <Pencil className="w-3.5 h-3.5 mr-1" />
            Edit
            <ChevronDown className="w-3 h-3 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top" className="max-h-96 overflow-y-auto">
          {fields.map((f) => (
            <DropdownMenuItem
              key={f.key}
              onClick={() => handleOpenField(f.key)}
              data-testid={`bulk-edit-field-${f.key}`}
            >
              {f.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={openField !== null} onOpenChange={(o) => !o && setOpenField(null)}>
        <DialogContent className="max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle>{currentField ? `Set ${currentField.label}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Apply to {selectedItemIds.length} selected item{selectedItemIds.length !== 1 ? "s" : ""}.
            </p>
            {currentField?.kind === "select" && (
              <Select value={stringValue} onValueChange={setStringValue}>
                <SelectTrigger data-testid={`bulk-edit-select-${currentField.key}`}>
                  <SelectValue placeholder={`Select ${currentField.label.toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent>
                  {currentField.selectOptions?.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {currentField?.kind === "costCode" && (
              <CostCodeSelect
                value={stringValue}
                onValueChange={setStringValue}
                allowNone
                data-testid="bulk-edit-cost-code"
              />
            )}
            {currentField?.kind === "number" && (
              <div className="flex items-center gap-2">
                {currentField.suffix === "$" && (
                  <span className="text-sm text-muted-foreground">$</span>
                )}
                <Input
                  type="number"
                  inputMode="decimal"
                  step={currentField.step}
                  min={currentField.min}
                  max={currentField.max}
                  value={numberValue}
                  onChange={(e) => setNumberValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canSubmit && !bulkMutation.isPending) handleApply();
                  }}
                  autoFocus
                  data-testid={`bulk-edit-number-${currentField.key}`}
                />
                {currentField.suffix === "%" && (
                  <span className="text-sm text-muted-foreground">%</span>
                )}
              </div>
            )}
            {currentField?.kind === "switch" && (
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <Label htmlFor="bulk-switch" className="text-sm">
                  {currentField.label}
                </Label>
                <Switch
                  id="bulk-switch"
                  checked={boolValue}
                  onCheckedChange={setBoolValue}
                  data-testid={`bulk-edit-switch-${currentField.key}`}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpenField(null)}
              data-testid="button-bulk-edit-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleApply}
              disabled={!canSubmit || bulkMutation.isPending}
              data-testid="button-bulk-edit-apply"
            >
              {bulkMutation.isPending ? "Applying…" : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
