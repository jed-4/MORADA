import ComingSoon from "@/components/ComingSoon";
import { 
  MessageSquare, 
  FileText, 
  Calculator, 
  FileBarChart, 
  FileSearch, 
  HelpCircle, 
  File, 
  Clock, 
  CheckCircle, 
  DollarSign, 
  Receipt, 
  CreditCard, 
  BookOpen, 
  Timer, 
  PiggyBank, 
  FolderOpen, 
  Users,
  LayoutTemplate,
  Settings,
  Mail,
  UserPlus,
  Calendar
} from "lucide-react";

interface ComingSoonPageProps {
  section: string;
}

const sectionConfig = {
  messages: {
    title: "Messages",
    description: "Team communication and project discussions will be available here. Send messages, share updates, and collaborate with your team.",
    icon: <MessageSquare className="h-12 w-12" />,
    estimatedDate: "Q2 2024"
  },
  notes: {
    title: "Notes",
    description: "Keep track of important project notes, meeting minutes, and documentation in one centralized location.",
    icon: <FileText className="h-12 w-12" />,
    estimatedDate: "Q2 2024"
  },
  takeoff: {
    title: "Take Off",
    description: "Accurate quantity takeoffs and material calculations for your building projects. Streamline your estimation process.",
    icon: <Calculator className="h-12 w-12" />,
    estimatedDate: "Q3 2024"
  },
  estimates: {
    title: "Estimates",
    description: "Create detailed project estimates with line items, labor costs, and material pricing for client proposals.",
    icon: <FileBarChart className="h-12 w-12" />,
    estimatedDate: "Q3 2024"
  },
  rfq: {
    title: "Request For Quotes",
    description: "Manage supplier quotes and vendor communications. Compare pricing and track quote responses efficiently.",
    icon: <FileSearch className="h-12 w-12" />,
    estimatedDate: "Q3 2024"
  },
  rfi: {
    title: "Request For Information",
    description: "Track information requests from clients, architects, and consultants. Ensure all questions are answered promptly.",
    icon: <HelpCircle className="h-12 w-12" />,
    estimatedDate: "Q3 2024"
  },
  proposal: {
    title: "Proposal",
    description: "Generate professional project proposals with detailed scope, pricing, and terms for client approval.",
    icon: <File className="h-12 w-12" />,
    estimatedDate: "Q4 2024"
  },
  schedule: {
    title: "Schedule",
    description: "Comprehensive project scheduling with Gantt charts, milestones, and dependency tracking.",
    icon: <Clock className="h-12 w-12" />,
    estimatedDate: "Q2 2024"
  },
  selections: {
    title: "Selections",
    description: "Manage client selections for finishes, fixtures, and materials. Track approvals and changes.",
    icon: <CheckCircle className="h-12 w-12" />,
    estimatedDate: "Q4 2024"
  },
  allowances: {
    title: "Allowances",
    description: "Track project allowances and client selections within budget constraints.",
    icon: <DollarSign className="h-12 w-12" />,
    estimatedDate: "Q4 2024"
  },
  "purchase-orders": {
    title: "Purchase Orders",
    description: "Create and manage purchase orders for materials and services. Track deliveries and payments.",
    icon: <Receipt className="h-12 w-12" />,
    estimatedDate: "Q3 2024"
  },
  variations: {
    title: "Variations",
    description: "Document and track project variations and change orders. Maintain clear approval processes.",
    icon: <FileText className="h-12 w-12" />,
    estimatedDate: "Q4 2024"
  },
  bills: {
    title: "Bills",
    description: "Manage supplier invoices and payments. Track expenses against project budgets.",
    icon: <CreditCard className="h-12 w-12" />,
    estimatedDate: "Q3 2024"
  },
  invoices: {
    title: "Client Invoices",
    description: "Generate and send professional invoices to clients. Track payments and outstanding amounts.",
    icon: <Receipt className="h-12 w-12" />,
    estimatedDate: "Q3 2024"
  },
  "site-diary": {
    title: "Site Diary",
    description: "Daily site reports with weather, progress updates, and incident tracking for compliance.",
    icon: <BookOpen className="h-12 w-12" />,
    estimatedDate: "Q2 2024"
  },
  timesheets: {
    title: "Timesheets",
    description: "Track worker hours, overtime, and project time allocation for accurate job costing.",
    icon: <Timer className="h-12 w-12" />,
    estimatedDate: "Q2 2024"
  },
  budget: {
    title: "Budget",
    description: "Comprehensive budget tracking with cost centers, variance analysis, and financial reporting.",
    icon: <PiggyBank className="h-12 w-12" />,
    estimatedDate: "Q3 2024"
  },
  files: {
    title: "Files",
    description: "Centralized document management for plans, contracts, permits, and project documentation.",
    icon: <FolderOpen className="h-12 w-12" />,
    estimatedDate: "Q2 2024"
  },
  team: {
    title: "Team",
    description: "Manage project team members, roles, and permissions. Track team performance and availability.",
    icon: <Users className="h-12 w-12" />,
    estimatedDate: "Q2 2024"
  },
  templates: {
    title: "Templates",
    description: "Create and manage project templates for common building types and workflows.",
    icon: <LayoutTemplate className="h-12 w-12" />,
    estimatedDate: "Q4 2024"
  },
  settings: {
    title: "Settings",
    description: "Configure business settings, user preferences, and system integrations.",
    icon: <Settings className="h-12 w-12" />,
    estimatedDate: "Q2 2024"
  },
  checklists: {
    title: "Checklists",
    description: "Quality control and compliance checklists for various construction phases.",
    icon: <CheckCircle className="h-12 w-12" />,
    estimatedDate: "Q3 2024"
  },
  emails: {
    title: "Emails",
    description: "Integrated email management for project communications and client correspondence.",
    icon: <Mail className="h-12 w-12" />,
    estimatedDate: "Q4 2024"
  },
  crm: {
    title: "CRM",
    description: "Customer relationship management for leads, clients, and business development.",
    icon: <UserPlus className="h-12 w-12" />,
    estimatedDate: "Q4 2024"
  },
  "business-team": {
    title: "Business Team",
    description: "Manage company-wide team members, departments, and organizational structure.",
    icon: <Users className="h-12 w-12" />,
    estimatedDate: "Q3 2024"
  },
  "business-expenses": {
    title: "Business Expenses",
    description: "Submit and track all business expenses including receipts, mileage, and reimbursements.",
    icon: <CreditCard className="h-12 w-12" />,
    estimatedDate: "Q2 2024"
  },
  "business-timesheets": {
    title: "Business Timesheets",
    description: "Log work hours, overtime, and track productivity across all business operations.",
    icon: <Timer className="h-12 w-12" />,
    estimatedDate: "Q2 2024"
  },
  "business-messages": {
    title: "Business Messages",
    description: "Company-wide messaging system for announcements, team communication, and updates.",
    icon: <MessageSquare className="h-12 w-12" />,
    estimatedDate: "Q2 2024"
  },
  "business-leave": {
    title: "Sick Days & Leave",
    description: "Request and manage sick days, vacation time, and other leave requests with approval workflows.",
    icon: <Calendar className="h-12 w-12" />,
    estimatedDate: "Q2 2024"
  }
};

export default function ComingSoonPage({ section }: ComingSoonPageProps) {
  const config = sectionConfig[section as keyof typeof sectionConfig];
  
  if (!config) {
    return (
      <ComingSoon
        title="Coming Soon"
        description="This section is under development and will be available soon."
        estimatedDate="2024"
      />
    );
  }

  return (
    <ComingSoon
      title={config.title}
      description={config.description}
      icon={config.icon}
      estimatedDate={config.estimatedDate}
    />
  );
}