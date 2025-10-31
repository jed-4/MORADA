import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Folder, ListTodo, Workflow } from "lucide-react";
import { FolderTree } from "@/components/systems/FolderTree";
import { TaskLibrary } from "@/components/systems/TaskLibrary";
import { WorkflowBuilder } from "@/components/systems/WorkflowBuilder";

export default function Systems() {
  const [activeTab, setActiveTab] = useState("folders");

  return (
    <div className="flex flex-col h-full" data-testid="systems-page">
      <div className="flex-1 min-h-0 p-6">
        <div className="flex flex-col gap-4 h-full">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Systems Library</h1>
              <p className="text-muted-foreground text-sm">
                Manage company-wide processes, templates, and documentation
              </p>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <TabsList className="w-fit">
              <TabsTrigger value="folders" className="gap-2" data-testid="tab-folders">
                <Folder className="h-4 w-4" />
                Folders
              </TabsTrigger>
              <TabsTrigger value="tasks" className="gap-2" data-testid="tab-tasks">
                <ListTodo className="h-4 w-4" />
                Task Templates
              </TabsTrigger>
              <TabsTrigger value="workflows" className="gap-2" data-testid="tab-workflows">
                <Workflow className="h-4 w-4" />
                Workflows
              </TabsTrigger>
            </TabsList>

            <TabsContent value="folders" className="flex-1 min-h-0 mt-4">
              <FolderTree />
            </TabsContent>

            <TabsContent value="tasks" className="flex-1 min-h-0 mt-4">
              <TaskLibrary />
            </TabsContent>

            <TabsContent value="workflows" className="flex-1 min-h-0 mt-4">
              <WorkflowBuilder />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
