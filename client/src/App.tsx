import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ProjectProvider } from "@/contexts/ProjectContext";
import Header from "@/components/Header";
import { ResizableSidebar } from "@/components/ResizableSidebar";
import Dashboard from "@/pages/Dashboard";
import Tasks from "@/pages/Tasks";
import Calendar from "@/pages/Calendar";
import Notes from "@/pages/Notes";
import Minutes from "@/pages/Minutes";
import MinuteDetail from "@/pages/MinuteDetail";
import Templates from "@/pages/Templates";
import Settings from "@/pages/Settings";
import ProjectSettings from "@/pages/ProjectSettings";
import SystemConfiguration from "@/pages/SystemConfiguration";
import RolesPermissions from "@/pages/RolesPermissions";
import BusinessOverviewPage from "@/pages/BusinessOverview";
import ComingSoonPage from "@/pages/ComingSoonPage";
import Estimates from "@/pages/Estimates";
import ProjectEstimates from "@/pages/ProjectEstimates";
import EstimateDetail from "@/pages/EstimateDetail";
import Selections from "@/pages/Selections";
import SelectionDetail from "@/pages/SelectionDetail";
import Suppliers from "@/pages/Suppliers";
import Bills from "@/pages/Bills";
import BillDetail from "@/pages/BillDetail";
import Variations from "@/pages/Variations";
import VariationDetail from "@/pages/VariationDetail";
import ClientInvoices from "@/pages/ClientInvoices";
import ClientInvoiceDetail from "@/pages/ClientInvoiceDetail";
import SiteDiaryTemplates from "@/pages/SiteDiaryTemplates";
import SiteDiaryEntries from "@/pages/SiteDiaryEntries";
import ChecklistTemplates from "@/pages/ChecklistTemplates";
import ChecklistTemplateDetail from "@/pages/ChecklistTemplateDetail";
import CostCodes from "@/pages/CostCodes";
import Contacts from "@/pages/Contacts";
import Budget from "@/pages/Budget";
import ArchivedProjects from "@/pages/ArchivedProjects";
import Schedule from "@/pages/Schedule";
import Timesheets from "@/pages/Timesheets";
import Allowances from "@/pages/Allowances";
import AllowanceDetail from "@/pages/AllowanceDetail";
import Defects from "@/pages/Defects";
import Proposals from "@/pages/Proposals";
import ProposalDetail from "@/pages/ProposalDetail";
import BusinessProjects from "@/pages/BusinessProjects";
import Takeoff from "@/pages/Takeoff";
import FieldSettings from "@/pages/FieldSettings";
import TaskSettings from "@/pages/TaskSettings";
import BusinessCalendar from "@/pages/BusinessCalendar";
import PersonalCalendar from "@/pages/PersonalCalendar";
import UserProfile from "@/pages/UserProfile";
import BusinessTasks from "@/pages/BusinessTasks";
import Systems from "@/pages/Systems";
import TeamManagement from "@/pages/TeamManagement";
import UserProfileView from "@/pages/UserProfileView";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing";
import OnboardingPage from "@/pages/onboarding";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { SocketProvider } from "@/lib/socket";
import Messages from "@/pages/Messages";
import RFQs from "@/pages/RFQs";
import RFQDetail from "@/pages/RFQDetail";
import ProjectScope from "@/pages/ProjectScope";
import ProjectTeam from "@/pages/ProjectTeam";
import Gantt from "@/pages/Gantt";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/tasks" component={Tasks} />
      <Route path="/calendar" component={Calendar} />
      <Route path="/messages" component={Messages} />
      <Route path="/notes" component={Notes} />
      <Route path="/minutes" component={Minutes} />
      <Route path="/minutes/:id" component={MinuteDetail} />
      <Route path="/project-settings" component={ProjectSettings} />
      
      {/* User Profile */}
      <Route path="/profile" component={UserProfile} />
      
      {/* Business Project */}
      <Route path="/business" component={BusinessOverviewPage} />
      <Route path="/business/projects" component={BusinessProjects} />
      <Route path="/business/tasks" component={BusinessTasks} />
      <Route path="/business/calendar" component={BusinessCalendar} />
      <Route path="/my-calendar" component={PersonalCalendar} />
      <Route path="/business/expenses" component={() => <ComingSoonPage section="business-expenses" />} />
      <Route path="/business/timesheets" component={Timesheets} />
      <Route path="/business/minutes" component={Minutes} />
      <Route path="/business/minutes/:id" component={MinuteDetail} />
      <Route path="/business/messages" component={() => <ComingSoonPage section="business-messages" />} />
      <Route path="/business/leave" component={() => <ComingSoonPage section="business-leave" />} />
      
      {/* Systems Section */}
      <Route path="/systems" component={Systems} />
      
      {/* Team Management */}
      <Route path="/business-team" component={TeamManagement} />
      <Route path="/business-team/:userId" component={UserProfileView} />
      
      {/* Project-specific routes */}
      <Route path="/projects/:projectId" component={Dashboard} />
      <Route path="/projects/:projectId/scope" component={ProjectScope} />
      <Route path="/projects/:projectId/notes" component={Notes} />
      <Route path="/projects/:projectId/messages" component={Messages} />
      <Route path="/projects/:projectId/minutes" component={Minutes} />
      <Route path="/projects/:projectId/minutes/:id" component={MinuteDetail} />
      <Route path="/projects/:projectId/tasks" component={Tasks} />
      <Route path="/projects/:projectId/calendar" component={Calendar} />
      <Route path="/projects/:projectId/estimates" component={ProjectEstimates} />
      <Route path="/projects/:projectId/estimates/new" component={EstimateDetail} />
      <Route path="/projects/:projectId/estimates/:estimateId" component={EstimateDetail} />
      <Route path="/projects/:projectId/selections" component={Selections} />
      <Route path="/projects/:projectId/selections/:id" component={SelectionDetail} />
      <Route path="/projects/:projectId/messages" component={() => <ComingSoonPage section="messages" />} />
      <Route path="/projects/:projectId/schedule" component={Schedule} />
      <Route path="/projects/:projectId/gantt" component={Gantt} />
      <Route path="/projects/:projectId/takeoff" component={Takeoff} />
      <Route path="/projects/:projectId/rfqs" component={RFQs} />
      <Route path="/projects/:projectId/rfqs/:id" component={RFQDetail} />
      <Route path="/projects/:projectId/rfi" component={() => <ComingSoonPage section="rfi" />} />
      <Route path="/projects/:projectId/proposals" component={Proposals} />
      <Route path="/projects/:projectId/proposals/new" component={ProposalDetail} />
      <Route path="/projects/:projectId/proposals/:id" component={ProposalDetail} />
      <Route path="/projects/:projectId/allowances/:allowanceId" component={AllowanceDetail} />
      <Route path="/projects/:projectId/allowances" component={Allowances} />
      <Route path="/projects/:projectId/defects" component={Defects} />
      <Route path="/projects/:projectId/purchase-orders" component={() => <ComingSoonPage section="purchase-orders" />} />
      <Route path="/projects/:projectId/variations" component={Variations} />
      <Route path="/projects/:projectId/variations/new" component={VariationDetail} />
      <Route path="/projects/:projectId/variations/:variationId" component={VariationDetail} />
      <Route path="/projects/:projectId/bills" component={Bills} />
      <Route path="/projects/:projectId/bills/:id" component={BillDetail} />
      <Route path="/projects/:projectId/client-invoices" component={ClientInvoices} />
      <Route path="/projects/:projectId/client-invoices/new" component={ClientInvoiceDetail} />
      <Route path="/projects/:projectId/client-invoices/:invoiceId" component={ClientInvoiceDetail} />
      <Route path="/projects/:projectId/invoices" component={() => <ComingSoonPage section="invoices" />} />
      <Route path="/projects/:projectId/site-diary" component={SiteDiaryEntries} />
      <Route path="/projects/:projectId/timesheets" component={Timesheets} />
      <Route path="/projects/:projectId/budget" component={Budget} />
      <Route path="/projects/:projectId/files" component={() => <ComingSoonPage section="files" />} />
      <Route path="/projects/:projectId/team" component={ProjectTeam} />
      
      {/* Global Project sections - Coming Soon */}
      <Route path="/messages" component={() => <ComingSoonPage section="messages" />} />
      <Route path="/takeoff" component={Takeoff} />
      <Route path="/estimates" component={Estimates} />
      <Route path="/estimates/project/:projectId" component={ProjectEstimates} />
      <Route path="/estimates/new" component={EstimateDetail} />
      <Route path="/estimates/:id" component={EstimateDetail} />
      <Route path="/rfqs" component={RFQs} />
      <Route path="/rfqs/:id" component={() => <ComingSoonPage section="rfq-detail" />} />
      <Route path="/rfi" component={() => <ComingSoonPage section="rfi" />} />
      <Route path="/proposals" component={Proposals} />
      <Route path="/proposals/new" component={ProposalDetail} />
      <Route path="/proposals/:id" component={ProposalDetail} />
      <Route path="/schedule" component={() => <ComingSoonPage section="schedule" />} />
      <Route path="/selections" component={Selections} />
      <Route path="/selections/:id" component={SelectionDetail} />
      <Route path="/allowances" component={() => <ComingSoonPage section="allowances" />} />
      <Route path="/purchase-orders" component={() => <ComingSoonPage section="purchase-orders" />} />
      <Route path="/variations" component={Variations} />
      <Route path="/variations/new" component={VariationDetail} />
      <Route path="/variations/:id" component={VariationDetail} />
      <Route path="/bills" component={Bills} />
      <Route path="/bills/new" component={BillDetail} />
      <Route path="/bills/:id" component={BillDetail} />
      <Route path="/client-invoices" component={ClientInvoices} />
      <Route path="/client-invoices/new" component={ClientInvoiceDetail} />
      <Route path="/client-invoices/:id" component={ClientInvoiceDetail} />
      <Route path="/invoices" component={() => <ComingSoonPage section="invoices" />} />
      <Route path="/site-diary" component={SiteDiaryEntries} />
      <Route path="/timesheets" component={Timesheets} />
      <Route path="/budget" component={() => <ComingSoonPage section="budget" />} />
      <Route path="/files" component={() => <ComingSoonPage section="files" />} />
      <Route path="/team" component={() => <ComingSoonPage section="team" />} />

      {/* Business sections - Coming Soon */}
      <Route path="/templates" component={Templates} />
      <Route path="/site-diary-templates" component={SiteDiaryTemplates} />
      <Route path="/checklist-templates/:id" component={ChecklistTemplateDetail} />
      <Route path="/checklist-templates" component={ChecklistTemplates} />
      <Route path="/settings" component={Settings} />
      <Route path="/system-configuration" component={SystemConfiguration} />
      <Route path="/field-settings" component={FieldSettings} />
      <Route path="/task-settings" component={TaskSettings} />
      <Route path="/roles-permissions" component={RolesPermissions} />
      <Route path="/suppliers" component={Suppliers} />
      <Route path="/cost-codes" component={CostCodes} />
      <Route path="/contacts" component={Contacts} />
      <Route path="/archived-projects" component={ArchivedProjects} />
      <Route path="/checklists" component={() => <ComingSoonPage section="checklists" />} />
      <Route path="/emails" component={() => <ComingSoonPage section="emails" />} />
      <Route path="/crm" component={() => <ComingSoonPage section="crm" />} />
      <Route path="/business-team" component={() => <ComingSoonPage section="business-team" />} />

      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function UnauthenticatedRoutes() {
  const [location] = useLocation();
  
  if (location === '/login') {
    return <Login />;
  }
  if (location === '/signup') {
    return <Signup />;
  }
  return <LandingPage />;
}

