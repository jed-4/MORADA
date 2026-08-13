import { 
  Plus, 
  FileEdit, 
  Receipt, 
  FileText, 
  Users, 
  Calendar,
  ClipboardList,
  Camera,
  MessageSquare,
  FolderOpen
} from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";

interface QuickAction {
  id: string;
  label: string;
  icon: typeof Plus;
  /** Build the target path for the current project. All paths must be real routes in App.tsx. */
  getPath: (projectId: string) => string;
  color?: string;
}

// Quiet monochrome tiles — colour is reserved for data elsewhere on the dashboard
const defaultActions: QuickAction[] = [
  { id: "add-task", label: "Tasks", icon: Plus, getPath: (id) => `/projects/${id}/tasks` },
  { id: "add-bill", label: "Add Bill", icon: Receipt, getPath: () => "/bills/new" },
  { id: "add-variation", label: "Add Variation", icon: FileEdit, getPath: (id) => `/projects/${id}/variations/new` },
  { id: "create-invoice", label: "Create Invoice", icon: FileText, getPath: (id) => `/projects/${id}/client-invoices/new` },
  { id: "schedule-meeting", label: "Schedule", icon: Calendar, getPath: () => "/my-calendar" },
  { id: "view-contacts", label: "Contacts", icon: Users, getPath: () => "/contacts" },
  { id: "view-checklists", label: "Checklists", icon: ClipboardList, getPath: (id) => `/projects/${id}/checklists` },
  { id: "site-diary", label: "Site Diary", icon: Camera, getPath: (id) => `/projects/${id}/site-diary` },
  { id: "messages", label: "Messages", icon: MessageSquare, getPath: (id) => `/projects/${id}/messages` },
  { id: "files", label: "Files", icon: FolderOpen, getPath: (id) => `/projects/${id}/files` },
];

export default function QuickActionsWidget({ widget, onUpdate, isConfiguring, onCloseConfig }: WidgetProps) {
  const { currentProject } = useProject();
  const [, navigate] = useLocation();
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [configEnabledActions, setConfigEnabledActions] = useState<string[]>([]);
  
  const enabledActions: string[] = widget.config?.enabledActions || 
    defaultActions.slice(0, 6).map(a => a.id);
  
  const visibleActions = defaultActions.filter(a => enabledActions.includes(a.id));

  useEffect(() => {
    setEditingTitle(widget.title);
    setConfigEnabledActions(widget.config?.enabledActions || defaultActions.slice(0, 6).map(a => a.id));
  }, [widget.title, widget.config]);

  const toggleAction = (actionId: string) => {
    const newEnabled = configEnabledActions.includes(actionId)
      ? configEnabledActions.filter(id => id !== actionId)
      : [...configEnabledActions, actionId];
    setConfigEnabledActions(newEnabled);
  };

  if (!currentProject) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        Select a project to use quick actions
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
          config: { ...widget.config, enabledActions: configEnabledActions }
        });
      }
      onCloseConfig?.();
    };
    
    const handleCancelConfig = () => {
      setEditingTitle(widget.title);
      setConfigEnabledActions(widget.config?.enabledActions || defaultActions.slice(0, 6).map(a => a.id));
      onCloseConfig?.();
    };
    
    return (
      <div className="flex-1 overflow-y-auto p-1 space-y-5 text-[12px]" data-testid="quick-actions-config">
        <section>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Widget title
          </p>
          <Input
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            className="h-8 text-xs"
            placeholder="Widget title"
          />
        </section>

        <section>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Actions
          </p>
          <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
            {defaultActions.map(action => (
              <button
                key={action.id}
                onClick={() => toggleAction(action.id)}
                className={`flex items-center gap-2 p-2 border rounded-md text-xs transition-colors ${
                  configEnabledActions.includes(action.id)
                    ? 'bg-[hsl(var(--primary-light))] border-[hsl(var(--primary))]'
                    : 'border-border text-muted-foreground hover-elevate'
                }`}
                data-testid={`toggle-action-${action.id}`}
              >
                <action.icon className="h-3.5 w-3.5" />
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={handleCancelConfig} className="h-7 px-3 text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSaveConfig} className="h-7 px-3 text-xs">
            Save
          </Button>
        </div>
      </div>
    );
  }

  const handleActionClick = (action: QuickAction) => {
    navigate(action.getPath(currentProject.id));
  };

  return (
    <div className="grid grid-cols-3 gap-2">
      {visibleActions.map(action => (
        <button
          key={action.id}
          onClick={() => handleActionClick(action)}
          className="group flex flex-col items-center justify-center p-3 border border-border rounded-md hover-elevate active-elevate-2 transition-all"
          data-testid={`quick-action-${action.id}`}
        >
          <action.icon className="h-5 w-5 mb-1 text-muted-foreground group-hover:text-[hsl(var(--primary))] transition-colors" />
          <span className="text-xs text-center">{action.label}</span>
        </button>
      ))}
      
      {visibleActions.length === 0 && (
        <div className="col-span-3 text-center py-4 text-sm text-muted-foreground">
          No actions configured. Click the gear icon to add actions.
        </div>
      )}
    </div>
  );
}
