import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import type { WidgetProps } from "@/types/widgets";
import { WidgetSkeleton, WidgetEmpty, WidgetError } from "@/components/ui/widget-states";

interface ActivityRow {
  id: string;
  type: string;
  description: string;
  projectName: string | null;
  actorName: string;
  actorInitials: string;
  createdAt: string;
}

interface ActivityResponse {
  activities: ActivityRow[];
}

const TYPE_DOT_CLASS: Record<string, string> = {
  comment: "bg-bp-teal",
  upload: "bg-bp-purple",
  approval: "bg-bp-green",
  variation: "bg-bp-amber",
  rfi: "bg-bp-amber",
  task: "bg-bp-teal",
  payment: "bg-bp-green",
  safety: "bg-bp-coral",
  // Backend uses canonical activity types — map common ones to closest colour
  estimate: "bg-bp-purple",
  bill: "bg-bp-green",
  invoice: "bg-bp-green",
  proposal: "bg-bp-purple",
  project: "bg-bp-teal",
  site_diary: "bg-bp-amber",
  schedule: "bg-bp-teal",
};

function dotClass(type: string): string {
  return TYPE_DOT_CLASS[type] ?? "bg-bp-muted";
}

export default function BusinessActivityWidget({}: WidgetProps) {
  const { data, isLoading, isError, refetch } = useQuery<ActivityResponse>({
    queryKey: ["/api/business/activity"],
  });

  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => refetch()} message="Couldn't load activity." />;

  const activities = data?.activities ?? [];
  if (activities.length === 0) return <WidgetEmpty message="No recent activity" />;

  return (
    <div className="py-2" data-testid="business-activity-widget">
      {activities.map((a, idx) => {
        const isLast = idx === activities.length - 1;
        return (
          <div
            key={a.id}
            className="flex items-start gap-3 px-5 py-2 relative"
            data-testid={`activity-row-${a.id}`}
          >
            {/* Dot + connector line */}
            <div className="flex flex-col items-center shrink-0 self-stretch">
              <span className={`w-2 h-2 rounded-full mt-1.5 ${dotClass(a.type)}`} />
              {!isLast && <span className="w-px flex-1 bg-bp-border mt-1" />}
            </div>

            {/* Body */}
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex items-start justify-between gap-3">
                <p
                  className="text-[12px] font-medium text-bp-card-foreground truncate"
                  title={a.description}
                >
                  {a.description}
                </p>
                <span className="text-[10px] text-bp-muted shrink-0 whitespace-nowrap">
                  {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                </span>
              </div>
              <p className="text-[10px] text-bp-muted truncate mt-0.5">
                {a.projectName ? `${a.projectName} · ` : ""}
                {a.actorName}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
