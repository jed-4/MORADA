import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { ClipboardList, ChevronDown, ChevronRight, Loader2, ExternalLink, ListFilter } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocation } from "wouter";
import { compareNumberedNames } from "@shared/utils";

interface ChecklistInstance {
  id: string;
  name: string;
  status: string;
  projectId: string;
  completedCount: number;
  totalCount: number;
  templateId?: string;
  /** From the instance's template: "Task" | "Job" | "Estimation" | "Lead". */
  templateType?: string | null;
}

interface ChecklistGroup {
  id: string;
  instanceId: string;
  name: string;
  order: number;
  /** Sent with the group so a collapsed one can still show its progress. */
  completedCount: number;
  totalCount: number;
}

interface ChecklistItem {
  id: string;
  groupId: string;
  instanceId: string;
  description: string;
  status: "pending" | "completed" | "na";
  order: number;
  tooltip?: string;
}

interface EstimateChecklistPopoverProps {
  estimateId: string;
  projectId: string;
  wide?: boolean;
}

function InstancePanel({ instance, projectId }: { instance: ChecklistInstance; projectId: string }) {
  const [, setLocation] = useLocation();
  const [expanded, setExpanded] = useState(true);

  const { data: groups = [], isLoading: groupsLoading } = useQuery<ChecklistGroup[]>({
    queryKey: ["/api/checklist-instances", instance.id, "groups"],
    queryFn: async () => {
      const res = await fetch(`/api/checklist-instances/${instance.id}/groups`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch groups");
      return res.json();
    },
    enabled: expanded,
  });

  const progressPct = instance.totalCount > 0
    ? Math.round((instance.completedCount / instance.totalCount) * 100)
    : 0;

  // Authored order, then the number at the front of the name for rows that tie
  // on it. See compareNumberedNames.
  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.order - b.order || compareNumberedNames(a.name, b.name)),
    [groups],
  );

  // Land on the group there's still work in, so opening the popover shows the
  // job in hand rather than a wall of collapsed headers. Empty groups aren't
  // candidates — they render nothing. If everything is done, open the first.
  const autoExpandId = useMemo(() => {
    const withItems = sortedGroups.filter(g => (g.totalCount ?? 0) > 0);
    const unfinished = withItems.find(g => (g.completedCount ?? 0) < (g.totalCount ?? 0));
    return (unfinished ?? withItems[0])?.id ?? null;
  }, [sortedGroups]);

  return (
    <div className="border rounded-md overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-3 py-2 bg-muted/40 hover-elevate text-left"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {expanded ? (
            <ChevronDown className="w-3 h-3 flex-shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3 h-3 flex-shrink-0 text-muted-foreground" />
          )}
          <span className="text-xs font-medium truncate">{instance.name}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <span className="text-data text-muted-foreground">
            {instance.completedCount}/{instance.totalCount}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setLocation(`/projects/${projectId}/checklists/${instance.id}`);
            }}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="View full checklist"
          >
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </button>

      {instance.totalCount > 0 && (
        <div className="px-3 py-1 bg-muted/20">
          <Progress value={progressPct} className="h-1" />
        </div>
      )}

      {expanded && (
        <div className="divide-y divide-border/50">
          {groupsLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
            </div>
          ) : groups.length === 0 ? (
            <div className="px-3 py-3 text-xs text-muted-foreground italic">No items</div>
          ) : (
            sortedGroups.map((group) => (
              <GroupPanel
                key={group.id}
                group={group}
                instanceId={instance.id}
                defaultExpanded={group.id === autoExpandId}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function GroupPanel({
  group,
  instanceId,
  defaultExpanded = false,
}: {
  group: ChecklistGroup;
  instanceId: string;
  defaultExpanded?: boolean;
}) {
  // Collapsed unless this is the group being landed on. A full estimating
  // checklist runs to a couple of hundred items across a dozen groups, and
  // opening all of it at once buries the group you wanted in one unbroken
  // list. Initial state only: a later refetch changing the counts must not
  // yank a group open or shut under someone mid-tick.
  const [expanded, setExpanded] = useState(defaultExpanded);

  const { data: items = [], isLoading } = useQuery<ChecklistItem[]>({
    queryKey: ["/api/checklist-instance-groups", group.id, "items"],
    queryFn: async () => {
      const res = await fetch(`/api/checklist-instance-groups/${group.id}/items`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch items");
      return res.json();
    },
    // Nothing is on screen until the group is opened, so don't fetch a dozen
    // item lists to render a dozen collapsed headers.
    enabled: expanded,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ itemId, checked }: { itemId: string; checked: boolean }) => {
      return apiRequest(`/api/checklist-instance-items/${itemId}`, "PATCH", {
        status: checked ? "completed" : "pending",
      });
    },
    onMutate: async ({ itemId, checked }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/checklist-instance-groups", group.id, "items"] });
      const prev = queryClient.getQueryData<ChecklistItem[]>(["/api/checklist-instance-groups", group.id, "items"]);
      queryClient.setQueryData<ChecklistItem[]>(
        ["/api/checklist-instance-groups", group.id, "items"],
        (old) => old?.map(i => i.id === itemId ? { ...i, status: checked ? "completed" : "pending" } : i) ?? []
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(["/api/checklist-instance-groups", group.id, "items"], ctx.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-instance-groups", group.id, "items"] });
      // Prefix match — covers the instance list's totals and the per-group
      // counts the collapsed headers read from, which share this root key.
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-instances"] });
    },
  });

  // An empty group is skipped without opening it — the count comes down with
  // the group itself.
  if ((group.totalCount ?? 0) === 0) return null;

  return (
    <div>
      <button
        className="w-full flex items-center gap-2 px-3 py-1.5 bg-muted/20 hover-elevate text-left"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        data-testid={`button-checklist-group-${group.id}`}
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3 flex-shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3 h-3 flex-shrink-0 text-muted-foreground" />
        )}
        <span className="text-data font-semibold text-muted-foreground uppercase tracking-wide truncate flex-1">
          {group.name}
        </span>
        <span className="text-data tabular-nums text-muted-foreground flex-shrink-0">
          {group.completedCount ?? 0}/{group.totalCount ?? 0}
        </span>
      </button>

      {!expanded ? null : isLoading ? (
        <div className="flex items-center justify-center py-3">
          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
        </div>
      ) : (
      <div className="divide-y divide-border/30">
        {items
          .slice()
          // Same two keys as the group list above.
          .sort((a, b) => a.order - b.order || compareNumberedNames(a.description, b.description))
          .map((item) => {
            const isChecked = item.status === "completed" || item.status === "na";
            return (
              <div key={item.id} className="flex items-start gap-2 px-3 py-2 hover:bg-muted/20 transition-colors">
                <Checkbox
                  id={`item-${item.id}`}
                  checked={isChecked}
                  onCheckedChange={(checked) => {
                    toggleMutation.mutate({ itemId: item.id, checked: !!checked });
                  }}
                  className="mt-0.5 flex-shrink-0 h-3.5 w-3.5"
                  disabled={toggleMutation.isPending}
                />
                <label
                  htmlFor={`item-${item.id}`}
                  className={`text-xs cursor-pointer leading-relaxed select-none ${
                    isChecked ? "line-through text-muted-foreground" : ""
                  }`}
                >
                  {item.description}
                  {item.tooltip && (
                    <span className="block text-data text-muted-foreground mt-0.5 no-underline" style={{ textDecoration: "none" }}>
                      {item.tooltip}
                    </span>
                  )}
                </label>
              </div>
            );
          })}
      </div>
      )}
    </div>
  );
}

/** Checklists belonging to the estimating phase, which is what an estimate wants. */
const ESTIMATION_TYPE = "Estimation";
const TYPE_FILTERS = [ESTIMATION_TYPE, "Job", "Task", "Lead", "all"] as const;

export function EstimateChecklistPopover({ estimateId: _estimateId, projectId, wide }: EstimateChecklistPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  // A project carries checklists for everything it does; only the estimating
  // ones belong on an estimate. Anything else is reachable via this filter,
  // including checklists made without a template, which have no type at all.
  const [typeFilter, setTypeFilter] = useState<string>(ESTIMATION_TYPE);

  const { data: instances = [], isLoading } = useQuery<ChecklistInstance[]>({
    queryKey: ["/api/checklist-instances", { projectId }],
    queryFn: async () => {
      const res = await fetch(`/api/checklist-instances?projectId=${projectId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch checklists");
      return res.json();
    },
    enabled: !!projectId,
  });

  const visibleInstances =
    typeFilter === "all"
      ? instances
      : instances.filter(i => (i.templateType ?? null) === typeFilter);

  const totalCompleted = visibleInstances.reduce((sum, i) => sum + (i.completedCount ?? 0), 0);
  const totalItems = visibleInstances.reduce((sum, i) => sum + (i.totalCount ?? 0), 0);
  const hasItems = totalItems > 0;
  const firstName = visibleInstances[0]?.name ?? "Checklists";
  const label = visibleInstances.length > 1 ? `${visibleInstances.length} Checklists` : firstName;
  const progressPct = hasItems ? Math.round((totalCompleted / totalItems) * 100) : 0;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        {wide ? (
          <button
            className="h-8 flex items-center gap-2 px-3 border-l border-border/50 hover-elevate active-elevate-2 min-w-[160px] max-w-[260px]"
            data-testid="button-estimate-checklist"
            title="View estimate checklists"
          >
            <ClipboardList className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
            <span className="text-xs truncate flex-1 text-left text-muted-foreground">{label}</span>
            {hasItems && (
              <span className="text-data tabular-nums text-muted-foreground flex-shrink-0 bg-muted rounded px-1">
                {totalCompleted}/{totalItems}
              </span>
            )}
          </button>
        ) : (
          <button
            className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center relative"
            data-testid="button-estimate-checklist"
            title="View estimate checklists"
          >
            <ClipboardList className="w-3 h-3" />
            {hasItems && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-primary text-primary-foreground text-2xs rounded-full flex items-center justify-center">
                {totalCompleted > 9 ? "9+" : totalCompleted}
              </span>
            )}
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-88 p-0" align="end" style={{ width: "22rem" }}>
        <div className="p-3 border-b">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-sm">Estimate Checklists</h4>
              <p className="text-xs text-muted-foreground">Track your estimating process</p>
            </div>
            <div className="flex items-center gap-2">
              {hasItems && (
                <span className="text-xs font-medium text-muted-foreground">
                  {totalCompleted}/{totalItems}
                </span>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="h-6 w-6 border rounded-md hover-elevate active-elevate-2 flex items-center justify-center flex-shrink-0"
                    title={typeFilter === "all" ? "Showing all checklists" : `Showing ${typeFilter} checklists`}
                    aria-label="Filter checklists by type"
                    data-testid="button-checklist-type-filter"
                  >
                    <ListFilter className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuRadioGroup value={typeFilter} onValueChange={setTypeFilter}>
                    {TYPE_FILTERS.map(t => (
                      <DropdownMenuRadioItem
                        key={t}
                        value={t}
                        data-testid={`checklist-filter-${t}`}
                      >
                        {t === "all" ? "All checklists" : t}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {hasItems && (
            <Progress
              value={Math.round((totalCompleted / totalItems) * 100)}
              className="h-1 mt-2"
            />
          )}
        </div>

        <div className="max-h-96 overflow-y-auto overscroll-contain">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : visibleInstances.length === 0 ? (
            <div className="text-center py-8 px-4">
              <ClipboardList className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {instances.length === 0
                  ? "No checklists on this project yet."
                  : typeFilter === "all"
                    ? "No checklists on this project yet."
                    : `No ${typeFilter} checklists on this project.`}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {instances.length > 0 && typeFilter !== "all"
                  ? `This project has ${instances.length} other checklist${instances.length === 1 ? "" : "s"} — switch the filter to see them.`
                  : "Create checklists from the Project Checklists tab."}
              </p>
            </div>
          ) : (
            <div className="p-2 space-y-2">
              {visibleInstances.map((instance) => (
                <InstancePanel
                  key={instance.id}
                  instance={instance}
                  projectId={projectId}
                />
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
