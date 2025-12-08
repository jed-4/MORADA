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
  path?: string;
  action?: () => void;
  color?: string;
}

const defaultActions: QuickAction[] = [
  { id: "add-task", label: "Add Task", icon: Plus, path: "/tasks?action=new", color: "text-blue-500" },
  { id: "add-bill", label: "Add Bill", icon: Receipt, path: "/bills?action=new", color: "text-green-500" },
  { id: "add-variation", label: "Add Variation", icon: FileEdit, path: "/variations?action=new", color: "text-purple-500" },
  { id: "create-invoice", label: "Create Invoice", icon: FileText, path: "/invoices?action=new", color: "text-amber-500" },
  { id: "schedule-meeting", label: "Schedule", icon: Calendar, path: "/calendar", color: "text-red-500" },
  { id: "view-contacts", label: "Contacts", icon: Users, path: "/contacts", color: "text-indigo-500" },
  { id: "view-checklists", label: "Checklists", icon: ClipboardList, path: "/checklists", color: "text-teal-500" },
  { id: "site-diary", label: "Site Diary", icon: Camera, path: "/site-diary", color: "text-orange-500" },
  { id: "messages", label: "Messages", icon: MessageSquare, path: "/messages", color: "text-pink-500" },
  { id: "files", label: "Files", icon: FolderOpen, path: "/files", color: "text-cyan-500" },
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
      <div className="space-y-3 p-2">
        <h4 className="text-sm font-medium">Configure Quick Actions</h4>
        
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
          <Label className="text-xs">Select Actions</Label>
          <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
            {defaultActions.map(action => (
              <button
                key={action.id}
                onClick={() => toggleAction(action.id)}
                className={`flex items-center gap-2 p-2 border rounded-md text-xs transition-colors ${
                  configEnabledActions.includes(action.id)
                    ? 'bg-[#bba7db]/20 border-[#bba7db]'
                    : 'hover-elevate'
                }`}
                data-testid={`toggle-action-${action.id}`}
              >
                <action.icon className={`h-3.5 w-3.5 ${action.color || ''}`} />
                <span>{action.label}</span>
              </button>
            ))}
          </div>
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

  const handleActionClick = (action: QuickAction) => {
    if (action.action) {
      action.action();
    } else if (action.path) {
      navigate(action.path);
    }
  };

  return (
    <div className="grid grid-cols-3 gap-2">
      {visibleActions.map(action => (
        <button
          key={action.id}
          onClick={() => handleActionClick(action)}
          className="flex flex-col items-center justify-center p-3 border rounded-md hover-elevate active-elevate-2 transition-all"
          data-testid={`quick-action-${action.id}`}
        >
          <action.icon className={`h-5 w-5 mb-1 ${action.color || 'text-muted-foreground'}`} />
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
