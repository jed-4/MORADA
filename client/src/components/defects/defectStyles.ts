type Option = { key: string; name: string };

export function statusBadgeClass(status: string): string {
  switch (status) {
    case "open":
      return "bg-[hsl(var(--coral-bg))] text-[hsl(var(--coral))]";
    case "in_progress":
      return "bg-[hsl(var(--amber-bg))] text-[hsl(var(--amber))]";
    case "resolved":
      return "bg-[hsl(var(--sage-bg))] text-[hsl(var(--sage))]";
    case "closed":
      return "bg-muted/40 text-muted-foreground";
    default:
      return "bg-muted/40 text-muted-foreground";
  }
}

export function priorityBadgeClass(priority: string): string {
  switch (priority) {
    case "critical":
      return "bg-[hsl(var(--coral-bg))] text-[hsl(var(--coral))]";
    case "high":
      return "bg-[hsl(var(--amber-bg))] text-[hsl(var(--amber))]";
    case "medium":
      return "bg-primary/10 text-primary";
    case "low":
      return "bg-[hsl(var(--sage-bg))] text-[hsl(var(--sage))]";
    default:
      return "bg-muted/40 text-muted-foreground";
  }
}

export function priorityAccentBg(priority: string): string {
  switch (priority) {
    case "critical":
      return "bg-[hsl(var(--coral))]";
    case "high":
      return "bg-[hsl(var(--amber))]";
    case "medium":
      return "bg-primary";
    case "low":
      return "bg-[hsl(var(--sage))]";
    default:
      return "bg-border";
  }
}

export function statusAccentBg(status: string): string {
  switch (status) {
    case "open":
      return "bg-[hsl(var(--coral))]";
    case "in_progress":
      return "bg-[hsl(var(--amber))]";
    case "resolved":
      return "bg-[hsl(var(--sage))]";
    case "closed":
      return "bg-border";
    default:
      return "bg-border";
  }
}

export function typeBadgeClass(type: string): string {
  if (type === "builder") return "bg-primary/10 text-primary";
  return "bg-muted/40 text-muted-foreground";
}

export function statusLabel(key: string, options: Option[]): string {
  return options.find((o) => o.key === key)?.name ?? key;
}

export function priorityLabel(key: string, options: Option[]): string {
  return options.find((o) => o.key === key)?.name ?? key;
}

export function typeLabel(key: string, options: Option[]): string {
  return options.find((o) => o.key === key)?.name ?? key;
}

export function ageInDays(dateIdentified: Date | string | null | undefined): number {
  if (!dateIdentified) return 0;
  const d = new Date(dateIdentified);
  const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
}

export function ageColorClass(days: number): string {
  if (days <= 14) return "text-muted-foreground";
  if (days <= 30) return "text-[hsl(var(--amber))] font-semibold";
  return "text-[hsl(var(--coral))] font-semibold";
}

export function getInitials(name: string | null | undefined): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "??";
}
