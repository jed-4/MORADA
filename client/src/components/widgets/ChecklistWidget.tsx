import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListChecks, Plus, AlertCircle, Clock } from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useQuery } from "@tanstack/react-query";
import { type ChecklistTemplate } from "@shared/schema";
import { useProject } from "@/contexts/ProjectContext";
import { useLocation } from "wouter";

export default function ChecklistWidget({ widget, onUpdate, isConfiguring, onCloseConfig }: WidgetProps) {
  const maxChecklists = widget.config?.maxChecklists || 5;
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [configMaxChecklists, setConfigMaxChecklists] = useState(maxChecklists);
  const containerRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(1);
  
  useEffect(() => {
    setEditingTitle(widget.title);
    setConfigMaxChecklists(widget.config?.maxChecklists || 5);
  }, [widget.title, widget.config]);
  
  useEffect(() => {
    if (!containerRef.current) return;
    
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width >= 720) {
          setColumnCount(3);
        } else if (width >= 480) {
          setColumnCount(2);
        } else {
          setColumnCount(1);
        }
      }
    });
    
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);
  
  const { currentProject } = useProject();
  const [, setLocation] = useLocation();
  
  // Fetch checklist templates filtered by current project
  const { data: checklists = [], isLoading } = useQuery<ChecklistTemplate[]>({
    queryKey: ["/api/checklist-templates", currentProject?.id],
    queryFn: async () => {
      if (!currentProject?.id) return [];
      const response = await fetch(`/api/checklist-templates?projectId=${currentProject.id}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: !!currentProject?.id,
  });
  
  const displayChecklists = checklists.slice(0, maxChecklists);

  const getTypeBadgeColor = (type: string) => {
    const colors: Record<string, string> = {
      'handover': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      'pre_start': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      'progress': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
      'quality': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
      'safety': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      'custom': 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
    };
    return colors[type] || colors.custom;
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'handover': 'Handover',
      'pre_start': 'Pre-Start',
      'progress': 'Progress',
      'quality': 'Quality',
      'safety': 'Safety',
      'custom': 'Custom',
    };
    return labels[type] || 'Custom';
  };

  if (!currentProject) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        Select a project to view checklists
      </div>
    );
  }
  
  // Configuration mode
  if (isConfiguring) {
    const handleSaveConfig = () => {
      if (onUpdate) {
        onUpdate({ 
          ...widget, 
          title: editingTitle,
          config: { ...widget.config, maxChecklists: configMaxChecklists }
        });
      }
      onCloseConfig?.();
    };
    
    const handleCancelConfig = () => {
      setEditingTitle(widget.title);
      setConfigMaxChecklists(widget.config?.maxChecklists || 5);
      onCloseConfig?.();
    };
    
    return (
      <div className="space-y-3 p-2">
        <h4 className="text-sm font-medium">Configure Checklists</h4>
        
        <div className="space-y-2">
          <Label className="text-xs">Widget Name</Label>
          <Input 
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            className="h-7 text-xs"
            placeholder="Widget title"
          />
        </div>
        
        <div className="space-y-2">
          <Label className="text-xs">Max Items to Show</Label>
          <Input 
            type="number"
            min={1}
            max={20}
            value={configMaxChecklists}
            onChange={(e) => setConfigMaxChecklists(parseInt(e.target.value) || 5)}
            className="h-7 text-xs w-20"
          />
        </div>
        
        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="outline" onClick={handleCancelConfig} className="h-6 px-2 text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSaveConfig} className="h-6 px-2 text-xs">
            Save
          </Button>
        </div>
      </div>
    );
  }

  const getStatusIndicator = (checklist: ChecklistTemplate) => {
    const hasIncomplete = checklist.groups?.some(group => 
      group.items?.some(item => !(item as any).completed)
    );
    const isActionable = hasIncomplete && checklist.status !== 'completed';
    const isPriority = checklist.type === 'safety' || checklist.type === 'quality';
    
    if (isPriority && isActionable) {
      return { 
        color: 'border-l-amber-500 bg-amber-50/50 dark:bg-amber-900/10', 
        icon: <AlertCircle className="h-3 w-3 text-amber-600 dark:text-amber-400" /> 
      };
    }
    if (isActionable) {
      return { 
        color: 'border-l-green-500 bg-green-50/50 dark:bg-green-900/10', 
        icon: <Clock className="h-3 w-3 text-green-600 dark:text-green-400" /> 
      };
    }
    return { color: '', icon: null };
  };

  const gridClass = columnCount === 3 
    ? 'grid grid-cols-3 gap-2' 
    : columnCount === 2 
      ? 'grid grid-cols-2 gap-2' 
      : 'grid grid-cols-1 gap-2';

  return (
    <div className="space-y-2" ref={containerRef}>
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {checklists.length} checklist{checklists.length !== 1 ? 's' : ''}
        </div>
        <Button 
          size="sm" 
          variant="ghost"
          className="h-6 px-2 text-xs"
          onClick={() => setLocation('/checklist-templates')}
          data-testid="checklist-widget-view-all"
        >
          <Plus className="h-3 w-3 mr-1" />
          View All
        </Button>
      </div>
      
      <div className={gridClass}>
        {isLoading ? (
          <>
            {[1, 2, 3].slice(0, Math.min(maxChecklists, columnCount * 2)).map((i) => (
              <div key={i} className="animate-pulse">
                <div className="flex items-start gap-2 p-2 border rounded-md">
                  <div className="h-3 w-3 bg-muted rounded"></div>
                  <div className="flex-1 min-w-0">
                    <div className="h-3 bg-muted rounded w-3/4 mb-1"></div>
                    <div className="h-2 bg-muted rounded w-1/2"></div>
                  </div>
                </div>
              </div>
            ))}
          </>
        ) : (
          displayChecklists.map((checklist) => {
            const status = getStatusIndicator(checklist);
            return (
              <div 
                key={checklist.id} 
                className={`p-2 border rounded-md hover-elevate cursor-pointer border-l-2 ${status.color}`}
                onClick={() => setLocation(`/checklist-templates/${checklist.id}`)}
                data-testid={`checklist-widget-item-${checklist.id}`}
              >
                <div className="flex items-start gap-1.5">
                  <ListChecks className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-0.5">
                      <p className="text-xs font-medium truncate leading-tight">{checklist.name}</p>
                      {status.icon}
                    </div>
                    <Badge 
                      className={`${getTypeBadgeColor(checklist.type)} text-[10px] px-1.5 py-0 h-4 no-default-hover-elevate no-default-active-elevate`}
                    >
                      {getTypeLabel(checklist.type)}
                    </Badge>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      
      {displayChecklists.length === 0 && !isLoading && (
        <div className="text-center py-3 text-xs text-muted-foreground">
          No checklists yet
        </div>
      )}
    </div>
  );
}
