import { Input } from "@/components/ui/input";
import {
  TEMPLATE_ANCHOR_DAY, addWorkingDays, templateDayNumber, type DayCalendar,
} from "@shared/scheduleTemplateDates";

/**
 * A schedule template's stand-in for `<Input type="date">`.
 *
 * Template items are stored against a fixed anchor Monday, so a real date means
 * nothing to the person editing one. This shows the working-day number instead
 * — Day 1 is the first working day — and hands back the same 'yyyy-MM-dd'
 * string a date input would, so the item dialog's date and duration logic runs
 * unchanged.
 */
export function TemplateDayInput({
  value, onChange, calendar, id, required, ...rest
}: {
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  calendar: DayCalendar;
  id?: string;
  required?: boolean;
  type?: string;
  "data-testid"?: string;
}) {
  const { type: _type, ...inputProps } = rest;
  const day = value ? templateDayNumber(value, calendar) : "";
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">Day</span>
      <Input
        {...inputProps}
        id={id}
        type="number"
        min={1}
        required={required}
        className="pl-11"
        value={day}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (Number.isNaN(n) || n < 1) return;
          onChange({ target: { value: addWorkingDays(TEMPLATE_ANCHOR_DAY, n - 1, calendar) } });
        }}
      />
    </div>
  );
}

/** "Day 3" or "Day 3–7" for a template item's span. */
export function templateDayRange(start: Date | string, end: Date | string, calendar: DayCalendar): string {
  const a = templateDayNumber(start, calendar);
  const b = templateDayNumber(end, calendar);
  return a === b ? `Day ${a}` : `Day ${a}–${b}`;
}
