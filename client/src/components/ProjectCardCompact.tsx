import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Calendar, Pencil } from "lucide-react";
import { type Project, type FieldOption } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ProjectIcon } from "./ProjectIcon";

interface EnrichedProject extends Project {
  clientName?: string | null;
  foreman?: string | null;
  progress?: number | null;
}

interface ProjectCardCompactProps {
  project: EnrichedProject;
  onClick?: () => void;
  isDragging?: boolean;
  editMode?: boolean;
  groupBy?: "phase" | "status";
  visibleFields?: {
    client?: boolean;
    budget?: boolean;
    phase?: boolean;
    dueDate?: boolean;
    progress?: boolean;
    foreman?: boolean;
  };
}

const getInitials = (name: string | null | undefined): string => {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
};

const formatCurrency = (cents: number | null) => {
  if (!cents) return "$0";
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
  }).format(cents / 100);
};

function ProgressRing({ pct }: { pct: number }) {
  const size = 18;
  const stroke = 2.5;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const filled = circ * Math.min(Math.max(pct, 0), 100) / 100;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        className="text-muted-foreground/20"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeDashoffset={circ / 4}
        strokeLinecap="round"
        className="text-primary"
      />
      <text
        x={size / 2}
        y={size / 2 + 1.5}
        textAnchor="middle"
        fontSize="4.5"
        fill="currentColor"
        className="text-muted-foreground"
      >
        {pct}
      </text>
    </svg>
  );
}

export default function ProjectCardCompact({
  project,
  onClick,
  isDragging = false,
  editMode = false,
  groupBy = "phase",
  visibleFields = {}
}: ProjectCardCompactProps) {
  const [isHovered, setIsHovered] = useState(false);

  const { data: allStatusOptions = [] } = useQuery<FieldOption[]>({
    queryKey: ['/api/field-options', 'project.status'],
    queryFn: async () => {
      const response = await fetch('/api/field-categories/by-key/project.status');
      if (!response.ok) return [];
      const category = await response.json();
      if (!category?.id) return [];
      const optionsResponse = await fetch(`/api/field-categories/${category.id}/options`);
      if (!optionsResponse.ok) return [];
      return await optionsResponse.json();
    },
  });

  const statusOption = allStatusOptions.find(opt => opt.key === project.projectSubStatus);
  const costValue = project.contractCost || project.clientBudget || project.budget;

  const showBudgetRow = (visibleFields.budget && !!costValue) || (visibleFields.progress && project.progress != null);
  const showClientRow = (visibleFields.client && !!project.clientName) || (visibleFields.foreman);
  const showBadgeRow = (groupBy === "phase" && !!statusOption) || (visibleFields.dueDate && !!project.endDate);

  const hoverClass = isHovered
    ? editMode
      ? 'shadow-xl scale-[1.01]'
      : 'shadow-md'
    : 'shadow-sm';

  return (
    <Card
      className={`transition-all duration-200 cursor-pointer rounded-xl border-border/50 ${hoverClass} ${isDragging ? 'opacity-80 shadow-lg' : ''}`}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-testid={`project-card-${project.id}`}
    >
      <CardContent className="p-2.5 flex flex-col gap-1">
        {/* Row 1: icon + name + pencil */}
        <div className="flex items-start gap-1.5">
          <ProjectIcon
            icon={project.icon}
            color={project.color}
            className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"
          />
          <h3 className="text-sm leading-5 truncate text-foreground font-medium flex-1 min-w-0">
            {project.name}
          </h3>
          <Pencil
            className={`h-3 w-3 text-muted-foreground shrink-0 transition-opacity ${isHovered ? 'opacity-100' : 'opacity-0'}`}
            style={{ visibility: isHovered ? 'visible' : 'hidden' }}
          />
        </div>

        {/* Row 2: budget left, progress ring right */}
        {showBudgetRow && (
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[11px] font-semibold text-foreground truncate">
              {visibleFields.budget && costValue ? formatCurrency(costValue) : ''}
            </span>
            {visibleFields.progress && project.progress != null && (
              <ProgressRing pct={project.progress} />
            )}
          </div>
        )}

        {/* Row 3: client left, foreman avatar right */}
        {showClientRow && (
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[11px] text-muted-foreground truncate flex-1 min-w-0">
              {visibleFields.client && project.clientName ? project.clientName : ''}
            </span>
            {visibleFields.foreman && project.foreman ? (
              <Avatar className="h-5 w-5 border border-border/50 shrink-0">
                <AvatarFallback className="text-[10px] bg-muted text-muted-foreground">
                  {getInitials(project.foreman)}
                </AvatarFallback>
              </Avatar>
            ) : visibleFields.foreman ? (
              <div className="w-5 h-5 rounded-full border border-dashed border-muted-foreground/20 shrink-0" />
            ) : null}
          </div>
        )}

        {/* Row 4: status badge + due date, hard left */}
        {showBadgeRow && (
          <div className="flex items-center gap-1 flex-wrap">
            {groupBy === "phase" && statusOption && (
              <Badge
                className="text-[10px] px-1.5 py-0 h-4 rounded-full border no-default-hover-elevate no-default-active-elevate shrink-0"
                style={{
                  backgroundColor: `${statusOption.color}15`,
                  color: statusOption.color,
                  borderColor: `${statusOption.color}30`
                }}
              >
                {statusOption.name}
              </Badge>
            )}
            {visibleFields.dueDate && project.endDate && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4 rounded-full bg-background border-border/50 no-default-hover-elevate no-default-active-elevate"
              >
                <Calendar className="h-2 w-2 mr-0.5" />
                {format(new Date(project.endDate), 'MMM d')}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
