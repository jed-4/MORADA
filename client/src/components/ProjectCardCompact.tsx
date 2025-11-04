import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Pencil, DollarSign, Users } from "lucide-react";
import { type Project, type FieldOption } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ProjectIcon } from "./ProjectIcon";

interface ProjectCardCompactProps {
  project: Project;
  onClick?: () => void;
  isDragging?: boolean;
  visibleFields?: {
    client?: boolean;
    budget?: boolean;
    stage?: boolean;
    dueDate?: boolean;
    progress?: boolean;
    foreman?: boolean;
  };
}

// Status colors matching Casva lilac theme
const getStatusColor = (statusKey: string | null, statusOptions: FieldOption[]): string => {
  if (!statusKey) return 'bg-gray-500/15 text-gray-700 dark:text-gray-400 border-gray-500/20';
  
  const status = statusOptions.find(opt => opt.key === statusKey);
  if (status?.color) {
    // Convert hex color to RGB for bg with opacity
    const hex = status.color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    return `border-[${status.color}]/20`;
  }
  
  return 'bg-[#bba7db]/15 text-[#bba7db] border-[#bba7db]/20'; // Lilac default
};

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
  visibleFields = {}
}: ProjectCardCompactProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Fetch project status field options
  const { data: statusOptions = [] } = useQuery<FieldOption[]>({
    queryKey: ['/api/field-options', 'project.substatus'],
    queryFn: async () => {
      const response = await fetch('/api/field-categories/by-key/project.substatus');
      if (!response.ok) return [];
      const category = await response.json();
      if (!category?.id) return [];
      
      const optionsResponse = await fetch(`/api/field-categories/${category.id}/options`);
      if (!optionsResponse.ok) return [];
      return await optionsResponse.json();
    },
  });

  const statusOption = statusOptions.find(opt => opt.key === project.projectSubStatus);
  const statusColor = getStatusColor(project.projectSubStatus, statusOptions);

  return (
    <Card
      className={`h-20 transition-all duration-150 cursor-pointer rounded-lg border-border/50 ${
        isHovered ? 'shadow-xl scale-[1.01]' : 'shadow-sm'
      } ${isDragging ? 'opacity-80 shadow-lg' : ''}`}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-testid={`project-card-${project.id}`}
    >
      <CardContent className="p-2 h-full flex flex-col justify-between">
        <div className="flex items-start gap-1.5">
          {/* Project Icon */}
          <ProjectIcon
            icon={project.icon}
            color={project.color}
            className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"
          />

          {/* Title & Status */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-1">
              <h3 className="text-sm leading-5 truncate flex-1 text-foreground font-medium">
                {project.name}
              </h3>
              
              {/* Status chip - lilac #bba7db */}
              {statusOption && (
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
            </div>

            {/* Custom fields - small line below title */}
            {(visibleFields.client || visibleFields.budget || visibleFields.progress) && (
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                {visibleFields.client && project.clientName && (
                  <span className="flex items-center gap-0.5 truncate">
                    <Users className="h-2.5 w-2.5 flex-shrink-0" />
                    {project.clientName}
                  </span>
                )}
                {visibleFields.budget && project.budget && (
                  <span className="flex items-center gap-0.5">
                    <DollarSign className="h-2.5 w-2.5" />
                    {formatCurrency(project.budget)}
                  </span>
                )}
                {visibleFields.progress && project.progress !== null && project.progress !== undefined && (
                  <span className="flex items-center gap-0.5">
                    {project.progress}%
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Pencil icon on hover */}
          {isHovered && (
            <Pencil className="h-3 w-3 text-[#bba7db] shrink-0" />
          )}
        </div>

        {/* Bottom row: Due date/Stage & Foreman */}
        <div className="flex items-center justify-between mt-1">
          {/* Due date or Stage chip */}
          {visibleFields.dueDate && project.endDate ? (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 rounded-full bg-background border-border/50 no-default-hover-elevate no-default-active-elevate">
              <Calendar className="h-2 w-2 mr-0.5" />
              {format(new Date(project.endDate), 'MMM d')}
            </Badge>
          ) : visibleFields.stage && statusOption ? (
            <Badge 
              variant="outline" 
              className="text-[10px] px-1.5 py-0 h-4 rounded-full border no-default-hover-elevate no-default-active-elevate truncate max-w-[120px]"
              style={{
                backgroundColor: `${statusOption.color}10`,
                borderColor: `${statusOption.color}30`,
                color: statusOption.color
              }}
            >
              <span className="truncate">{statusOption.name}</span>
            </Badge>
          ) : (
            <div />
          )}

          {/* Foreman avatar */}
          {visibleFields.foreman && project.foreman ? (
            <Avatar className="h-5 w-5 border border-border/50">
              <AvatarFallback className="text-[10px] bg-[#bba7db]/10 text-[#bba7db]">
                {getInitials(project.foreman)}
              </AvatarFallback>
            </Avatar>
          ) : !visibleFields.foreman ? null : (
            <div className="w-5 h-5 rounded-full border border-dashed border-muted-foreground/20" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
