import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { SearchableSelect, SearchableSelectOption } from "@/components/ui/searchable-select";
import type { Supplier } from "@shared/schema";

interface SupplierSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  /** Adds a "None" option that resolves to an empty string. */
  allowNone?: boolean;
  /**
   * Extra options rendered above the supplier list (e.g. a "+ Create" action).
   * Values should be sentinel strings the caller handles in onValueChange.
   */
  extraOptions?: SearchableSelectOption[];
  className?: string;
  triggerClassName?: string;
  "data-testid"?: string;
}

/**
 * Shared supplier/trade picker. Fetches the company's suppliers once, sorts
 * them alphabetically, and wraps SearchableSelect so every supplier dropdown in
 * the app looks and orders the same way. Use this instead of hand-rolling a
 * `suppliers.map(...)` Select.
 */
export function SupplierSelect({
  value,
  onValueChange,
  placeholder = "Select supplier...",
  disabled = false,
  allowClear = false,
  allowNone = false,
  extraOptions,
  className,
  triggerClassName,
  "data-testid": testId,
}: SupplierSelectProps) {
  const { data: suppliers = [], isLoading } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
  });

  const options: SearchableSelectOption[] = useMemo(() => {
    const opts: SearchableSelectOption[] = [];

    if (extraOptions) opts.push(...extraOptions);

    if (allowNone) {
      opts.push({ value: "none", label: "None" });
    }

    const label = (s: Supplier) => s.name || (s as any).company || "Unnamed supplier";

    [...suppliers]
      .sort((a, b) => label(a).localeCompare(label(b), undefined, { sensitivity: "base" }))
      .forEach((s) => {
        opts.push({ value: s.id, label: label(s) });
      });

    return opts;
  }, [suppliers, allowNone, extraOptions]);

  const handleValueChange = (newValue: string) => {
    onValueChange(newValue === "none" ? "" : newValue);
  };

  return (
    <SearchableSelect
      options={options}
      value={value || (allowNone ? "none" : undefined)}
      onValueChange={handleValueChange}
      placeholder={isLoading ? "Loading..." : placeholder}
      searchPlaceholder="Search suppliers..."
      emptyMessage="No suppliers found."
      disabled={disabled || isLoading}
      allowClear={allowClear}
      className={className}
      triggerClassName={triggerClassName}
      data-testid={testId}
    />
  );
}
