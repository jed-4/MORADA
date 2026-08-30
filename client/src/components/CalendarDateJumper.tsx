import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { useTimezone, formatInTimezone } from "@/hooks/useTimezone";

interface CalendarDateJumperProps {
  currentDate: Date;
  onDateChange: (date: Date) => void;
  className?: string;
}

/**
 * The current-date label in a calendar's toolbar, doubling as a month picker.
 *
 * Stepping a week at a time to reach next March is the kind of thing that makes a
 * calendar feel like a form, so the label is the control: click it, jump anywhere.
 *
 * Renders in the user's effective timezone rather than the browser's — a builder
 * checking the schedule from another state should see their own dates.
 */
export function CalendarDateJumper({ currentDate, onDateChange, className }: CalendarDateJumperProps) {
  const [open, setOpen] = useState(false);
  const { effectiveTimezone } = useTimezone();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={
            className ??
            "text-xs text-muted-foreground px-2 h-6 rounded-md hover-elevate active-elevate-2"
          }
          data-testid="text-current-date"
          title="Jump to a date"
        >
          {formatInTimezone(currentDate, effectiveTimezone, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <CalendarComponent
          mode="single"
          selected={currentDate}
          defaultMonth={currentDate}
          onSelect={(date) => {
            if (!date) return;
            onDateChange(date);
            setOpen(false);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
