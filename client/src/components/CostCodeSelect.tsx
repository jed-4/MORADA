import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { SearchableSelect, SearchableSelectOption } from "@/components/ui/searchable-select";
import type { CostCode } from "@shared/schema";

interface CostCodeSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  allowNone?: boolean;
  className?: string;
  "data-testid"?: string;
}

export function CostCodeSelect({
  value,
  onValueChange,
  placeholder = "Select cost code...",
  disabled = false,
  allowClear = false,
  allowNone = true,
  className,
  "data-testid": testId,
}: CostCodeSelectProps) {
  const { data: costCodes = [], isLoading } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
  });

  const options: SearchableSelectOption[] = useMemo(() => {
    const opts: SearchableSelectOption[] = [];
    
    if (allowNone) {
      opts.push({
        value: "none",
        label: "None",
      });
    }
    
    costCodes.forEach((code) => {
      opts.push({
        value: code.id,
        label: `${code.code} - ${code.title}`,
        description: code.categoryId ? undefined : undefined,
        group: code.categoryId || undefined,
      });
    });
    
    return opts;
  }, [costCodes, allowNone]);

  const handleValueChange = (newValue: string) => {
    if (newValue === "none") {
      onValueChange("");
    } else {
      onValueChange(newValue);
    }
  };

  return (
    <SearchableSelect
      options={options}
      value={value || (allowNone ? "none" : undefined)}
      onValueChange={handleValueChange}
      placeholder={isLoading ? "Loading..." : placeholder}
      searchPlaceholder="Search cost codes..."
      emptyMessage="No cost codes found."
      disabled={disabled || isLoading}
      allowClear={allowClear}
      className={className}
      data-testid={testId}
    />
  );
}
