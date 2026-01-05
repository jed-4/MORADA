import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import {
  FileText,
  BookOpen,
  Clock,
  CheckSquare,
  Calculator,
  FileBarChart,
  FileSearch,
  HelpCircle,
  File,
  CheckCircle,
  Receipt,
  Layers,
  ChevronRight,
} from "lucide-react";

const templateTypes = [
  {
    id: "notes",
    title: "Notes",
    description: "Create reusable note templates with custom fields",
    icon: FileText,
    url: "/note-templates",
    color: "text-blue-500",
    implemented: true,
  },
  {
    id: "site-diary",
    title: "Site Diary",
    description: "Manage site diary templates for daily construction logs",
    icon: BookOpen,
    url: "/site-diary-templates",
    color: "text-purple-500",
    implemented: true,
  },
  {
    id: "schedule",
    title: "Schedule",
    description: "Build schedule templates for project timelines",
    icon: Clock,
    url: "/schedule-templates",
    color: "text-green-500",
    implemented: true,
  },
  {
    id: "scope",
    title: "Scope",
    description: "Manage scope templates with stages and items",
    icon: Layers,
    url: "/scope-templates",
    color: "text-amber-500",
    implemented: true,
  },
  {
    id: "tasks",
    title: "Tasks",
    description: "Create task templates for recurring workflows",
    icon: CheckSquare,
    url: "/task-templates",
    color: "text-orange-500",
    implemented: true,
  },
  {
    id: "takeoffs",
    title: "Take-offs",
    description: "Design take-off templates for quantity surveying",
    icon: Calculator,
    url: "/takeoff-templates",
    color: "text-cyan-500",
    implemented: false,
  },
  {
    id: "estimates",
    title: "Estimates",
    description: "Set up estimate templates with standard line items",
    icon: FileBarChart,
    url: "/estimate-templates",
    color: "text-indigo-500",
    implemented: true,
  },
  {
    id: "rfq",
    title: "Request for Quote",
    description: "Build RFQ templates for vendor requests",
    icon: FileSearch,
    url: "/rfq-templates",
    color: "text-pink-500",
    implemented: true,
  },
  {
    id: "rfi",
    title: "Request for Information",
    description: "Create RFI templates for project clarifications",
    icon: HelpCircle,
    url: "/rfi-templates",
    color: "text-yellow-500",
    implemented: true,
  },
  {
    id: "proposal",
    title: "Proposal",
    description: "Design proposal templates for client submissions",
    icon: File,
    url: "/proposal-templates",
    color: "text-teal-500",
    implemented: false,
  },
  {
    id: "selections",
    title: "Selections",
    description: "Manage selection templates for client choices",
    icon: CheckCircle,
    url: "/selection-templates",
    color: "text-emerald-500",
    implemented: true,
  },
  {
    id: "purchase-orders",
    title: "Purchase Orders",
    description: "Set up purchase order templates for procurement",
    icon: Receipt,
    url: "/po-templates",
    color: "text-rose-500",
    implemented: true,
  },
  {
    id: "checklists",
    title: "Checklist Groups",
    description: "Create reusable checklist groups containing checklists and items",
    icon: CheckSquare,
    url: "/checklist-templates",
    color: "text-violet-500",
    implemented: true,
  },
];

export default function Templates() {
  const [, navigate] = useLocation();

  const implementedCount = templateTypes.filter(t => t.implemented).length;

  return (
    <div className="flex flex-col h-full">
      {/* Row 1 - Title & Count (36px) - Matching Tasks page style */}
      <div className="h-9 bg-background flex items-center justify-between px-3 gap-4 flex-shrink-0 border-b border-border">
        {/* Left: Breadcrumbs + Title */}
        <div className="flex items-center gap-2">
          <nav className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="breadcrumbs">
            <span className="text-foreground font-medium">Templates</span>
          </nav>
          <Badge variant="secondary" className="text-xs" data-testid="text-template-count">
            {implementedCount} active
          </Badge>
        </div>
      </div>

      {/* Row 2 - Subtitle (36px) */}
      <div className="h-9 bg-background flex items-center px-3 gap-4 flex-shrink-0 border-b border-border">
        <p className="text-xs text-muted-foreground">
          Manage company-wide templates for all your project needs
        </p>
      </div>

      {/* Template Type Cards - Compact Budget-style */}
      <div className="flex-1 overflow-auto p-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
          {templateTypes.map((template) => {
            const Icon = template.icon;
            return (
              <Card
                key={template.id}
                className={`p-2 ${template.implemented ? "hover-elevate cursor-pointer" : "opacity-50 cursor-not-allowed"}`}
                onClick={() => template.implemented && navigate(template.url)}
                data-testid={`card-template-type-${template.id}`}
              >
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-md bg-muted shrink-0 ${template.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-sm font-medium truncate">{template.title}</p>
                      {template.implemented ? (
                        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      ) : (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 shrink-0" data-testid={`badge-coming-soon-${template.id}`}>
                          Soon
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {template.description}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
