import { useLocation } from "wouter";
import {
  FolderPlus,
  GitBranch,
  HelpCircle,
  Upload,
  UserPlus,
  FileText,
  type LucideIcon,
} from "lucide-react";
import type { WidgetProps } from "@/types/widgets";

interface QuickAction {
  label: string;
  icon: LucideIcon;
  path: string;
}

const ACTIONS: QuickAction[] = [
  { label: "New Project", icon: FolderPlus, path: "/projects" },
  { label: "New Variation", icon: GitBranch, path: "/variations" },
  { label: "New RFI", icon: HelpCircle, path: "/rfis" },
  { label: "Upload Document", icon: Upload, path: "/docs" },
  { label: "Add Contact", icon: UserPlus, path: "/contacts" },
  { label: "New Quote", icon: FileText, path: "/proposals" },
];

export default function BusinessQuickActionsWidget({}: WidgetProps) {
  const [, navigate] = useLocation();

  return (
    <div
      className="grid grid-cols-3 gap-3 p-5"
      data-testid="business-quick-actions-widget"
    >
      {ACTIONS.map((action) => {
        const Icon = action.icon;
        const testKey = action.label.toLowerCase().replace(/\s+/g, "-");
        return (
          <button
            key={action.label}
            type="button"
            onClick={() => navigate(action.path)}
            className="bg-bp-subtle hover:bg-bp-purple/10 border border-bp-border rounded-md p-4 flex flex-col items-center gap-2 text-center cursor-pointer transition-colors"
            data-testid={`button-quick-action-${testKey}`}
          >
            <Icon className="w-5 h-5 text-bp-purple" />
            <span className="text-[12px] font-medium text-bp-card-foreground leading-tight">
              {action.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
