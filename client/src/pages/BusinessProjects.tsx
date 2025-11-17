import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Plus, LayoutGrid, List, Eye, SlidersHorizontal, Edit3, Columns3 } from "lucide-react";
import { type Project } from "@shared/schema";
import { ProjectBoard, type ViewPreferences, type GroupBy, type ColumnWidth } from "@/components/ProjectBoard";
import { ProjectList } from "@/components/ProjectList";
import CreateProjectDialog from "@/components/CreateProjectDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

const DEFAULT_PREFERENCES: ViewPreferences = {
  groupBy: "parent",
  columnWidth: "medium",
  visibleFields: {
    client: true,
    budget: true,
    stage: true,
    dueDate: true,
    progress: true,
    foreman: true,
  },
};

const STORAGE_KEY = "projectBoardPreferences";

export default function BusinessProjects() {
  const [activeTab, setActiveTab] = useState("board");
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [cardFieldsDialogOpen, setCardFieldsDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // Manage preferences state at parent level
  const [preferences, setPreferences] = useState<ViewPreferences>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) } : DEFAULT_PREFERENCES;
    } catch {
      return DEFAULT_PREFERENCES;
    }
  });

  // Handle preferences update from child or local changes - supports functional updates
  const handlePreferencesChange = (newPreferences: ViewPreferences | ((prev: ViewPreferences) => ViewPreferences)) => {
    setPreferences(prev => {
      const updated = typeof newPreferences === 'function' ? newPreferences(prev) : newPreferences;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  // Update single preference and persist
  const updatePreference = <K extends keyof ViewPreferences>(
    key: K,
    value: ViewPreferences[K]
  ) => {
    handlePreferencesChange({ ...preferences, [key]: value });
  };

  // Toggle individual visible field
  const toggleField = (field: keyof ViewPreferences['visibleFields']) => {
    handlePreferencesChange({
      ...preferences,
      visibleFields: {
        ...preferences.visibleFields,
        [field]: !preferences.visibleFields[field],
      },
    });
  };

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Filter out archived projects and business projects
  const activeProjects = projects.filter(p => !p.isArchived && !p.isBusiness);

  return (
    <div className="h-full flex flex-col" data-testid="business-projects">
      {/* Row 2 - Views & Controls (36px) */}
      <div className="h-9 bg-white flex items-center justify-between px-2 border-b border-border flex-shrink-0">
        {/* Left: View Tabs */}
        <div className="flex items-center gap-0.5" data-testid="tabs-project-views">
          <button
            onClick={() => setActiveTab("board")}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${
              activeTab === "board" 
                ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' 
                : 'hover-elevate'
            } active-elevate-2 flex items-center gap-1`}
            data-testid="tab-board"
          >
            <LayoutGrid className="w-3 h-3" />
            Board
          </button>
          <button
            onClick={() => setActiveTab("list")}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${
              activeTab === "list" 
                ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' 
                : 'hover-elevate'
            } active-elevate-2 flex items-center gap-1`}
            data-testid="tab-list"
          >
            <List className="w-3 h-3" />
            List
          </button>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-1.5">
          {/* Card Display - Opens Edit Card Fields Dialog */}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setCardFieldsDialogOpen(!cardFieldsDialogOpen)}
            className="h-6 w-6"
            data-testid="button-card-display"
          >
            <Eye className="h-3 w-3" />
          </Button>

          {/* View Options - Dropdown with proper trigger */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                data-testid="button-view-options"
              >
                <SlidersHorizontal className="h-3 w-3" />
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

              <DropdownMenuLabel>Show Fields</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={preferences.visibleFields.client}
                onCheckedChange={() => toggleField("client")}
                data-testid="checkbox-field-client"
              >
                Client
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={preferences.visibleFields.budget}
                onCheckedChange={() => toggleField("budget")}
                data-testid="checkbox-field-budget"
              >
                Budget
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={preferences.visibleFields.stage}
                onCheckedChange={() => toggleField("stage")}
                data-testid="checkbox-field-stage"
              >
                Location
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={preferences.visibleFields.dueDate}
                onCheckedChange={() => toggleField("dueDate")}
                data-testid="checkbox-field-dueDate"
              >
                Due Date
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={preferences.visibleFields.foreman}
                onCheckedChange={() => toggleField("foreman")}
                data-testid="checkbox-field-foreman"
              >
                Foreman
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Column Width - Dropdown with proper trigger */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                data-testid="button-column-width"
              >
                <Columns3 className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem 
                onClick={() => updatePreference('columnWidth', 'small')}
                data-testid="menu-item-column-small"
              >
                Small (240px)
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => updatePreference('columnWidth', 'medium')}
                data-testid="menu-item-column-medium"
              >
                Medium (320px)
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => updatePreference('columnWidth', 'wide')}
                data-testid="menu-item-column-wide"
              >
                Wide (400px)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Edit Mode Toggle */}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setEditMode(!editMode)}
            className="h-6 w-6"
            data-testid="button-edit-mode"
          >
            <Edit3 className="h-3 w-3" />
          </Button>

          {/* New Project Button */}
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
            onClick={() => setIsCreateProjectOpen(true)}
            data-testid="button-create-project"
          >
            <Plus className="w-3 h-3" />
            <span>New Project</span>
          </button>
        </div>
      </div>

      {/* Content - Full Height */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "board" && (
          <div className="h-full p-6">
            <ProjectBoard 
              projects={activeProjects} 
              isLoading={isLoading}
              cardFieldsDialogOpen={cardFieldsDialogOpen}
              onCardFieldsDialogChange={setCardFieldsDialogOpen}
              editMode={editMode}
              preferences={preferences}
              onPreferencesChange={handlePreferencesChange}
            />
          </div>
        )}
        {activeTab === "list" && (
          <div className="h-full p-6">
            <ProjectList projects={activeProjects} isLoading={isLoading} />
          </div>
        )}
      </div>

      {/* Create Project Dialog */}
      <CreateProjectDialog
        open={isCreateProjectOpen}
        onOpenChange={setIsCreateProjectOpen}
      />
    </div>
  );
}