function AuthWrapper() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [location, navigate] = useLocation();
  
  // Sidebar width state - must be declared before any conditional returns
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('sidebar-width');
    return saved || "20rem";
  });

  useEffect(() => {
    localStorage.setItem('sidebar-width', sidebarWidth);
  }, [sidebarWidth]);

  // Debug logging
  useEffect(() => {
    console.log('AuthWrapper State:', { 
      isLoading, 
      isAuthenticated, 
      hasUser: !!user,
      hasCompany: user?.companyId,
      location 
    });
  }, [isLoading, isAuthenticated, user, location]);

  // Redirect authenticated users away from auth pages to dashboard
  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      const authPages = ['/login', '/signup'];
      if (authPages.includes(location)) {
        console.log('Redirecting from auth page to dashboard');
        navigate('/');
      }
    }
  }, [isAuthenticated, isLoading, location, navigate, user]);

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="loading-enhanced text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" data-testid="loading-spinner"></div>
          <p className="text-muted-foreground" data-testid="text-loading">Loading BuildPro...</p>
        </div>
      </div>
    );
  }

  // Show login/signup/landing pages if not authenticated
  if (!isAuthenticated) {
    console.log('Showing unauthenticated routes');
    return <UnauthenticatedRoutes />;
  }

  // Show onboarding if user doesn't have a company
  if (user && !user.companyId) {
    console.log('Showing onboarding page');
    return <OnboardingPage />;
  }

  console.log('Showing dashboard');

  // Show main app if authenticated and has company
  const style = {
    "--sidebar-width": sidebarWidth,
    "--sidebar-width-icon": "4rem",
  };

  return (
    <TooltipProvider>
      <ThemeProvider>
        <ProjectProvider>
          <SocketProvider>
            <SidebarProvider style={style as React.CSSProperties}>
            <div className="flex flex-col h-screen w-full">
              {/* Header spans full width at the top */}
              <Header />
              
              {/* Sidebar and main content below header */}
              <div className="flex flex-1 overflow-hidden">
                <ResizableSidebar 
                  onWidthChange={setSidebarWidth}
                  initialWidth={sidebarWidth}
                />
                <main className="flex-1 overflow-auto">
                  <Router />
                </main>
              </div>
            </div>
          </SidebarProvider>
          </SocketProvider>
        </ProjectProvider>
      </ThemeProvider>
    </TooltipProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthWrapper />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
