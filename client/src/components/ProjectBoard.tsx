import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type Project, type FieldOption } from "@shared/schema";
import { useLocation } from "wouter";
import { Calendar, MapPin, DollarSign, Settings2, Check } from "lucide-react";
import { ProjectIcon } from "./ProjectIcon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery } from "@tanstack/react-query";

interface ProjectBoardProps {
  projects: Project[];
  isLoading: boolean;
}

type GroupBy = "parent" | "substatus";
type CardSize = "compact" | "medium" | "wide";

interface VisibleFields {
  description: boolean;
  location: boolean;
  dates: boolean;
  budget: boolean;
}

interface ViewPreferences {
  groupBy: GroupBy;
  cardSize: CardSize;
  visibleFields: VisibleFields;
}

const DEFAULT_PREFERENCES: ViewPreferences = {
  groupBy: "parent",
  cardSize: "medium",
  visibleFields: {
    description: true,
    location: true,
    dates: true,
    budget: true,
  },
};

const STORAGE_KEY = "projectBoardPreferences";

const CARD_SIZE_CONFIG = {
  compact: { cols: "md:grid-cols-4 lg:grid-cols-5", cardClass: "" },
  medium: { cols: "md:grid-cols-3 lg:grid-cols-4", cardClass: "" },
  wide: { cols: "md:grid-cols-2 lg:grid-cols-3", cardClass: "" },
};

