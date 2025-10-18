import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Plus, LayoutGrid, List } from "lucide-react";
import { type Project } from "@shared/schema";
import { ProjectBoard } from "@/components/ProjectBoard";
import { ProjectList } from "@/components/ProjectList";
import CreateProjectDialog from "@/components/CreateProjectDialog";

export default function BusinessProjects() {
  const [activeTab, setActiveTab] = useState("board");
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Filter out archived projects and business projects
  const activeProjects = projects.filter(p => !p.isArchived && !p.isBusiness);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b bg-background">
        <div className="flex items-center justify-between p-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
            <p className="text-muted-foreground mt-1">
              View and manage all current construction projects
            </p>
          </div>
          <Button
            onClick={() => setIsCreateProjectOpen(true)}
            data-testid="button-create-project"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Project
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="px-6">
          <TabsList>
            <TabsTrigger value="board" data-testid="tab-board">
              <LayoutGrid className="h-4 w-4 mr-2" />
              Board
            </TabsTrigger>
            <TabsTrigger value="list" data-testid="tab-list">
              <List className="h-4 w-4 mr-2" />
              List
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} className="h-full">
          <TabsContent value="board" className="h-full m-0 p-6">
            <ProjectBoard projects={activeProjects} isLoading={isLoading} />
          </TabsContent>
          <TabsContent value="list" className="h-full m-0 p-6">
            <ProjectList projects={activeProjects} isLoading={isLoading} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Create Project Dialog */}
      <CreateProjectDialog
        open={isCreateProjectOpen}
        onOpenChange={setIsCreateProjectOpen}
      />
    </div>
  );
}
