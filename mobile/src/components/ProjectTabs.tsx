import { useLocation } from "wouter";
import { CheckSquare, Calendar, DollarSign, FileText, Users, FolderOpen, FileText as Doc, AlertCircle, Package, Layout, Eye, BarChart3, Receipt, Book, MessageSquare, Clock, Lightbulb } from "lucide-react";
import { useProjectRoute } from "@/hooks/useProjectRoute";

const projectTabs = [
  { path: "scope", label: "Scope", Icon: Layout },
  { path: "notes", label: "Notes", Icon: Doc },
  { path: "messages", label: "Messages", Icon: MessageSquare },
  { path: "minutes", label: "Minutes", Icon: Book },
  { path: "tasks", label: "Tasks", Icon: CheckSquare },
  { path: "schedule", label: "Schedule", Icon: Calendar },
  { path: "estimates", label: "Estimates", Icon: FileText },
  { path: "selections", label: "Selections", Icon: Eye },
  { path: "rfq", label: "RFQ", Icon: FileText },
  { path: "rfi", label: "RFI", Icon: FileText },
  { path: "proposals", label: "Proposals", Icon: Lightbulb },
  { path: "allowances", label: "Allowances", Icon: Package },
  { path: "defects", label: "Defects", Icon: AlertCircle },
  { path: "pos", label: "POs", Icon: Receipt },
  { path: "variations", label: "Variations", Icon: BarChart3 },
  { path: "bills", label: "Bills", Icon: DollarSign },
  { path: "client-invoices", label: "Client Invoices", Icon: DollarSign },
  { path: "site-diary", label: "Site Diary", Icon: Book },
  { path: "timesheets", label: "Timesheets", Icon: Clock },
  { path: "budget", label: "Budget", Icon: BarChart3 },
  { path: "files", label: "Files", Icon: FolderOpen },
  { path: "team", label: "Team", Icon: Users },
];

export function ProjectTabs() {
  const [, setLocation] = useLocation();
  const routeParams = useProjectRoute();
  
  const projectId = routeParams?.projectId;
  const currentTab = routeParams?.tab || 'scope';

  return (
    <div className="bg-card border-b overflow-x-auto scrollbar-hide">
      <div className="flex items-center px-2 min-w-max">
        {projectTabs.map((tab) => {
          const isActive = currentTab === tab.path;
          const Icon = tab.Icon;
          
          return (
            <button
              key={tab.path}
              onClick={() => {
                if (projectId) {
                  setLocation(`/projects/${projectId}/${tab.path}`);
                }
              }}
              className={`flex items-center gap-1.5 px-4 py-3 whitespace-nowrap transition-colors border-b-2 ${
                isActive 
                  ? "text-foreground border-[#bba7db]" 
                  : "text-muted-foreground border-transparent"
              }`}
              data-testid={`tab-${tab.label.toLowerCase()}`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-sm font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