export function ProjectBoard({ projects, isLoading }: ProjectBoardProps) {
  const [, navigate] = useLocation();
  
  // Load preferences from localStorage
  const [preferences, setPreferences] = useState<ViewPreferences>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) } : DEFAULT_PREFERENCES;
    } catch {
      return DEFAULT_PREFERENCES;
    }
  });

  // Save preferences to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  // Fetch project status field options
  const { data: statusOptions = [], isLoading: isLoadingStatuses } = useQuery<FieldOption[]>({
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

  // Get parent statuses and substatus options
  const parentStatuses = useMemo(
    () => statusOptions.filter(opt => !opt.parentId).sort((a, b) => a.sortOrder - b.sortOrder),
    [statusOptions]
  );

  const subStatuses = useMemo(
    () => statusOptions.filter(opt => opt.parentId).sort((a, b) => a.sortOrder - b.sortOrder),
    [statusOptions]
  );

  // Build columns based on grouping preference
  const columns = useMemo(() => {
    const mainColumns = preferences.groupBy === "parent"
      ? parentStatuses.map(status => ({
          id: status.key,
          title: status.name,
          color: status.color || "#6b7280",
          filterFn: (p: Project) => p.projectStatus === status.key,
        }))
      : subStatuses.map(status => ({
          id: status.key,
          title: status.name,
          color: status.color || "#6b7280",
          parentId: status.parentId,
          filterFn: (p: Project) => p.projectSubStatus === status.key,
        }));

    // Add "Unassigned" column for projects without hierarchical status
    // This catches both null values and legacy status-only projects
    mainColumns.push({
      id: "unassigned",
      title: "Unassigned",
      color: "#9ca3af",
      filterFn: (p: Project) => {
        if (preferences.groupBy === "parent") {
          // Include if projectStatus is not set (regardless of legacy status)
          return !p.projectStatus;
        } else {
          // Include if projectSubStatus is not set (regardless of legacy status)
          return !p.projectSubStatus;
        }
      },
    });

    return mainColumns;
  }, [preferences.groupBy, parentStatuses, subStatuses]);

  const updatePreference = <K extends keyof ViewPreferences>(
    key: K,
    value: ViewPreferences[K]
  ) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
  };

  const toggleField = (field: keyof VisibleFields) => {
    setPreferences(prev => ({
      ...prev,
      visibleFields: {
        ...prev.visibleFields,
        [field]: !prev.visibleFields[field],
      },
    }));
  };

  const formatCurrency = (cents: number | null) => {
    if (!cents) return "$0";
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
    }).format(cents / 100);
  };

  const formatDate = (date: string | null) => {
    if (!date) return "TBD";
    return new Date(date).toLocaleDateString('en-AU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  if (isLoading || isLoadingStatuses) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading projects...</p>
      </div>
    );
  }

  if (!isLoadingStatuses && statusOptions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-muted-foreground mb-2">No project statuses configured</p>
          <p className="text-sm text-muted-foreground">
            Configure project statuses in Field Settings to use the board view
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* View Controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            Group by: {preferences.groupBy === "parent" ? "Parent Status" : "Sub-Status"}
          </span>
          <span className="text-sm text-muted-foreground">•</span>
          <span className="text-sm font-medium text-muted-foreground">
            {CARD_SIZE_CONFIG[preferences.cardSize].cols.includes('5') ? 'Compact' : 
             CARD_SIZE_CONFIG[preferences.cardSize].cols.includes('4') ? 'Medium' : 'Wide'} cards
          </span>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" data-testid="button-view-settings">
              <Settings2 className="h-4 w-4 mr-2" />
              View Options
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Group By</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={preferences.groupBy}
              onValueChange={(value) => updatePreference("groupBy", value as GroupBy)}
            >
              <DropdownMenuRadioItem value="parent" data-testid="radio-group-parent">
                Parent Status
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="substatus" data-testid="radio-group-substatus">
                Sub-Status
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>

            <DropdownMenuSeparator />

            <DropdownMenuLabel>Card Size</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={preferences.cardSize}
              onValueChange={(value) => updatePreference("cardSize", value as CardSize)}
            >
              <DropdownMenuRadioItem value="compact" data-testid="radio-size-compact">
                Compact
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="medium" data-testid="radio-size-medium">
                Medium
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="wide" data-testid="radio-size-wide">
                Wide
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>

            <DropdownMenuSeparator />

            <DropdownMenuLabel>Show Fields</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={preferences.visibleFields.description}
              onCheckedChange={() => toggleField("description")}
              data-testid="checkbox-field-description"
            >
              Description
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={preferences.visibleFields.location}
              onCheckedChange={() => toggleField("location")}
              data-testid="checkbox-field-location"
            >
              Location
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={preferences.visibleFields.dates}
              onCheckedChange={() => toggleField("dates")}
              data-testid="checkbox-field-dates"
            >
              Dates
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={preferences.visibleFields.budget}
              onCheckedChange={() => toggleField("budget")}
              data-testid="checkbox-field-budget"
            >
              Budget
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-auto">
        <div className={`grid grid-cols-1 ${CARD_SIZE_CONFIG[preferences.cardSize].cols} gap-6 h-full`}>
          {columns.map((column) => {
            const columnProjects = projects.filter(column.filterFn);
            return (
              <div key={column.id} className="flex flex-col min-h-0">
                {/* Column Header */}
                <div className="flex items-center justify-between mb-4 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: column.color }}
                    />
                    <h3 className="font-semibold text-base truncate">{column.title}</h3>
                    <Badge variant="secondary" data-testid={`badge-count-${column.id}`}>
                      {columnProjects.length}
                    </Badge>
                  </div>
                </div>

                {/* Cards */}
                <div className="flex-1 space-y-3 overflow-y-auto min-h-0">
                  {columnProjects.length === 0 ? (
                    <Card className="border-dashed">
                      <CardContent className="flex items-center justify-center py-8">
                        <p className="text-sm text-muted-foreground">
                          No projects
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    columnProjects.map((project) => (
                      <Card
                        key={project.id}
                        className="hover-elevate cursor-pointer transition-all"
                        onClick={() => navigate(`/projects/${project.id}`)}
                        data-testid={`card-project-${project.id}`}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-start gap-3">
                            <ProjectIcon
                              icon={project.icon}
                              color={project.color}
                              className="w-8 h-8 flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <CardTitle className="text-base truncate">
                                {project.name}
                              </CardTitle>
                              {preferences.visibleFields.description && project.description && (
                                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                  {project.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          {/* Location */}
                          {preferences.visibleFields.location && project.location && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="truncate">{project.location}</span>
                            </div>
                          )}

                          {/* Dates */}
                          {preferences.visibleFields.dates && (project.startDate || project.endDate) && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="truncate">
                                {formatDate(project.startDate)} - {formatDate(project.endDate)}
                              </span>
                            </div>
                          )}

                          {/* Budget */}
                          {preferences.visibleFields.budget && project.budget !== null && project.budget > 0 && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <DollarSign className="h-3.5 w-3.5 flex-shrink-0" />
                              <span>{formatCurrency(project.budget)}</span>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
