import { CheckSquare, Circle, ListChecks } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TaskTooltip } from "@/components/ui/task-tooltip";
import { getPriorityStyle } from "@/lib/priorityConfig";
import { cn } from "@/lib/utils";

/**
 * One task row, shared by every task-bearing widget:
 *   - project dashboard  Tasks      (accent = task status colour)
 *   - workspace          My Tasks   (accent = project colour, cross-project)
 *   - workspace          My Day     (accent = project colour, cross-project)
 *
 * Design rules this encodes, so they stay true everywhere:
 *   - Priority is a small dot, never a border or a filled chip.
 *   - The due date is the only element allowed a coloured wash, and only when
 *     it is actually urgent (overdue or today). Later dates are muted text.
 *   - The accent (status or project) is a dot beside its label, not a chip.
 *   - Chips size to their content; nothing is locked to a fixed width.
 */

export interface TaskLike {
  id: string;
  title: string;
  status?: string | null;
  priority?: string | null;
  dueDate?: Date | string | null;
  assigneeName?: string | null;
  checklist?: unknown;
}

export function isTaskDone(status: string | null | undefined): boolean {
  // Task list filters treat "complete" as done too; without it here a task in
  // that state was hidden from the list while never rendering struck through.
  return status === "done" || status === "complete";
}

/** Day-boundary comparison — a task due today is not overdue until tomorrow. */
export function formatTaskDue(dueDate: Date | string | null | undefined): {
  label: string;
  tone: "overdue" | "today" | "soon" | "later";
} | null {
  if (!dueDate) return null;
  const due = new Date(dueDate as string);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86400000);

  if (days < 0) {
    const n = Math.abs(days);
    return { label: n === 1 ? "1d overdue" : `${n}d overdue`, tone: "overdue" };
  }
  if (days === 0) return { label: "Today", tone: "today" };
  if (days === 1) return { label: "Tomorrow", tone: "soon" };
  return {
    label: new Date(dueDate as string).toLocaleDateString("en-AU", { month: "short", day: "numeric" }),
    tone: "later",
  };
}

/**
 * --coral-light / --amber-light invert between themes (near-white in light,
 * dark in dark) while --coral / --amber stay put. So the wash background can
 * come straight from the token, but the text has to flip with it — a single
 * hardcoded ink is unreadable in one theme or the other.
 */
const DUE_WASH: Record<string, string | undefined> = {
  overdue:
    "bg-[hsl(var(--coral-light))] text-[hsl(11_52%_32%)] dark:text-[hsl(11_52%_84%)]",
  today:
    "bg-[hsl(var(--amber-light))] text-[hsl(42_45%_26%)] dark:text-[hsl(42_58%_84%)]",
  soon: undefined,
  later: undefined,
};

