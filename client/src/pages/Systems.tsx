import { useState, useRef, useEffect } from "react";
import { useSearch } from "wouter";
import { BookOpen, ListTodo, Workflow, FolderPlus, FilePlus, Plus, CalendarIcon, Power, PowerOff, Search, Bell, CalendarDays, ChevronRight, Filter, MoreHorizontal, Sparkles, ChevronDown, ClipboardCheck, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Library, type LibraryHandle } from "@/components/library/Library";
import { StarterPackButton, useStarterPackAvailable } from "@/components/library/StarterPackButton";
import { LibraryPropertiesManager } from "@/components/library/LibraryProperties";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TaskLibrary, type TaskLibraryHandle } from "@/components/systems/TaskLibrary";
import { WorkflowBuilder, type WorkflowBuilderHandle } from "@/components/systems/WorkflowBuilder";
import { BusinessReminders, type BusinessRemindersHandle } from "@/components/systems/BusinessReminders";
import { DefaultDiary, type DefaultDiaryHandle } from "@/components/systems/DefaultDiary";
import { usePermission } from "@/hooks/use-permission";

const ALL_TABS = [
  { id: "library", label: "Library", Icon: BookOpen },
  { id: "tasks", label: "Operational Tasks", Icon: ListTodo },
  { id: "workflows", label: "Workflows", Icon: Workflow },
  { id: "reminders", label: "Reminders", Icon: Bell },
  { id: "diary", label: "Default Diary", Icon: CalendarDays },
];

export default function Systems() {
  // Get tab from URL query parameter
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  const tabFromUrl = urlParams.get("tab");
  
  // A tab the role can't view is not rendered at all — the server refuses its
  // data anyway (operations.* keys), so showing it would only show an error.
  const canViewLibrary = usePermission("operations.library", "view");
  const canViewTasks = usePermission("operations.tasks", "view");
  const canViewWorkflows = usePermission("operations.workflows", "view");
  const tabs = ALL_TABS.filter((t) =>
    t.id === "library" ? canViewLibrary
    : t.id === "tasks" || t.id === "diary" ? canViewTasks
    : t.id === "workflows" ? canViewWorkflows
    : true,
  );
  const allowedIds = tabs.map((t) => t.id);

  // "folders" was this tab's name before the Library replaced it.
  const [requestedTab, setActiveTab] = useState(tabFromUrl === "folders" ? "library" : tabFromUrl ?? "");
  const [searchQuery, setSearchQuery] = useState("");
  const activeTab = allowedIds.includes(requestedTab) ? requestedTab : allowedIds[0];
  // Folder › document path for the breadcrumb, reported by the Library.
  const [libraryPath, setLibraryPath] = useState<string[]>([]);
  const activeLabel = ALL_TABS.find((t) => t.id === activeTab)?.label ?? "";

  // Update active tab when URL changes
  useEffect(() => {
    if (tabFromUrl) setActiveTab(tabFromUrl === "folders" ? "library" : tabFromUrl);
  }, [tabFromUrl]);
  
  // Refs for accessing child component functions
  const libraryRef = useRef<LibraryHandle>(null);
  const taskLibraryRef = useRef<TaskLibraryHandle>(null);
  const workflowBuilderRef = useRef<WorkflowBuilderHandle>(null);
  const businessRemindersRef = useRef<BusinessRemindersHandle>(null);
  const defaultDiaryRef = useRef<DefaultDiaryHandle>(null);

  return (
    <div className="flex flex-col h-full" data-testid="systems-page">
      {/* Breadcrumb strip — the same as Tasks, Timesheets and the other card pages. */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-1 flex-shrink-0 min-w-0" data-testid="systems-breadcrumb">
        <span className="text-xs text-muted-foreground">Operations</span>
        <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
        <span className={`text-xs ${activeTab === "library" && libraryPath.length ? "text-muted-foreground" : "font-medium text-foreground"}`} data-testid="text-page-title">
          {activeLabel}
        </span>
        {activeTab === "library" && libraryPath.map((part, i) => (
          <span key={i} className="flex items-center gap-1 min-w-0">
            <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
            <span className={`text-xs truncate ${i === libraryPath.length - 1 ? "font-medium text-foreground" : "text-muted-foreground"}`}>{part}</span>
          </span>
        ))}
      </div>

      {/* Card header: tabs on the left, the tab's search / filter / new on the right. */}
      <div className="border border-border rounded-t-lg bg-card flex-shrink-0">
        <div className="h-9 flex items-center justify-between px-2 gap-2">
          <div className="flex items-center gap-1 min-w-0 overflow-x-auto">
            {tabs.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => { setActiveTab(id); setSearchQuery(""); }}
                className={`px-2.5 h-6 rounded-md text-xs font-medium transition-colors flex-shrink-0 ${
                  activeTab === id ? "bg-primary/10 text-primary" : "text-muted-foreground hover-elevate"
                }`}
                data-testid={`tab-${id}`}
              >
                <div className="flex items-center gap-1.5">
                  <Icon className="h-3 w-3" />
                  <span>{label}</span>
                </div>
              </button>
            ))}
          </div>
          <SystemsControlBar
            activeTab={activeTab}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            libraryRef={libraryRef}
            taskLibraryRef={taskLibraryRef}
            workflowBuilderRef={workflowBuilderRef}
            businessRemindersRef={businessRemindersRef}
          />
        </div>
      </div>

      {/* Body closes the card. */}
      <div className="flex-1 min-h-0 overflow-hidden border-x border-b border-border rounded-b-lg bg-card">
        {activeTab === "library" && (
          <div className="h-full">
            <Library ref={libraryRef} onPathChange={setLibraryPath} />
          </div>
        )}
        {activeTab === "tasks" && (
          <div className="h-full">
            <TaskLibrary ref={taskLibraryRef} searchQuery={searchQuery} />
          </div>
        )}
        {activeTab === "workflows" && (
          <div className="h-full">
            <WorkflowBuilder ref={workflowBuilderRef} searchQuery={searchQuery} />
          </div>
        )}
        {activeTab === "reminders" && (
          <div className="h-full">
            <BusinessReminders ref={businessRemindersRef} searchQuery={searchQuery} />
          </div>
        )}
        {activeTab === "diary" && (
          <div className="h-full">
            <DefaultDiary ref={defaultDiaryRef} searchQuery={searchQuery} />
          </div>
        )}
      </div>
    </div>
  );
}

