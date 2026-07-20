import { useState } from "react";
import { format, isValid } from "date-fns";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DatePickerProps {
  /** ISO date string "yyyy-MM-dd", or "" when empty. */
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Inclusive bounds as "yyyy-MM-dd". */
  min?: string;
  max?: string;
  allowClear?: boolean;
  className?: string;
  triggerClassName?: string;
  "data-testid"?: string;
}

// Parse "yyyy-MM-dd" into a LOCAL date (no UTC shift, which is what bit the
// native inputs). Returns undefined for blank/invalid.
function parseYmd(s?: string): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  const dt = new Date(y, m - 1, d);
  return isValid(dt) ? dt : undefined;
}

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Shared date picker — a Morada-styled Popover + Calendar, replacing the native
 * <input type="date">. Works in ISO "yyyy-MM-dd" strings so it's a drop-in for
 * the existing date fields and maps cleanly to the API.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = "Select date",
  disabled = false,
  min,
  max,
  allowClear = false,
  className,
  triggerClassName,
  "data-testid": testId,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = parseYmd(value);
  const minDate = parseYmd(min);
  const maxDate = parseYmd(max);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal gap-2",
            !selected && "text-muted-foreground",
            triggerClassName,
          )}
          data-testid={testId}
        >
          <CalendarIcon className="h-3.5 w-3.5 opacity-60 shrink-0" />
          <span className="flex-1 truncate">{selected ? format(selected, "d MMM yyyy") : placeholder}</span>
          {allowClear && selected && !disabled && (
            <X
              className="h-3.5 w-3.5 opacity-50 hover:opacity-100 shrink-0"
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
              aria-label="Clear date"
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-auto p-0", className)} align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(d) => {
            if (d) {
              onChange(toYmd(d));
              setOpen(false);
            }
          }}
          disabled={(date) =>
            (minDate ? date < minDate : false) || (maxDate ? date > maxDate : false)
          }
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