function initials(name: string): string {
  return name.split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

/**
 * getPriorityStyle falls back to the muted "none" style, which would paint a
 * grey dot on every unprioritised task. No priority means no dot.
 */
function priorityDotColor(priority: string | null | undefined): string | null {
  if (!priority || priority.toLowerCase() === "none") return null;
  return getPriorityStyle(priority).color;
}

export interface TaskRowProps {
  task: TaskLike;
  /** Dot colour beside the accent label — status colour, or project colour. */
  accentColor?: string | null;
  /** Text beside the accent dot, e.g. the project name. */
  accentLabel?: string | null;
  onToggle?: (task: TaskLike) => void;
  onClick?: (id: string) => void;
  /** Hides the checklist chip and assignee where space is tight (board cards). */
  compact?: boolean;
  testIdPrefix?: string;
}

export function TaskRow({
  task,
  accentColor,
  accentLabel,
  onToggle,
  onClick,
  compact = false,
  testIdPrefix = "task-row",
}: TaskRowProps) {
  const completed = isTaskDone(task.status);
  const due = formatTaskDue(task.dueDate);
  const priorityColor = priorityDotColor(task.priority);

  const checklist = task.checklist as Array<{ completed?: boolean }> | undefined;
  const checklistTotal = Array.isArray(checklist) ? checklist.length : 0;
  const checklistDone = checklistTotal ? checklist!.filter(c => c?.completed).length : 0;

  // Urgency earns a wash; everything else stays quiet text.
  const dueWash = due && !completed ? DUE_WASH[due.tone] : undefined;

  return (
    <div
      className={cn(
        "group/task flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer hover:bg-muted/60",
        completed && "opacity-50",
      )}
      onClick={() => onClick?.(task.id)}
      data-testid={`${testIdPrefix}-${task.id}`}
    >
      <button
        className="flex-shrink-0"
        onClick={e => { e.stopPropagation(); onToggle?.(task); }}
        aria-label={completed ? "Mark incomplete" : "Mark complete"}
        data-testid={`${testIdPrefix}-toggle-${task.id}`}
      >
        {completed
          ? <CheckSquare className="h-4 w-4" style={{ color: "hsl(var(--sage))" }} />
          : <Circle className="h-4 w-4 text-muted-foreground" />}
      </button>

      {priorityColor && !completed && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="flex-shrink-0 w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: priorityColor }}
            />
          </TooltipTrigger>
          <TooltipContent side="top">
            {task.priority!.charAt(0).toUpperCase() + task.priority!.slice(1)} priority
          </TooltipContent>
        </Tooltip>
      )}

      <div className="flex-1 min-w-0">
        <TaskTooltip content={task.title}>
          <span className={cn("text-sm truncate block leading-snug", completed && "line-through")}>
            {task.title}
          </span>
        </TaskTooltip>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {!compact && checklistTotal > 0 && (
          <span className="text-[11px] text-muted-foreground flex items-center gap-0.5 tabular-nums">
            <ListChecks className="h-3 w-3" />
            {checklistDone}/{checklistTotal}
          </span>
        )}

        {due && (
          dueWash ? (
            <span
              className={cn(
                "text-[11px] font-medium px-1.5 py-px rounded-full whitespace-nowrap tabular-nums",
                dueWash,
              )}
            >
              {due.label}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground whitespace-nowrap tabular-nums">
              {due.label}
            </span>
          )
        )}

        {accentLabel && (
          <span className="flex items-center gap-1 min-w-0 max-w-[110px]">
            {accentColor && (
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: accentColor }}
              />
            )}
            <span className="text-[11px] text-muted-foreground truncate" title={accentLabel}>
              {accentLabel}
            </span>
          </span>
        )}

        {!compact && task.assigneeName && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Avatar className="h-4 w-4 flex-shrink-0">
                <AvatarFallback className="text-[9px] bg-primary/10 text-primary">
                  {initials(task.assigneeName)}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent side="top">{task.assigneeName}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

/** Compact card for board columns — same rules, stacked instead of inline. */
export function TaskCard({
  task,
  accentColor,
  accentLabel,
  onToggle,
  onClick,
  testIdPrefix = "task-card",
}: TaskRowProps) {
  const completed = isTaskDone(task.status);
  const due = formatTaskDue(task.dueDate);
  const priorityColor = priorityDotColor(task.priority);
  const dueWash = due && !completed ? DUE_WASH[due.tone] : undefined;

  return (
    <div
      className={cn(
        "rounded-md border bg-card px-2 py-1.5 cursor-pointer hover:bg-muted/60 space-y-1",
        completed && "opacity-50",
      )}
      onClick={() => onClick?.(task.id)}
      data-testid={`${testIdPrefix}-${task.id}`}
    >
      <div className="flex items-start gap-1.5">
        <button
          className="flex-shrink-0 mt-0.5"
          onClick={e => { e.stopPropagation(); onToggle?.(task); }}
          aria-label={completed ? "Mark incomplete" : "Mark complete"}
        >
          {completed
            ? <CheckSquare className="h-3.5 w-3.5" style={{ color: "hsl(var(--sage))" }} />
            : <Circle className="h-3.5 w-3.5 text-muted-foreground" />}
        </button>
        {priorityColor && !completed && (
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-[7px]"
            style={{ backgroundColor: priorityColor }}
          />
        )}
        <span className={cn("text-xs leading-snug line-clamp-2 min-w-0", completed && "line-through")}>
          {task.title}
        </span>
      </div>

      {(due || accentLabel) && (
        <div className="flex items-center justify-between gap-1 pl-5">
          {due ? (
            dueWash ? (
              <span
                className={cn(
                  "text-[10px] font-medium px-1.5 py-px rounded-full whitespace-nowrap tabular-nums",
                  dueWash,
                )}
              >
                {due.label}
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground tabular-nums">{due.label}</span>
            )
          ) : <span />}
          {accentLabel && (
            <span className="flex items-center gap-1 min-w-0">
              {accentColor && (
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: accentColor }}
                />
              )}
              <span className="text-[10px] text-muted-foreground truncate" title={accentLabel}>
                {accentLabel}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