// Control bar component that renders different controls based on active tab
function SystemsControlBar({
  activeTab,
  searchQuery,
  setSearchQuery,
  libraryRef,
  taskLibraryRef,
  workflowBuilderRef,
  businessRemindersRef
}: {
  activeTab: string;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  libraryRef: React.RefObject<LibraryHandle>;
  taskLibraryRef: React.RefObject<TaskLibraryHandle>;
  workflowBuilderRef: React.RefObject<WorkflowBuilderHandle>;
  businessRemindersRef: React.RefObject<BusinessRemindersHandle>;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      {/* Search — the app's standard 200px search field. The Library has its
          own, in its folder panel: it searches documents, not the other tabs. */}
      {activeTab !== "library" && <div className="relative" style={{ width: 200 }}>
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") setSearchQuery(""); }}
          className="pl-7 pr-2 h-6 text-xs"
          data-testid="input-search-systems"
        />
      </div>}
      {activeTab === "library" && (
        <LibraryControls libraryRef={libraryRef} />
      )}
      {activeTab === "tasks" && (
        <TasksControls taskLibraryRef={taskLibraryRef} />
      )}
      {activeTab === "workflows" && (
        <WorkflowsControls workflowBuilderRef={workflowBuilderRef} />
      )}
      {activeTab === "reminders" && (
        <RemindersControls businessRemindersRef={businessRemindersRef} />
      )}
    </div>
  );
}

const ICON_BTN = "relative h-6 w-6 flex items-center justify-center rounded-md border transition-all hover-elevate active-elevate-2";
const PRIMARY_BTN = "h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-0.5";

// Library tab controls — one New menu, and the starter pack tucked in a ⋮
// menu. Search and Filter live in the Library's own folder panel.
function LibraryControls({ libraryRef }: { libraryRef: React.RefObject<LibraryHandle> }) {
  const canAdd = usePermission("operations.library", "add");
  const starterAvailable = useStarterPackAvailable();
  const [starterOpen, setStarterOpen] = useState(false);
  const { user } = useAuth();
  const isAdmin = !!(user as any)?.isAdminLike;
  const [propsOpen, setPropsOpen] = useState(false);
  return (
    <>
      {canAdd && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={PRIMARY_BTN} data-testid="button-library-new">
              <Plus className="w-3 h-3" />
              <span>New</span>
              <ChevronDown className="w-3 h-3 ml-0.5 opacity-80" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => libraryRef.current?.newDoc("sop")} data-testid="button-new-sop">
              <ClipboardCheck className="w-3.5 h-3.5 mr-2" />SOP
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => libraryRef.current?.newDoc("document")} data-testid="button-new-document">
              <FilePlus className="w-3.5 h-3.5 mr-2" />Document
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => libraryRef.current?.newFolder()} data-testid="button-new-folder">
              <FolderPlus className="w-3.5 h-3.5 mr-2" />Folder
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {(starterAvailable || isAdmin) && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={`${ICON_BTN} border-border/50 text-muted-foreground`} aria-label="More" data-testid="button-library-more">
                <MoreHorizontal className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {isAdmin && (
                <DropdownMenuItem onClick={() => setPropsOpen(true)} data-testid="button-library-properties">
                  <Tag className="w-3.5 h-3.5 mr-2" />Manage properties…
                </DropdownMenuItem>
              )}
              {starterAvailable && (
                <DropdownMenuItem onClick={() => setStarterOpen(true)} data-testid="button-starter-pack">
                  <Sparkles className="w-3.5 h-3.5 mr-2" />Add the starter pack…
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {starterAvailable && <StarterPackButton open={starterOpen} onOpenChange={setStarterOpen} hideTrigger />}
          <Dialog open={propsOpen} onOpenChange={setPropsOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Library properties</DialogTitle>
                <DialogDescription>Labels you can give documents — like Notion's select and multi-select. Also in Settings → Library.</DialogDescription>
              </DialogHeader>
              <LibraryPropertiesManager />
            </DialogContent>
          </Dialog>
        </>
      )}
    </>
  );
}

