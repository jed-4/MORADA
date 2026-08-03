import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Phone, Mail, Hammer, ArrowRight } from "lucide-react";
import type { Contact } from "@shared/schema";
import type { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { WidgetSkeleton, WidgetEmpty, WidgetError } from "@/components/ui/widget-states";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocation } from "wouter";

export default function SubcontractorsWidget({ widget, onSetHeaderActions }: WidgetProps) {
  const { currentProject } = useProject();
  const [, setLocation] = useLocation();

  // Header row: hover arrow to the contacts page
  useEffect(() => {
    onSetHeaderActions?.(
      currentProject ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
              onClick={() => setLocation("/contacts")}
              data-testid="subcontractors-widget-open-contacts"
              aria-label="Open contacts"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">All contacts</TooltipContent>
        </Tooltip>
      ) : null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id]);

  const {
    data: contacts = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<Contact[]>({
    queryKey: ["/api/contacts", "trade"],
    queryFn: async () => {
      const res = await fetch("/api/contacts?contactType=trade", {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: !!currentProject?.id,
  });

  if (!currentProject) {
    return <WidgetEmpty message="Select a project to view subcontractors" />;
  }
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => refetch()} />;

  const projectSubs = contacts.filter((c) => {
    const ids = (c.projectIds as string[] | null) || [];
    return Array.isArray(ids) && ids.includes(currentProject.id);
  });

  const max = (widget.config?.maxItems as number) || 8;
  const visible = projectSubs.slice(0, max);

  if (visible.length === 0) {
    return (
      <WidgetEmpty
        message="No subcontractors assigned to this project"
        action={{ label: "Manage contacts", onClick: () => setLocation("/contacts") }}
      />
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="widget-subcontractors">
      <div className="flex-1 overflow-auto space-y-1">
        {visible.map((c) => {
          const initials = (c.name || "?")
            .split(/\s+/)
            .map((p) => p[0])
            .filter(Boolean)
            .slice(0, 2)
            .join("")
            .toUpperCase();
          const phone = c.mobile || c.phone || null;
          return (
            <div
              key={c.id}
              className="flex items-center gap-3 px-2 py-2 rounded-md hover-elevate"
              data-testid={`subcontractor-${c.id}`}
            >
              <Avatar className="h-8 w-8 flex-shrink-0">
                <AvatarFallback
                  className="text-xs"
                  style={c.avatarColor ? { backgroundColor: c.avatarColor, color: "white" } : undefined}
                >
                  {initials || <Hammer className="h-3 w-3" />}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{c.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {c.role || c.company || c.position || "Trade"}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {phone && (
                  <Button
                    asChild
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    data-testid={`button-call-${c.id}`}
                  >
                    <a href={`tel:${phone}`} aria-label={`Call ${c.name}`}>
                      <Phone className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                )}
                {c.email && (
                  <Button
                    asChild
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    data-testid={`button-email-${c.id}`}
                  >
                    <a href={`mailto:${c.email}`} aria-label={`Email ${c.name}`}>
                      <Mail className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        {projectSubs.length > visible.length && (
          <button
            type="button"
            onClick={() => setLocation("/contacts")}
            className="w-full text-xs text-muted-foreground hover:text-foreground py-1.5 text-center"
            data-testid="button-view-all-subcontractors"
          >
            Showing {visible.length} of {projectSubs.length} · View all
          </button>
        )}
      </div>
    </div>
  );
}
