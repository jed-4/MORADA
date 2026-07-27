import { CSSProperties, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";

// Shared pieces for the summary widgets (Bills / Variations / Invoices):
// ledger rows with dotted leaders (matching MetricsWidget) and the coral
// alert row. Colours come from the Morada palette in index.css.

export const SAGE_TEXT: CSSProperties = { color: "hsl(147 39% 30%)" };
export const AMBER_TEXT: CSSProperties = { color: "hsl(42 45% 35%)" };
export const TEAL_TEXT: CSSProperties = { color: "hsl(184 45% 30%)" };
export const CORAL_TEXT: CSSProperties = { color: "hsl(11 52% 42%)" };

export const DOT = {
  sage: "hsl(var(--sage))",
  amber: "hsl(var(--amber))",
  teal: "hsl(var(--teal))",
  coral: "hsl(var(--coral))",
  muted: "hsl(var(--muted-foreground))",
} as const;

const LEADER_COLOR = "hsl(48 8% 78%)";

export function LedgerRow({
  label,
  count,
  hint,
  value,
  valueStyle,
  dot,
  testId,
}: {
  label: string;
  count?: number;
  hint?: string;
  value: string;
  valueStyle?: CSSProperties;
  dot?: string;
  testId?: string;
}) {
  return (
    <div className="flex items-baseline gap-2 py-[5px]" data-testid={testId}>
      {dot && (
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0 self-center"
          style={{ backgroundColor: dot }}
        />
      )}
      <span className="text-xs text-foreground flex-shrink-0">{label}</span>
      {count != null && (
        <Badge variant="secondary" className="text-[10px] h-4 px-1.5 self-center">
          {count}
        </Badge>
      )}
      <span
        className="flex-1 border-b border-dotted -translate-y-[3px]"
        style={{ borderBottomColor: LEADER_COLOR }}
      />
      {hint && (
        <span className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0">{hint}</span>
      )}
      <span className="text-[13px] font-medium tabular-nums flex-shrink-0" style={valueStyle}>
        {value}
      </span>
    </div>
  );
}

export function SummaryAlert({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div
      className="flex items-center gap-2 rounded-md px-2.5 py-2"
      style={{ backgroundColor: "hsl(var(--coral-light))" }}
      data-testid={testId}
    >
      <AlertCircle className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--coral))" }} />
      <span className="text-xs" style={{ color: "hsl(11 52% 38%)" }}>{children}</span>
    </div>
  );
}
