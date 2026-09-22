import type { ReactNode } from "react";
import { Loader2, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Shared furniture for the client portal sections.
 *
 * The builder's pages are working tools: toolbars, kanban, bulk actions, add
 * buttons. A client is reading a record of their own job, so these sections
 * are a title, a sentence of context, and the content — nothing to operate.
 * Keeping the shell here means every client section looks like one product
 * rather than eight trimmed-down builder screens.
 */

/**
 * Every client section scrolls ITSELF.
 *
 * The project shell gives the active tab a fixed-height, overflow-hidden box
 * and expects the page inside to handle its own scrolling — the builder's
 * pages all do. A plain <div> is simply clipped, which is why the variation
 * document ended below the fold with no way to reach it.
 */
export function ClientScroll({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("h-full overflow-y-auto", className)} data-testid="client-scroll">
      {children}
    </div>
  );
}

interface ClientPageProps {
  title: string;
  /** One line telling the client what this section is for. */
  description?: string;
  /** Right-hand side of the header (a summary figure, a status). */
  aside?: ReactNode;
  children: ReactNode;
}

export function ClientPage({ title, description, aside, children }: ClientPageProps) {
  return (
    <ClientScroll>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6" data-testid={`client-page-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">{title}</h1>
          {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
        </div>
        {aside}
      </div>
      {children}
      </div>
    </ClientScroll>
  );
}

/** Centred spinner — clients are on ~400ms round trips, so never show an empty list first. */
export function ClientLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground" data-testid="client-loading">
      <Loader2 className="h-6 w-6 animate-spin" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

/**
 * Nothing here yet. Deliberately never offers an action: the builder is the
 * one who publishes a schedule or raises a variation, so the client's empty
 * state explains rather than invites.
 */
export function ClientEmpty({
  icon: Icon,
  title,
  description,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <Card data-testid="client-empty">
      <CardContent className="flex flex-col items-center justify-center gap-2 py-14 text-center">
        {Icon && (
          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-1">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        <p className="font-medium">{title}</p>
        {description && <p className="text-sm text-muted-foreground max-w-md">{description}</p>}
      </CardContent>
    </Card>
  );
}

export function ClientError({ message = "We couldn't load this just now. Try again in a moment." }: { message?: string }) {
  return (
    <Card data-testid="client-error">
      <CardContent className="py-10 text-center text-sm text-muted-foreground">{message}</CardContent>
    </Card>
  );
}

/**
 * Status wording for a client. The builder's chips say things like "action"
 * and "partial"; these say what it means for the person reading it.
 */
const CLIENT_TONES = {
  neutral: "bg-muted text-muted-foreground",
  waiting: "bg-[hsl(var(--amber-light))] text-[hsl(26_9%_16%)]",
  done: "bg-[hsl(var(--sage-light))] text-[hsl(26_9%_16%)]",
  attention: "bg-[hsl(var(--coral-light))] text-[hsl(26_9%_16%)]",
  info: "bg-primary-light text-foreground",
} as const;

export type ClientTone = keyof typeof CLIENT_TONES;

export function ClientStatus({ label, tone = "neutral", className }: { label: string; tone?: ClientTone; className?: string }) {
  return (
    <Badge variant="secondary" className={cn("border-0 font-medium", CLIENT_TONES[tone], className)} data-testid={`client-status-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      {label}
    </Badge>
  );
}

/** A row in a client list: name on the left, meta in the middle, value right. */
export function ClientRow({
  title,
  meta,
  value,
  status,
  onClick,
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  value?: ReactNode;
  status?: ReactNode;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const interactive = !!onClick;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 border-b last:border-b-0",
        interactive && "cursor-pointer hover-elevate",
      )}
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } } : undefined}
    >
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{title}</div>
        {meta && <div className="text-sm text-muted-foreground truncate">{meta}</div>}
        {children}
      </div>
      {status}
      {value !== undefined && <div className="text-right tabular-nums font-medium">{value}</div>}
    </div>
  );
}
