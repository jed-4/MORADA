import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Plus, LayoutGrid, List, Eye, SlidersHorizontal, Edit3 } from "lucide-react";
import { type Project } from "@shared/schema";
import { ProjectBoard } from "@/components/ProjectBoard";
import { ProjectList } from "@/components/ProjectList";
import CreateProjectDialog from "@/components/CreateProjectDialog";

export default function BusinessProjects() {
  const [activeTab, setActiveTab] = useState("board");
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [showCardDisplay, setShowCardDisplay] = useState(false);
  const [showViewOptions, setShowViewOptions] = useState(false);
  const [editMode, setEditMode] = useState(false);

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
          {/* Card Display Toggle */}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setShowCardDisplay(!showCardDisplay)}
            className="h-6 w-6"
            data-testid="button-card-display"
          >
            <Eye className="h-3 w-3" />
          </Button>

          {/* View Options Toggle */}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setShowViewOptions(!showViewOptions)}
            className="h-6 w-6"
            data-testid="button-view-options"
          >
            <SlidersHorizontal className="h-3 w-3" />
          </Button>

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
            <ProjectBoard projects={activeProjects} isLoading={isLoading} />
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
