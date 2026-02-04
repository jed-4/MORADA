import { forwardRef, useRef } from "react";
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
  defaultScrollTime?: string; // Time to scroll to when opening (e.g., "07:00")
  "data-testid"?: string;
}

// Generate time options in 15-minute increments
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

// Find index of time option (defaults to 7:00 AM = index 28)
const DEFAULT_SCROLL_INDEX = 28; // 7:00 AM

export const TimeSelect = forwardRef<HTMLButtonElement, TimeSelectProps>(
  ({ value, onChange, placeholder = "Select time", disabled, className, showIcon = true, defaultScrollTime = "07:00", "data-testid": testId }, ref) => {
    // Find the display label for the current value
    const selectedOption = TIME_OPTIONS.find(opt => opt.value === value);
    const contentRef = useRef<HTMLDivElement>(null);
    
    // Calculate scroll index based on value or default
    const getScrollIndex = () => {
      if (value) {
        const idx = TIME_OPTIONS.findIndex(opt => opt.value === value);
        return idx >= 0 ? idx : DEFAULT_SCROLL_INDEX;
      }
      const idx = TIME_OPTIONS.findIndex(opt => opt.value === defaultScrollTime);
      return idx >= 0 ? idx : DEFAULT_SCROLL_INDEX;
    };
    
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
        <SelectContent 
          ref={contentRef}
          className="max-h-[280px]"
          onOpenAutoFocus={() => {
            // Scroll to the appropriate time when dropdown opens
            setTimeout(() => {
              const scrollIndex = getScrollIndex();
              const viewport = contentRef.current?.querySelector('[data-radix-select-viewport]');
              if (viewport) {
                const itemHeight = 32; // Approximate height of each item
                viewport.scrollTop = Math.max(0, scrollIndex * itemHeight - 64); // Center it a bit
              }
            }, 0);
          }}
        >
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
