import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Calendar, Pencil, DollarSign, Users } from "lucide-react";
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

  const hoverClass = isHovered 
    ? editMode 
      ? 'shadow-xl scale-[1.01]'
      : 'shadow-md'
    : 'shadow-sm';

  return (
    <Card
      className={`min-h-[5rem] transition-all duration-200 cursor-pointer rounded-xl border-border/50 ${hoverClass} ${isDragging ? 'opacity-80 shadow-lg' : ''}`}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-testid={`project-card-${project.id}`}
    >
      <CardContent className="p-2.5 h-full flex flex-col gap-1.5">
        <div className="flex items-start gap-1.5">
          <ProjectIcon
            icon={project.icon}
            color={project.color}
            className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"
          />
          <h3 className="text-sm leading-5 truncate text-foreground font-medium flex-1 min-w-0">
            {project.name}
          </h3>
          <Pencil className={`h-3 w-3 text-muted-foreground shrink-0 transition-opacity ${isHovered ? 'opacity-100' : 'opacity-0'}`} style={{ visibility: isHovered ? 'visible' : 'hidden' }} />
        </div>

        {visibleFields.client && project.clientName && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground pl-5">
            <Users className="h-2.5 w-2.5 flex-shrink-0" />
            <span className="truncate">{project.clientName}</span>
          </div>
        )}

        {visibleFields.budget && costValue ? (
          <div className="flex items-center gap-1 text-[11px] font-semibold text-foreground pl-5">
            <DollarSign className="h-2.5 w-2.5 flex-shrink-0" />
            <span>{formatCurrency(costValue)}</span>
          </div>
        ) : null}

        <div className="flex items-end justify-between gap-1.5 mt-auto">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
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
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 rounded-full bg-background border-border/50 no-default-hover-elevate no-default-active-elevate">
                <Calendar className="h-2 w-2 mr-0.5" />
                {format(new Date(project.endDate), 'MMM d')}
              </Badge>
            )}
          </div>

          <div className="flex flex-col items-center gap-0.5 shrink-0">
            {visibleFields.progress && project.progress !== null && project.progress !== undefined && (
              <span className="text-[10px] font-medium text-muted-foreground">
                {project.progress}%
              </span>
            )}
            {visibleFields.foreman && project.foreman ? (
              <Avatar className="h-5 w-5 border border-border/50">
                <AvatarFallback className="text-[10px] bg-muted text-muted-foreground">
                  {getInitials(project.foreman)}
                </AvatarFallback>
              </Avatar>
            ) : visibleFields.foreman ? (
              <div className="w-5 h-5 rounded-full border border-dashed border-muted-foreground/20" />
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
