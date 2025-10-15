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
import CostCodes from "@/pages/CostCodes";
import Contacts from "@/pages/Contacts";
import NotFound from "@/pages/not-found";
import Login from "@/pages/Login";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/tasks" component={Tasks} />
      <Route path="/calendar" component={Calendar} />
      <Route path="/notes" component={Notes} />
      <Route path="/project-settings" component={ProjectSettings} />
      
      {/* Business Project */}
      <Route path="/business" component={BusinessOverviewPage} />
      <Route path="/business/expenses" component={() => <ComingSoonPage section="business-expenses" />} />
      <Route path="/business/timesheets" component={() => <ComingSoonPage section="business-timesheets" />} />
      <Route path="/business/messages" component={() => <ComingSoonPage section="business-messages" />} />
      <Route path="/business/leave" component={() => <ComingSoonPage section="business-leave" />} />
      
      {/* Project-specific routes */}
      <Route path="/projects/:projectId" component={Dashboard} />
      <Route path="/projects/:projectId/notes" component={Notes} />
      <Route path="/projects/:projectId/tasks" component={Tasks} />
      <Route path="/projects/:projectId/calendar" component={Calendar} />
      <Route path="/projects/:projectId/estimates" component={ProjectEstimates} />
      <Route path="/projects/:projectId/estimates/new" component={EstimateDetail} />
      <Route path="/projects/:projectId/estimates/:estimateId" component={EstimateDetail} />
      <Route path="/projects/:projectId/selections" component={Selections} />
      <Route path="/projects/:projectId/selections/:id" component={SelectionDetail} />
      <Route path="/projects/:projectId/messages" component={() => <ComingSoonPage section="messages" />} />
      <Route path="/projects/:projectId/schedule" component={() => <ComingSoonPage section="schedule" />} />
      <Route path="/projects/:projectId/takeoff" component={() => <ComingSoonPage section="takeoff" />} />
      <Route path="/projects/:projectId/rfq" component={() => <ComingSoonPage section="rfq" />} />
      <Route path="/projects/:projectId/rfi" component={() => <ComingSoonPage section="rfi" />} />
      <Route path="/projects/:projectId/proposal" component={() => <ComingSoonPage section="proposal" />} />
      <Route path="/projects/:projectId/allowances" component={() => <ComingSoonPage section="allowances" />} />
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
      <Route path="/projects/:projectId/timesheets" component={() => <ComingSoonPage section="timesheets" />} />
      <Route path="/projects/:projectId/budget" component={() => <ComingSoonPage section="budget" />} />
      <Route path="/projects/:projectId/files" component={() => <ComingSoonPage section="files" />} />
      <Route path="/projects/:projectId/team" component={() => <ComingSoonPage section="team" />} />
      
      {/* Global Project sections - Coming Soon */}
      <Route path="/messages" component={() => <ComingSoonPage section="messages" />} />
      <Route path="/takeoff" component={() => <ComingSoonPage section="takeoff" />} />
      <Route path="/estimates" component={Estimates} />
      <Route path="/estimates/project/:projectId" component={ProjectEstimates} />
      <Route path="/estimates/new" component={EstimateDetail} />
      <Route path="/estimates/:id" component={EstimateDetail} />
      <Route path="/rfq" component={() => <ComingSoonPage section="rfq" />} />
      <Route path="/rfi" component={() => <ComingSoonPage section="rfi" />} />
      <Route path="/proposal" component={() => <ComingSoonPage section="proposal" />} />
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
      <Route path="/timesheets" component={() => <ComingSoonPage section="timesheets" />} />
      <Route path="/budget" component={() => <ComingSoonPage section="budget" />} />
      <Route path="/files" component={() => <ComingSoonPage section="files" />} />
      <Route path="/team" component={() => <ComingSoonPage section="team" />} />

      {/* Business sections - Coming Soon */}
      <Route path="/templates" component={Templates} />
      <Route path="/site-diary-templates" component={SiteDiaryTemplates} />
      <Route path="/checklist-templates" component={ChecklistTemplates} />
      <Route path="/settings" component={Settings} />
      <Route path="/system-configuration" component={SystemConfiguration} />
      <Route path="/roles-permissions" component={RolesPermissions} />
      <Route path="/suppliers" component={Suppliers} />
      <Route path="/cost-codes" component={CostCodes} />
      <Route path="/contacts" component={Contacts} />
      <Route path="/checklists" component={() => <ComingSoonPage section="checklists" />} />
      <Route path="/emails" component={() => <ComingSoonPage section="emails" />} />
      <Route path="/crm" component={() => <ComingSoonPage section="crm" />} />
      <Route path="/business-team" component={() => <ComingSoonPage section="business-team" />} />

      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthWrapper() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  
  // Sidebar width state - must be declared before any conditional returns
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('sidebar-width');
    return saved || "20rem";
  });

  useEffect(() => {
    localStorage.setItem('sidebar-width', sidebarWidth);
  }, [sidebarWidth]);

  // Check authentication status
  const { data: authCheck, isLoading } = useQuery({
    queryKey: ["/api/projects"],
    retry: false,
    retryOnMount: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!isLoading) {
      setIsAuthenticated(!!authCheck);
    }
  }, [authCheck, isLoading]);

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    // Force refetch of auth-dependent queries
    queryClient.invalidateQueries();
  };

  // Show loading while checking auth
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="loading-enhanced text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading BuildPro...</p>
        </div>
      </div>
    );
  }

  // Show login if not authenticated
  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  // Show main app if authenticated
  const style = {
    "--sidebar-width": sidebarWidth,
    "--sidebar-width-icon": "4rem",
  };

  return (
    <TooltipProvider>
      <ThemeProvider>
        <ProjectProvider>
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
