import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
  Calendar,
  CalendarIcon,
  Filter,
  X,
  User,
  Flag,
  Tag,
  FolderOpen,
} from "lucide-react";
import { format } from "date-fns";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";

export interface FilterState {
  status?: string[];
  priority?: string[];
  assignee?: string[];
  project?: string[];
  tags?: string[];
  dueDateFrom?: Date;
  dueDateTo?: Date;
  search?: string;
}

interface FilterPanelProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  availableAssignees?: string[];
  availableProjects?: string[];
  availableTags?: string[];
}

const STATUS_OPTIONS = [
  { value: "todo", label: "To Do", color: "bg-slate-100" },
  { value: "in-progress", label: "In Progress", color: "bg-blue-100" },
  { value: "done", label: "Done", color: "bg-green-100" },
];

const PRIORITY_OPTIONS = [
  { value: "high", label: "High", color: "bg-red-100" },
  { value: "medium", label: "Medium", color: "bg-yellow-100" },
  { value: "low", label: "Low", color: "bg-green-100" },
];

export default function FilterPanel({
  filters,
  onFiltersChange,
  availableAssignees = [],
  availableProjects = [],
  availableTags = [],
}: FilterPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState<"from" | "to" | null>(null);

  const updateFilter = (key: keyof FilterState, value: any) => {
    onFiltersChange({
      ...filters,
      [key]: value,
    });
  };

  const toggleArrayFilter = (key: keyof FilterState, value: string) => {
    const currentArray = (filters[key] as string[]) || [];
    const newArray = currentArray.includes(value)
      ? currentArray.filter(item => item !== value)
      : [...currentArray, value];
    
    updateFilter(key, newArray.length > 0 ? newArray : undefined);
  };

  const clearFilter = (key: keyof FilterState) => {
    updateFilter(key, undefined);
  };

  const clearAllFilters = () => {
    onFiltersChange({});
  };

  const getActiveFilterCount = () => {
    return Object.entries(filters).filter(([_, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      return value !== undefined && value !== null && value !== "";
    }).length;
  };

  const activeFilterCount = getActiveFilterCount();

  const formatDateRange = () => {
    if (filters.dueDateFrom && filters.dueDateTo) {
      return `${format(filters.dueDateFrom, "MMM dd")} - ${format(filters.dueDateTo, "MMM dd")}`;
    }
    if (filters.dueDateFrom) {
      return `From ${format(filters.dueDateFrom, "MMM dd")}`;
    }
    if (filters.dueDateTo) {
      return `Until ${format(filters.dueDateTo, "MMM dd")}`;
    }
    return null;
  };

  return (
    <div className="flex items-center gap-2">
      {/* Search Input */}
      <div className="relative">
        <Input
          placeholder="Search tasks..."
          value={filters.search || ""}
          onChange={(e) => updateFilter("search", e.target.value || undefined)}
          className="w-64 pr-8"
          data-testid="input-search-tasks"
        />
        {filters.search && (
          <button
            onClick={() => clearFilter("search")}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
            data-testid="button-clear-search"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Filter Popover */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button 
            variant="outline" 
            size="sm" 
            className="relative"
            data-testid="button-open-filters"
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
        <PopoverContent className="w-96 p-4" align="end" data-testid="panel-filters">
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Filter Tasks</h4>
              {activeFilterCount > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={clearAllFilters}
                  data-testid="button-clear-all-filters"
                >
                  Clear All
                </Button>
              )}
            </div>

            {/* Status Filter */}
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
              <div className="grid grid-cols-1 gap-2">
                {STATUS_OPTIONS.map(option => (
                  <div key={option.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`status-${option.value}`}
                      checked={filters.status?.includes(option.value) || false}
                      onCheckedChange={() => toggleArrayFilter("status", option.value)}
                      data-testid={`filter-status-${option.value}`}
                    />
                    <Label 
                      htmlFor={`status-${option.value}`}
                      className="text-sm font-normal cursor-pointer flex items-center gap-2"
                    >
                      <div className={`w-2 h-2 rounded-full ${option.color}`} />
                      {option.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Priority Filter */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Flag className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Priority</Label>
                {filters.priority && filters.priority.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => clearFilter("priority")}
                    className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2">
                {PRIORITY_OPTIONS.map(option => (
                  <div key={option.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`priority-${option.value}`}
                      checked={filters.priority?.includes(option.value) || false}
                      onCheckedChange={() => toggleArrayFilter("priority", option.value)}
                      data-testid={`filter-priority-${option.value}`}
                    />
                    <Label 
                      htmlFor={`priority-${option.value}`}
                      className="text-sm font-normal cursor-pointer flex items-center gap-2"
                    >
                      <div className={`w-2 h-2 rounded-full ${option.color}`} />
                      {option.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Assignee Filter */}
            {availableAssignees.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Assignee</Label>
                  {filters.assignee && filters.assignee.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => clearFilter("assignee")}
                      className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2 max-h-32 overflow-y-auto">
                  {availableAssignees.map(assignee => (
                    <div key={assignee} className="flex items-center space-x-2">
                      <Checkbox
                        id={`assignee-${assignee}`}
                        checked={filters.assignee?.includes(assignee) || false}
                        onCheckedChange={() => toggleArrayFilter("assignee", assignee)}
                        data-testid={`filter-assignee-${assignee.replace(/\s+/g, '-').toLowerCase()}`}
                      />
                      <Label 
                        htmlFor={`assignee-${assignee}`}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {assignee}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Project Filter */}
            {availableProjects.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Project</Label>
                  {filters.project && filters.project.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => clearFilter("project")}
                      className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2 max-h-32 overflow-y-auto">
                  {availableProjects.map(project => (
                    <div key={project} className="flex items-center space-x-2">
                      <Checkbox
                        id={`project-${project}`}
                        checked={filters.project?.includes(project) || false}
                        onCheckedChange={() => toggleArrayFilter("project", project)}
                        data-testid={`filter-project-${project.replace(/\s+/g, '-').toLowerCase()}`}
                      />
                      <Label 
                        htmlFor={`project-${project}`}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {project}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tags Filter */}
            {availableTags.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Tags</Label>
                  {filters.tags && filters.tags.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => clearFilter("tags")}
                      className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                  {availableTags.map(tag => (
                    <div key={tag} className="flex items-center space-x-2">
                      <Checkbox
                        id={`tag-${tag}`}
                        checked={filters.tags?.includes(tag) || false}
                        onCheckedChange={() => toggleArrayFilter("tags", tag)}
                        data-testid={`filter-tag-${tag.replace(/\s+/g, '-').toLowerCase()}`}
                      />
                      <Label 
                        htmlFor={`tag-${tag}`}
                        className="text-sm font-normal cursor-pointer truncate"
                      >
                        {tag}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Due Date Filter */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Due Date</Label>
                {(filters.dueDateFrom || filters.dueDateTo) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      clearFilter("dueDateFrom");
                      clearFilter("dueDateTo");
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
                        data-testid="button-date-from"
                      >
                        <CalendarIcon className="mr-2 h-3 w-3" />
                        {filters.dueDateFrom ? format(filters.dueDateFrom, "MMM dd") : "From"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={filters.dueDateFrom}
                        onSelect={(date) => {
                          updateFilter("dueDateFrom", date);
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
                        data-testid="button-date-to"
                      >
                        <CalendarIcon className="mr-2 h-3 w-3" />
                        {filters.dueDateTo ? format(filters.dueDateTo, "MMM dd") : "To"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={filters.dueDateTo}
                        onSelect={(date) => {
                          updateFilter("dueDateTo", date);
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

      {/* Active Filter Tags */}
      <div className="flex items-center gap-1 flex-wrap">
        {filters.status?.map(status => (
          <Badge key={`status-${status}`} variant="secondary" className="text-xs">
            Status: {STATUS_OPTIONS.find(s => s.value === status)?.label}
            <button
              onClick={() => toggleArrayFilter("status", status)}
              className="ml-1 hover:bg-muted rounded"
              data-testid={`remove-status-filter-${status}`}
            >
              <X className="h-2 w-2" />
            </button>
          </Badge>
        ))}
        
        {filters.priority?.map(priority => (
          <Badge key={`priority-${priority}`} variant="secondary" className="text-xs">
            Priority: {PRIORITY_OPTIONS.find(p => p.value === priority)?.label}
            <button
              onClick={() => toggleArrayFilter("priority", priority)}
              className="ml-1 hover:bg-muted rounded"
              data-testid={`remove-priority-filter-${priority}`}
            >
              <X className="h-2 w-2" />
            </button>
          </Badge>
        ))}

        {formatDateRange() && (
          <Badge variant="secondary" className="text-xs">
            Due: {formatDateRange()}
            <button
              onClick={() => {
                clearFilter("dueDateFrom");
                clearFilter("dueDateTo");
              }}
              className="ml-1 hover:bg-muted rounded"
              data-testid="remove-date-filter"
            >
              <X className="h-2 w-2" />
            </button>
          </Badge>
        )}
      </div>
    </div>
  );
}