// Tasks tab controls
function TasksControls({ taskLibraryRef }: { taskLibraryRef: React.RefObject<TaskLibraryHandle> }) {
  const canAdd = usePermission("operations.tasks", "add");
  const canEdit = usePermission("operations.tasks", "edit");
  // Same button style as the rest of the app (PO / variation headers). The
  // Active / Inactive legend badges went — "On / off" is in the filter now.
  const btn = "h-7 px-2.5 text-xs border rounded-md flex items-center gap-1 whitespace-nowrap flex-shrink-0";
  return (
    <>
      {canEdit && (
        <button
          type="button"
          className={`${btn} bg-card hover-elevate active-elevate-2`}
          onClick={() => taskLibraryRef.current?.generateRecurringTasks()}
          title="Create the next two weeks of to-dos from the repeating tasks now"
          data-testid="button-generate-recurring"
        >
          <CalendarIcon className="w-3 h-3" />
          <span>Generate</span>
        </button>
      )}
      {canAdd && (
        <button
          type="button"
          className={`${btn} bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2`}
          onClick={() => taskLibraryRef.current?.openNewTemplateDialog()}
          data-testid="button-new-template"
        >
          <Plus className="w-3 h-3" />
          <span>New</span>
        </button>
      )}
    </>
  );
}

// Workflows tab controls
function WorkflowsControls({ workflowBuilderRef }: { workflowBuilderRef: React.RefObject<WorkflowBuilderHandle> }) {
  const canAdd = usePermission("operations.workflows", "add");
  return (
    <>
      <div className="flex items-center gap-1">
        <Badge variant="outline" className="h-6 text-xs px-2 gap-1 no-default-hover-elevate no-default-active-elevate">
          <Power className="h-3 w-3 text-status-success" />
          <span>Active</span>
        </Badge>
        <Badge variant="outline" className="h-6 text-xs px-2 gap-1 no-default-hover-elevate no-default-active-elevate">
          <PowerOff className="h-3 w-3 text-muted-foreground" />
          <span>Inactive</span>
        </Badge>
      </div>
      {canAdd && (
      <Button
        size="sm"
        className="h-6 px-2 text-xs bg-primary text-white hover:bg-primary/90 gap-1"
        onClick={() => workflowBuilderRef.current?.openNewWorkflowDialog()}
        data-testid="button-new-workflow"
      >
        <Plus className="w-3 h-3" />
        <span>New Workflow</span>
      </Button>
      )}
    </>
  );
}

// Reminders tab controls
function RemindersControls({ businessRemindersRef }: { businessRemindersRef: React.RefObject<BusinessRemindersHandle> }) {
  return (
    <>
      <div className="flex items-center gap-1">
        <Badge variant="outline" className="h-6 text-xs px-2 gap-1 no-default-hover-elevate no-default-active-elevate">
          <Power className="h-3 w-3 text-status-success" />
          <span>Active</span>
        </Badge>
        <Badge variant="outline" className="h-6 text-xs px-2 gap-1 no-default-hover-elevate no-default-active-elevate">
          <PowerOff className="h-3 w-3 text-muted-foreground" />
          <span>Inactive</span>
        </Badge>
      </div>
      <Button
        size="sm"
        className="h-6 px-2 text-xs bg-primary text-white hover:bg-primary/90 gap-1"
        onClick={() => businessRemindersRef.current?.openNewReminderDialog()}
        data-testid="button-new-reminder"
      >
        <Plus className="w-3 h-3" />
        <span>New Reminder</span>
      </Button>
    </>
  );
}
