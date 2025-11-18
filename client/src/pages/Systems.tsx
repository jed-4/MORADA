import { useState } from "react";
import { Folder, ListTodo, Workflow } from "lucide-react";
import { FolderTree } from "@/components/systems/FolderTree";
import { TaskLibrary } from "@/components/systems/TaskLibrary";
import { WorkflowBuilder } from "@/components/systems/WorkflowBuilder";

export default function Systems() {
  const [activeTab, setActiveTab] = useState("folders");

  return (
    <div className="flex flex-col h-full" data-testid="systems-page">
      {/* Row 1: Title (h-9) */}
      <div className="h-9 bg-background dark:bg-background flex items-center px-2 border-b border-border flex-shrink-0">
        <h2 className="text-sm font-semibold">Systems Library</h2>
      </div>

      {/* Row 2: Horizontal Tabs (h-9) */}
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

      {/* Content Area */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "folders" && (
          <div className="h-full p-3">
            <FolderTree />
          </div>
        )}
        {activeTab === "tasks" && (
          <div className="h-full p-3">
            <TaskLibrary />
          </div>
        )}
        {activeTab === "workflows" && (
          <div className="h-full p-3">
            <WorkflowBuilder />
          </div>
        )}
      </div>
    </div>
  );
}
