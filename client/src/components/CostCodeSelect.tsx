import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { SearchableSelect, SearchableSelectOption } from "@/components/ui/searchable-select";
import type { CostCode, CostCategory } from "@shared/schema";

interface CostCodeSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  allowNone?: boolean;
  className?: string;
  triggerClassName?: string;
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
  triggerClassName,
  "data-testid": testId,
}: CostCodeSelectProps) {
  const { data: costCodes = [], isLoading } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
  });

  const { data: categories = [] } = useQuery<CostCategory[]>({
    queryKey: ["/api/cost-categories"],
  });

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((cat) => {
      map.set(cat.id, `${cat.code} - ${cat.title}`);
    });
    return map;
  }, [categories]);

  const options: SearchableSelectOption[] = useMemo(() => {
    const opts: SearchableSelectOption[] = [];
    
    if (allowNone) {
      opts.push({
        value: "none",
        label: "None",
      });
    }
    
    [...costCodes]
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }))
      .forEach((code) => {
        const categoryName = code.categoryId ? categoryMap.get(code.categoryId) : undefined;
        opts.push({
          value: code.id,
          label: `${code.code} - ${code.title}`,
          group: categoryName || (code.categoryId ? undefined : "Uncategorized"),
        });
      });
    
    return opts;
  }, [costCodes, allowNone, categoryMap]);

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
      triggerClassName={triggerClassName}
      data-testid={testId}
    />
  );
}
