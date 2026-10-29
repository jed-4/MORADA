import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { deliveryHealth, type DeliveryHealthInput, type DeliveryTone } from "@shared/emailLog";
import { AlertTriangle, CheckCheck, Check, Clock, Eye, Mail, XCircle } from "lucide-react";

const TONE_CLASS: Record<DeliveryTone, string> = {
  positive: "bg-status-success-bg text-status-success-fg",
  info: "bg-status-info-bg text-status-info-fg",
  neutral: "bg-muted text-muted-foreground",
  warning: "bg-status-warning-bg text-status-warning-fg",
  negative: "bg-status-danger-bg text-status-danger-fg",
};

const ICON = {
  failed: XCircle,
  bounced: XCircle,
  complained: AlertTriangle,
  delayed: Clock,
  opened: Eye,
  delivered: CheckCheck,
  sending: Clock,
  unconfirmed: AlertTriangle,
  gmail_untracked: Mail,
  untracked: Check,
} as const;

/**
 * What we actually know about an email — never a bare "Sent" dressed as good
 * news. The tooltip says what the label does and does not prove.
 */
export function EmailStatusChip({
  row,
  trackingEnabled,
  className,
}: {
  row: DeliveryHealthInput;
  trackingEnabled: boolean;
  className?: string;
}) {
  const health = deliveryHealth(row, { trackingEnabled });
  const Icon = ICON[health.key];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center gap-1 h-5 px-1.5 rounded text-[11px] font-medium whitespace-nowrap",
            TONE_CLASS[health.tone],
            className,
          )}
          data-testid={`email-status-${health.key}`}
        >
          <Icon className="h-3 w-3" />
          {health.label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{health.hint}</TooltipContent>
    </Tooltip>
  );
}
