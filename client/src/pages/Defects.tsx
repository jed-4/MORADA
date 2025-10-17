import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Plus, LayoutList, LayoutGrid } from "lucide-react";
import type { Defect } from "@shared/schema";
import { DefectFormDialog } from "@/components/defects/DefectFormDialog";
import { DefectTableView } from "@/components/defects/DefectTableView";
import { DefectBoardView } from "@/components/defects/DefectBoardView";

export default function Defects() {
  const { id: projectId } = useParams<{ id: string }>();
  const [activeView, setActiveView] = useState<"table" | "board">("table");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  // Fetch defects for this project
  const { data: defects = [], isLoading } = useQuery<Defect[]>({
    queryKey: ["/api/defects", { projectId }],
  });

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex-none p-6 border-b">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            Defects
          </h1>
          <div className="flex items-center gap-3">
            <Tabs value={activeView} onValueChange={(v) => setActiveView(v as "table" | "board")}>
              <TabsList data-testid="tabs-view">
                <TabsTrigger value="table" data-testid="tab-trigger-table">
                  <LayoutList className="w-4 h-4 mr-2" />
                  Table
                </TabsTrigger>
                <TabsTrigger value="board" data-testid="tab-trigger-board">
                  <LayoutGrid className="w-4 h-4 mr-2" />
                  Board
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button 
              onClick={() => setIsCreateDialogOpen(true)} 
              data-testid="button-create-defect"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Defect
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeView === "table" && (
          <div className="p-6">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <p className="text-muted-foreground">Loading defects...</p>
              </div>
            ) : defects.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 gap-4">
                <p className="text-muted-foreground">No defects found</p>
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Defect
                </Button>
              </div>
            ) : (
              <DefectTableView defects={defects} />
            )}
          </div>
        )}
        
        {activeView === "board" && (
          <div className="p-6 h-full">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <p className="text-muted-foreground">Loading defects...</p>
              </div>
            ) : defects.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 gap-4">
                <p className="text-muted-foreground">No defects found</p>
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Defect
                </Button>
              </div>
            ) : (
              <DefectBoardView defects={defects} />
            )}
          </div>
        )}
      </div>

      <DefectFormDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
      />
    </div>
  );
}
