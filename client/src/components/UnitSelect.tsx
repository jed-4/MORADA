import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FieldCategoryWithOptions } from "@shared/schema";

interface UnitSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  "data-testid"?: string;
}

/**
 * Unit-of-measure dropdown sourced from the company's custom Field Settings
 * "unit" category (`estimate_item.unit`) — the SAME source the estimate grid
 * uses, so the unit list stays consistent across the app. A current value that
 * isn't (or is no longer) an active option is still shown, so switching a
 * free-text field to this dropdown never silently drops an existing unit.
 */
export function UnitSelect({
  value,
  onValueChange,
  placeholder = "Unit",
  disabled,
  className,
  triggerClassName,
  "data-testid": testId,
}: UnitSelectProps) {
  const { data: unitCategory } = useQuery<FieldCategoryWithOptions>({
    queryKey: ["/api/field-categories/by-key/estimate_item.unit"],
  });

  const active = (unitCategory?.options ?? [])
    .filter((o) => o.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((o) => o.name);

  const names = value && !active.includes(value) ? [value, ...active] : active;

  return (
    <Select value={value || undefined} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={triggerClassName ?? className} data-testid={testId}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {names.map((name) => (
          <SelectItem key={name} value={name} className="text-xs">
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
