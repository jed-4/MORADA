import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CalendarIcon,
  Filter,
  X,
  User,
  Flag,
  FolderOpen,
  CalendarDays,
} from "lucide-react";
import { format } from "date-fns";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";

export interface CalendarFilters {
  projects?: string[];
  status?: string[];
  eventTypes?: string[];
  assignees?: string[];
  dateFrom?: Date;
  dateTo?: Date;
}

interface CalendarFiltersProps {
  filters: CalendarFilters;
  onFiltersChange: (filters: CalendarFilters) => void;
  availableProjects?: { id: string; name: string; color?: string }[];
  availableStatuses?: { key: string; label: string }[];
  availableAssignees?: { id: string; name: string }[];
  showEventTypeFilter?: boolean;
  calendarType: "personal" | "business";
}

const EVENT_TYPE_OPTIONS = [
  { value: "task", label: "Tasks" },
  { value: "schedule-item", label: "Schedule Items" },
  { value: "google-calendar", label: "Google Calendar" },
];

export default function CalendarFilters({
  filters,
  onFiltersChange,
  availableProjects = [],
  availableStatuses = [],
  availableAssignees = [],
  showEventTypeFilter = true,
  calendarType,
}: CalendarFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState<"from" | "to" | null>(null);

  const updateFilter = (key: keyof CalendarFilters, value: any) => {
    onFiltersChange({
      ...filters,
      [key]: value,
    });
  };

  const toggleArrayFilter = (key: keyof CalendarFilters, value: string) => {
    const currentArray = (filters[key] as string[]) || [];
    const newArray = currentArray.includes(value)
      ? currentArray.filter(item => item !== value)
      : [...currentArray, value];
    
    updateFilter(key, newArray.length > 0 ? newArray : undefined);
  };

  const clearFilter = (key: keyof CalendarFilters) => {
    updateFilter(key, undefined);
  };

  const clearAllFilters = () => {
    onFiltersChange({});
  };

  const getActiveFilterCount = () => {
    return Object.entries(filters).filter(([_, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      return value !== undefined && value !== null;
    }).length;
  };

  const activeFilterCount = getActiveFilterCount();

  const formatDateRange = () => {
    if (filters.dateFrom && filters.dateTo) {
      return `${format(filters.dateFrom, "MMM dd")} - ${format(filters.dateTo, "MMM dd")}`;
    }
    if (filters.dateFrom) {
      return `From ${format(filters.dateFrom, "MMM dd")}`;
    }
    if (filters.dateTo) {
      return `Until ${format(filters.dateTo, "MMM dd")}`;
    }
    return null;
  };

  return (
    <div className="flex items-center gap-2">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button 
            variant="outline" 
            size="sm" 
            className="relative"
            data-testid="button-open-calendar-filters"
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
            {activeFilterCount > 0 && (
              <Badge 
                variant="destructive" 
                className="ml-2 h-5 w-5 p-0 text-xs flex items-center justify-center"
              >
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 max-h-[600px] overflow-y-auto p-4" align="end" data-testid="panel-calendar-filters">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Filter Events</h4>
              {activeFilterCount > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={clearAllFilters}
                  data-testid="button-clear-all-calendar-filters"
                >
                  Clear All
                </Button>
              )}
            </div>

            {showEventTypeFilter && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Event Type</Label>
                  {filters.eventTypes && filters.eventTypes.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => clearFilter("eventTypes")}
                      className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {EVENT_TYPE_OPTIONS.map(option => (
                    <div key={option.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={`eventType-${option.value}`}
                        checked={filters.eventTypes?.includes(option.value) || false}
                        onCheckedChange={() => toggleArrayFilter("eventTypes", option.value)}
                        data-testid={`filter-event-type-${option.value}`}
                      />
                      <Label 
                        htmlFor={`eventType-${option.value}`}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {option.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {availableProjects.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Project</Label>
                  {filters.projects && filters.projects.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => clearFilter("projects")}
                      className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <Select
                  value={filters.projects?.[0] || ""}
                  onValueChange={(value) => {
                    if (value) {
                      updateFilter("projects", [value]);
                    } else {
                      clearFilter("projects");
                    }
                  }}
                >
                  <SelectTrigger className="w-full" data-testid="select-project-filter">
                    <SelectValue placeholder="Select project..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Projects</SelectItem>
                    {availableProjects.map(project => (
                      <SelectItem key={project.id} value={project.id}>
                        <div className="flex items-center gap-2">
                          {project.color && (
                            <div 
                              className="w-2 h-2 rounded-full" 
                              style={{ backgroundColor: project.color }}
                            />
                          )}
                          {project.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {availableStatuses.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Flag className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Status</Label>
                  {filters.status && filters.status.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => clearFilter("status")}
                      className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2 max-h-32 overflow-y-auto">
                  {availableStatuses.map(status => (
                    <div key={status.key} className="flex items-center space-x-2">
                      <Checkbox
                        id={`status-${status.key}`}
                        checked={filters.status?.includes(status.key) || false}
                        onCheckedChange={() => toggleArrayFilter("status", status.key)}
                        data-testid={`filter-status-${status.key}`}
                      />
                      <Label 
                        htmlFor={`status-${status.key}`}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {status.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {availableAssignees.length > 0 && calendarType === "business" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Assignee</Label>
                  {filters.assignees && filters.assignees.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => clearFilter("assignees")}
                      className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2 max-h-32 overflow-y-auto">
                  {availableAssignees.map(assignee => (
                    <div key={assignee.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`assignee-${assignee.id}`}
                        checked={filters.assignees?.includes(assignee.id) || false}
                        onCheckedChange={() => toggleArrayFilter("assignees", assignee.id)}
                        data-testid={`filter-assignee-${assignee.id}`}
                      />
                      <Label 
                        htmlFor={`assignee-${assignee.id}`}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {assignee.name}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Date Range</Label>
                {(filters.dateFrom || filters.dateTo) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      clearFilter("dateFrom");
                      clearFilter("dateTo");
                    }}
                    className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Popover 
                    open={datePickerOpen === "from"} 
                    onOpenChange={(open) => setDatePickerOpen(open ? "from" : null)}
                  >
                    <PopoverTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full justify-start text-left font-normal"
                        data-testid="button-calendar-date-from"
                      >
                        <CalendarIcon className="mr-2 h-3 w-3" />
                        {filters.dateFrom ? format(filters.dateFrom, "MMM dd") : "From"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={filters.dateFrom}
                        onSelect={(date) => {
                          updateFilter("dateFrom", date);
                          setDatePickerOpen(null);
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>

                  <Popover 
                    open={datePickerOpen === "to"} 
                    onOpenChange={(open) => setDatePickerOpen(open ? "to" : null)}
                  >
                    <PopoverTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full justify-start text-left font-normal"
                        data-testid="button-calendar-date-to"
                      >
                        <CalendarIcon className="mr-2 h-3 w-3" />
                        {filters.dateTo ? format(filters.dateTo, "MMM dd") : "To"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={filters.dateTo}
                        onSelect={(date) => {
                          updateFilter("dateTo", date);
                          setDatePickerOpen(null);
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                {formatDateRange() && (
                  <div className="text-xs text-muted-foreground">
                    {formatDateRange()}
                  </div>
                )}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <div className="flex items-center gap-1 flex-wrap">
        {filters.eventTypes?.map(type => (
          <Badge key={`eventType-${type}`} variant="secondary" className="text-xs">
            {EVENT_TYPE_OPTIONS.find(t => t.value === type)?.label}
            <button
              onClick={() => toggleArrayFilter("eventTypes", type)}
              className="ml-1 hover:bg-muted rounded"
              data-testid={`remove-event-type-filter-${type}`}
            >
              <X className="h-2 w-2" />
            </button>
          </Badge>
        ))}
        
        {filters.projects?.map(projectId => {
          const project = availableProjects.find(p => p.id === projectId);
          return project ? (
            <Badge key={`project-${projectId}`} variant="secondary" className="text-xs">
              {project.name}
              <button
                onClick={() => toggleArrayFilter("projects", projectId)}
                className="ml-1 hover:bg-muted rounded"
                data-testid={`remove-project-filter-${projectId}`}
              >
                <X className="h-2 w-2" />
              </button>
            </Badge>
          ) : null;
        })}

        {filters.status?.map(statusKey => {
          const status = availableStatuses.find(s => s.key === statusKey);
          return status ? (
            <Badge key={`status-${statusKey}`} variant="secondary" className="text-xs">
              {status.label}
              <button
                onClick={() => toggleArrayFilter("status", statusKey)}
                className="ml-1 hover:bg-muted rounded"
                data-testid={`remove-status-filter-${statusKey}`}
              >
                <X className="h-2 w-2" />
              </button>
            </Badge>
          ) : null;
        })}

        {filters.assignees?.map(assigneeId => {
          const assignee = availableAssignees.find(a => a.id === assigneeId);
          return assignee ? (
            <Badge key={`assignee-${assigneeId}`} variant="secondary" className="text-xs">
              {assignee.name}
              <button
                onClick={() => toggleArrayFilter("assignees", assigneeId)}
                className="ml-1 hover:bg-muted rounded"
                data-testid={`remove-assignee-filter-${assigneeId}`}
              >
                <X className="h-2 w-2" />
              </button>
            </Badge>
          ) : null;
        })}

        {formatDateRange() && (
          <Badge variant="secondary" className="text-xs">
            {formatDateRange()}
            <button
              onClick={() => {
                clearFilter("dateFrom");
                clearFilter("dateTo");
              }}
              className="ml-1 hover:bg-muted rounded"
              data-testid="remove-calendar-date-filter"
            >
              <X className="h-2 w-2" />
            </button>
          </Badge>
        )}
      </div>
    </div>
  );
}
