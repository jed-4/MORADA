import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "lucide-react";

const templateTypes = [
  {
    id: "notes",
    title: "Notes",
    description: "Create reusable note templates with custom fields",
    icon: FileText,
    url: "/note-templates",
    color: "text-blue-500",
  },
  {
    id: "site-diary",
    title: "Site Diary",
    description: "Manage site diary templates for daily construction logs",
    icon: BookOpen,
    url: "/site-diary-templates",
    color: "text-purple-500",
  },
  {
    id: "schedule",
    title: "Schedule",
    description: "Build schedule templates for project timelines",
    icon: Clock,
    url: "/schedule-templates",
    color: "text-green-500",
  },
  {
    id: "tasks",
    title: "Tasks",
    description: "Create task templates for recurring workflows",
    icon: CheckSquare,
    url: "/task-templates",
    color: "text-orange-500",
  },
  {
    id: "takeoffs",
    title: "Take-offs",
    description: "Design take-off templates for quantity surveying",
    icon: Calculator,
    url: "/takeoff-templates",
    color: "text-cyan-500",
  },
  {
    id: "estimates",
    title: "Estimates",
    description: "Set up estimate templates with standard line items",
    icon: FileBarChart,
    url: "/estimate-templates",
    color: "text-indigo-500",
  },
  {
    id: "rfq",
    title: "Request for Quote",
    description: "Build RFQ templates for vendor requests",
    icon: FileSearch,
    url: "/rfq-templates",
    color: "text-pink-500",
  },
  {
    id: "rfi",
    title: "Request for Information",
    description: "Create RFI templates for project clarifications",
    icon: HelpCircle,
    url: "/rfi-templates",
    color: "text-yellow-500",
  },
  {
    id: "proposal",
    title: "Proposal",
    description: "Design proposal templates for client submissions",
    icon: File,
    url: "/proposal-templates",
    color: "text-teal-500",
  },
  {
    id: "selections",
    title: "Selections",
    description: "Manage selection templates for client choices",
    icon: CheckCircle,
    url: "/selection-templates",
    color: "text-emerald-500",
  },
  {
    id: "purchase-orders",
    title: "Purchase Orders",
    description: "Set up purchase order templates for procurement",
    icon: Receipt,
    url: "/po-templates",
    color: "text-rose-500",
  },
];

export default function Templates() {
  const [, navigate] = useLocation();

  return (
    <div className="h-full flex flex-col p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
        <p className="text-muted-foreground mt-1">
          Manage company-wide templates for all your project needs
        </p>
      </div>

      {/* Template Type Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templateTypes.map((template) => {
          const Icon = template.icon;
          return (
            <Card
              key={template.id}
              className="hover-elevate cursor-pointer transition-all"
              onClick={() => navigate(template.url)}
              data-testid={`card-template-type-${template.id}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-md bg-muted ${template.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg">{template.title}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {template.description}
                    </p>
                  </div>
                </div>
              </CardHeader>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
