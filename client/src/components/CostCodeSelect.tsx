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
    const map = new Map<string, { label: string; code: string }>();
    categories.forEach((cat) => {
      map.set(cat.id, { label: `${cat.code} - ${cat.title}`, code: cat.code });
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
    
    // Sort by CATEGORY first, then by code within it. Sorting by code alone
    // interleaved categories whose code ranges overlap, so one category could
    // appear more than once in the list. Uncategorized codes sort last.
    const UNCATEGORIZED = "Uncategorized";
    const groupOf = (c: CostCode) => {
      const cat = c.categoryId ? categoryMap.get(c.categoryId) : undefined;
      return cat?.label ?? UNCATEGORIZED;
    };
    const groupSortKey = (c: CostCode) => {
      const cat = c.categoryId ? categoryMap.get(c.categoryId) : undefined;
      // "~" sorts after digits and letters, parking Uncategorized at the end.
      return cat?.code ?? "~";
    };
    const collate = (a: string, b: string) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

    [...costCodes]
      .sort((a, b) => collate(groupSortKey(a), groupSortKey(b)) || collate(a.code, b.code))
      .forEach((code) => {
        opts.push({
          value: code.id,
          label: `${code.code} - ${code.title}`,
          group: groupOf(code),
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
