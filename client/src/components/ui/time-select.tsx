import { forwardRef } from "react";
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
  "data-testid"?: string;
}

// Generate time options in 15-minute increments, starting from 7am
const generateTimeOptions = () => {
  const options: { value: string; label: string }[] = [];
  
  // Start from 7am (hour 7) to 11:45pm, then 12am to 6:45am
  const hours = [
    7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
    0, 1, 2, 3, 4, 5, 6
  ];
  
  for (const hour of hours) {
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

export const TimeSelect = forwardRef<HTMLButtonElement, TimeSelectProps>(
  ({ value, onChange, placeholder = "Select time", disabled, className, showIcon = true, "data-testid": testId }, ref) => {
    // Find the display label for the current value
    const selectedOption = TIME_OPTIONS.find(opt => opt.value === value);
    
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
        <SelectContent className="max-h-[280px]">
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
