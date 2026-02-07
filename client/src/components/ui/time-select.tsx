import { forwardRef, useCallback } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimeSelectProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  showIcon?: boolean;
  defaultScrollTime?: string;
  "data-testid"?: string;
}

// Generate time options in 15-minute increments (chronological order)
const generateTimeOptions = () => {
  const options: { value: string; label: string }[] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      const ampm = hour < 12 ? "AM" : "PM";
      const label = `${hour12}:${String(minute).padStart(2, "0")} ${ampm}`;
      options.push({ value, label });
    }
  }
  return options;
};

const TIME_OPTIONS = generateTimeOptions();

// Default scroll position: 7:00 AM is at index 28 (7 hours * 4 quarter-hours)
const DEFAULT_SCROLL_INDEX = 28;

export const TimeSelect = forwardRef<HTMLButtonElement, TimeSelectProps>(
  ({ value, onChange, placeholder = "Select time", disabled, className, showIcon = true, defaultScrollTime, "data-testid": testId }, ref) => {
    const selectedOption = TIME_OPTIONS.find(opt => opt.value === value);
    
    const defaultIndex = defaultScrollTime
      ? TIME_OPTIONS.findIndex(opt => opt.value === defaultScrollTime)
      : DEFAULT_SCROLL_INDEX;
    const fallbackIndex = defaultIndex >= 0 ? defaultIndex : DEFAULT_SCROLL_INDEX;

    const handleContentRef = useCallback((node: HTMLDivElement | null) => {
      if (node) {
        requestAnimationFrame(() => {
          const viewport = node.querySelector('[data-radix-select-viewport]');
          if (viewport) {
            const targetIndex = value 
              ? TIME_OPTIONS.findIndex(opt => opt.value === value)
              : fallbackIndex;
            
            const scrollIndex = targetIndex >= 0 ? targetIndex : fallbackIndex;
            const itemHeight = 32;
            const viewportHeight = 280;
            const scrollTop = Math.max(0, scrollIndex * itemHeight);
            viewport.scrollTop = scrollTop;
          }
        });
      }
    }, [value, fallbackIndex]);
    
    return (
      <Select value={value || ""} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger 
          ref={ref}
          className={cn("h-9", className)}
          data-testid={testId}
        >
          <div className="flex items-center gap-2">
            {showIcon && <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
            <SelectValue placeholder={placeholder}>
              {selectedOption?.label || placeholder}
            </SelectValue>
          </div>
        </SelectTrigger>
        <SelectContent ref={handleContentRef} className="max-h-[280px]">
          {TIME_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
);

TimeSelect.displayName = "TimeSelect";
