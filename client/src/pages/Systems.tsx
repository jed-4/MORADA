import { useState, useRef } from "react";
import { Folder, ListTodo, Workflow, FolderPlus, FilePlus, Plus, CalendarIcon, Power, PowerOff, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { FolderTree, type FolderTreeHandle } from "@/components/systems/FolderTree";
import { TaskLibrary } from "@/components/systems/TaskLibrary";
import { WorkflowBuilder } from "@/components/systems/WorkflowBuilder";

export default function Systems() {
  const [activeTab, setActiveTab] = useState("folders");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Refs for accessing child component functions
  const folderTreeRef = useRef<FolderTreeHandle>(null);

  return (
    <div className="flex flex-col h-full" data-testid="systems-page">
      {/* Row 1: Tabs Only (h-9) */}
      <div className="h-9 bg-background dark:bg-background flex items-center px-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab("folders")}
            className={`px-3 h-7 rounded-md text-xs font-medium transition-colors ${
              activeTab === "folders"
                ? "bg-[#bba7db]/10 text-[#bba7db]"
                : "text-muted-foreground hover-elevate"
            }`}
            data-testid="tab-folders"
          >
            <div className="flex items-center gap-1.5">
              <Folder className="h-3 w-3" />
              <span>Folders</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab("tasks")}
            className={`px-3 h-7 rounded-md text-xs font-medium transition-colors ${
              activeTab === "tasks"
                ? "bg-[#bba7db]/10 text-[#bba7db]"
                : "text-muted-foreground hover-elevate"
            }`}
            data-testid="tab-tasks"
          >
            <div className="flex items-center gap-1.5">
              <ListTodo className="h-3 w-3" />
              <span>Task Templates</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab("workflows")}
            className={`px-3 h-7 rounded-md text-xs font-medium transition-colors ${
              activeTab === "workflows"
                ? "bg-[#bba7db]/10 text-[#bba7db]"
                : "text-muted-foreground hover-elevate"
            }`}
            data-testid="tab-workflows"
          >
            <div className="flex items-center gap-1.5">
              <Workflow className="h-3 w-3" />
              <span>Workflows</span>
            </div>
          </button>
        </div>
      </div>

      {/* Row 2: Tab-Specific Controls (h-9) */}
      <SystemsControlBar 
        activeTab={activeTab} 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        folderTreeRef={folderTreeRef}
      />

      {/* Content Area */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "folders" && (
          <div className="h-full">
            <FolderTree ref={folderTreeRef} searchQuery={searchQuery} />
          </div>
        )}
        {activeTab === "tasks" && (
          <div className="h-full">
            <TaskLibrary searchQuery={searchQuery} />
          </div>
        )}
        {activeTab === "workflows" && (
          <div className="h-full">
            <WorkflowBuilder searchQuery={searchQuery} />
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
  folderTreeRef
}: { 
  activeTab: string;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  folderTreeRef: React.RefObject<FolderTreeHandle>;
}) {
  return (
    <div className="h-9 bg-background dark:bg-background flex items-center justify-between px-2 border-b border-border flex-shrink-0">
      {/* Left: Search Bar */}
      <div className="relative w-64">
        <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground" />
        <Input
          placeholder={`Search ${activeTab}...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-6 pl-7 text-xs border rounded-md"
          data-testid="input-search-systems"
        />
      </div>

      {/* Right: Tab-Specific Action Buttons */}
      <div className="flex items-center gap-1.5">
        {activeTab === "folders" && (
          <FoldersControls folderTreeRef={folderTreeRef} />
        )}
        {activeTab === "tasks" && (
          <TasksControls />
        )}
        {activeTab === "workflows" && (
          <WorkflowsControls />
        )}
      </div>
    </div>
  );
}

// Folders tab controls
function FoldersControls({ folderTreeRef }: { folderTreeRef: React.RefObject<FolderTreeHandle> }) {
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-6 px-2 text-xs gap-1"
        onClick={() => folderTreeRef.current?.openNewFolderDialog()}
        data-testid="button-new-folder"
      >
        <FolderPlus className="w-3 h-3" />
        <span>New Folder</span>
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-6 px-2 text-xs gap-1"
        onClick={() => folderTreeRef.current?.openNewDocumentDialog()}
        data-testid="button-new-document"
      >
        <FilePlus className="w-3 h-3" />
        <span>New Document</span>
      </Button>
    </>
  );
}

// Tasks tab controls
function TasksControls() {
  return (
    <>
      <div className="flex items-center gap-1">
        <Badge variant="outline" className="h-6 text-xs px-2 gap-1 no-default-hover-elevate no-default-active-elevate">
          <Power className="h-3 w-3 text-green-600" />
          <span>Active</span>
        </Badge>
        <Badge variant="outline" className="h-6 text-xs px-2 gap-1 no-default-hover-elevate no-default-active-elevate">
          <PowerOff className="h-3 w-3 text-muted-foreground" />
          <span>Inactive</span>
        </Badge>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-6 px-2 text-xs gap-1"
        data-testid="button-generate-recurring"
      >
        <CalendarIcon className="w-3 h-3" />
        <span>Generate Tasks</span>
      </Button>
      <Button
        size="sm"
        className="h-6 px-2 text-xs bg-[#bba7db] text-white hover:bg-[#bba7db]/90 gap-1"
        data-testid="button-new-template"
      >
        <Plus className="w-3 h-3" />
        <span>New Template</span>
      </Button>
    </>
  );
}

// Workflows tab controls
function WorkflowsControls() {
  return (
    <>
      <div className="flex items-center gap-1">
        <Badge variant="outline" className="h-6 text-xs px-2 gap-1 no-default-hover-elevate no-default-active-elevate">
          <Power className="h-3 w-3 text-green-600" />
          <span>Active</span>
        </Badge>
        <Badge variant="outline" className="h-6 text-xs px-2 gap-1 no-default-hover-elevate no-default-active-elevate">
          <PowerOff className="h-3 w-3 text-muted-foreground" />
          <span>Inactive</span>
        </Badge>
      </div>
      <Button
        size="sm"
        className="h-6 px-2 text-xs bg-[#bba7db] text-white hover:bg-[#bba7db]/90 gap-1"
        data-testid="button-new-workflow"
      >
        <Plus className="w-3 h-3" />
        <span>New Workflow</span>
      </Button>
    </>
  );
}
