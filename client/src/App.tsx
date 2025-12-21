import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { DashboardTheme } from "@shared/schema";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ProjectProvider } from "@/contexts/ProjectContext";
import Header from "@/components/Header";
import { SidebarNav } from "@/components/SidebarNav";
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
import Business from "@/pages/Business";
import ComingSoonPage from "@/pages/ComingSoonPage";
import Estimates from "@/pages/Estimates";
import ProjectEstimates from "@/pages/ProjectEstimates";
import EstimateDetail from "@/pages/EstimateDetail";
import Selections from "@/pages/Selections";
import SelectionDetail from "@/pages/SelectionDetail";
import Suppliers from "@/pages/Suppliers";
import Trades from "@/pages/Trades";
import Bills from "@/pages/Bills";
import BillDetail from "@/pages/BillDetail";
import Variations from "@/pages/Variations";
import VariationDetail from "@/pages/VariationDetail";
import ClientInvoices from "@/pages/ClientInvoices";
import ClientInvoiceDetail from "@/pages/ClientInvoiceDetail";
import SiteDiaryTemplates from "@/pages/SiteDiaryTemplates";
import SiteDiaryEntries from "@/pages/SiteDiaryEntries";
import ScopeTemplates from "@/pages/ScopeTemplates";
import ScopeTemplateDetail from "@/pages/ScopeTemplateDetail";
import ScheduleTemplates from "@/pages/ScheduleTemplates";
import ScheduleTemplateDetail from "@/pages/ScheduleTemplateDetail";
import EstimateTemplates from "@/pages/EstimateTemplates";
import EstimateTemplateDetail from "@/pages/EstimateTemplateDetail";
import SelectionTemplates from "@/pages/SelectionTemplates";
import SelectionTemplateDetail from "@/pages/SelectionTemplateDetail";
import SelectionTemplateItemDetail from "@/pages/SelectionTemplateItemDetail";
import POTemplates from "@/pages/POTemplates";
import POTemplateDetail from "@/pages/POTemplateDetail";
import RfqTemplates from "@/pages/RfqTemplates";
import RfqTemplateDetail from "@/pages/RfqTemplateDetail";
import RfiTemplates from "@/pages/RfiTemplates";
import RfiTemplateDetail from "@/pages/RfiTemplateDetail";
import ChecklistTemplates from "@/pages/ChecklistTemplates";
import NoteTemplates from "@/pages/NoteTemplates";
import TaskTemplates from "@/pages/TaskTemplates";
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
import PriceListPage from "@/pages/PriceListPage";
import AIPriceReviewPage from "@/pages/AIPriceReviewPage";
import CreateRFQ from "@/pages/CreateRFQ";
import CreateRFI from "@/pages/CreateRFI";
import TeamManagement from "@/pages/TeamManagement";
import UserProfileView from "@/pages/UserProfileView";
import UserWorkspace from "@/pages/UserWorkspace";
import NotFound from "@/pages/not-found";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import LandingPage from "@/pages/landing";
import OnboardingPage from "@/pages/onboarding";
import AcceptInvitation from "@/pages/AcceptInvitation";
import AuthPage from "@/pages/AuthPage";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation, Redirect } from "wouter";
import { SocketProvider } from "@/lib/socket";
import Messages from "@/pages/Messages";
import RFQs from "@/pages/RFQs";
import RFQDetail from "@/pages/RFQDetail";
import RFQPortal from "@/pages/RFQPortal";
import RFIs from "@/pages/RFIs";
import RFIDetail from "@/pages/RFIDetail";
import ProjectScope from "@/pages/ProjectScope";
import ProjectTeam from "@/pages/ProjectTeam";
import PurchaseOrders from "@/pages/PurchaseOrders";
import PurchaseOrderDetail from "@/pages/PurchaseOrderDetail";
import ProjectChecklists from "@/pages/ProjectChecklists";
import ChecklistInstanceDetail from "@/pages/ChecklistInstanceDetail";
import ProjectFiles from "@/pages/ProjectFiles";

function Router() {
  const { user } = useAuth();
  
  return (
    <Switch>
      {/* Public routes */}
      <Route path="/auth" component={AuthPage} />
      <Route path="/privacy" component={PrivacyPolicy} />
      <Route path="/portal/rfq/:token" component={RFQPortal} />
      
      <Route path="/">
        {() => {
          if (!user) {
            return (
              <div className="flex items-center justify-center h-full">
                <div className="text-muted-foreground">Loading...</div>
              </div>
            );
          }
          return <Redirect to={`/users/${user.id}`} />;
        }}
      </Route>
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/tasks" component={Tasks} />
      <Route path="/calendar" component={Calendar} />
      <Route path="/messages" component={Messages} />
      <Route path="/notes" component={Notes} />
      <Route path="/minutes" component={Minutes} />
      <Route path="/minutes/:id" component={MinuteDetail} />
      <Route path="/project-settings" component={ProjectSettings} />
      
      {/* User Workspace - /me redirects to current user */}
      <Route path="/me">
        {() => {
          if (!user) {
            return (
              <div className="flex items-center justify-center h-full">
                <div className="text-muted-foreground">Loading...</div>
              </div>
            );
          }
          return <Redirect to={`/users/${user.id}`} />;
        }}
      </Route>
      <Route path="/users/:userId" component={UserWorkspace} />
      <Route path="/users/:userId/:tab" component={UserWorkspace} />
      
      {/* User Profile / Settings */}
      <Route path="/profile" component={UserProfile} />
      <Route path="/user-settings" component={UserProfile} />
      
      {/* Business Pages - All handled by Business component with tabs */}
      <Route path="/business" component={Business} />
      <Route path="/business/projects" component={Business} />
      <Route path="/business/tasks" component={Business} />
      <Route path="/business/calendar" component={Business} />
      <Route path="/business/files" component={Business} />
      <Route path="/business/expenses" component={Business} />
      <Route path="/business/timesheets" component={Business} />
      <Route path="/business/minutes" component={Business} />
      <Route path="/business/minutes/:id" component={MinuteDetail} />
      <Route path="/business/messages" component={Business} />
      <Route path="/business/notes" component={Business} />
      <Route path="/business/leave" component={Business} />
      <Route path="/my-calendar" component={PersonalCalendar} />
      <Route path="/systems" component={Systems} />
      <Route path="/business-team" component={Business} />
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
      <Route path="/projects/:projectId/takeoff" component={Takeoff} />
      <Route path="/projects/:projectId/rfqs" component={RFQs} />
      <Route path="/projects/:projectId/rfqs/new" component={CreateRFQ} />
      <Route path="/projects/:projectId/rfqs/:id" component={RFQDetail} />
      <Route path="/projects/:projectId/rfis" component={RFIs} />
      <Route path="/projects/:projectId/rfis/new" component={CreateRFI} />
      <Route path="/projects/:projectId/rfis/:id" component={RFIDetail} />
      <Route path="/projects/:projectId/proposals" component={Proposals} />
      <Route path="/projects/:projectId/proposals/new" component={ProposalDetail} />
      <Route path="/projects/:projectId/proposals/:id" component={ProposalDetail} />
      <Route path="/projects/:projectId/allowances/:allowanceId" component={AllowanceDetail} />
      <Route path="/projects/:projectId/allowances" component={Allowances} />
      <Route path="/projects/:projectId/defects" component={Defects} />
      <Route path="/projects/:projectId/purchase-orders" component={PurchaseOrders} />
      <Route path="/projects/:projectId/purchase-orders/new" component={PurchaseOrderDetail} />
      <Route path="/projects/:projectId/purchase-orders/:poId" component={PurchaseOrderDetail} />
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
      <Route path="/projects/:projectId/files" component={ProjectFiles} />
      <Route path="/projects/:projectId/team" component={ProjectTeam} />
      <Route path="/projects/:projectId/checklists" component={ProjectChecklists} />
      <Route path="/projects/:projectId/checklists/:checklistId" component={ChecklistInstanceDetail} />
      
      {/* Global Project sections - Coming Soon */}
      <Route path="/messages" component={() => <ComingSoonPage section="messages" />} />
      <Route path="/takeoff" component={Takeoff} />
      <Route path="/estimates" component={Estimates} />
      <Route path="/estimates/project/:projectId" component={ProjectEstimates} />
      <Route path="/estimates/new" component={EstimateDetail} />
      <Route path="/estimates/:id" component={EstimateDetail} />
      <Route path="/rfqs" component={RFQs} />
      <Route path="/rfqs/new" component={CreateRFQ} />
      <Route path="/rfqs/:id" component={RFQDetail} />
      <Route path="/rfis" component={RFIs} />
      <Route path="/rfis/new" component={CreateRFI} />
      <Route path="/rfis/:id" component={RFIDetail} />
      <Route path="/proposals" component={Proposals} />
      <Route path="/proposals/new" component={ProposalDetail} />
      <Route path="/proposals/:id" component={ProposalDetail} />
      <Route path="/schedule" component={() => <ComingSoonPage section="schedule" />} />
      <Route path="/selections" component={Selections} />
      <Route path="/selections/:id" component={SelectionDetail} />
      <Route path="/allowances" component={() => <ComingSoonPage section="allowances" />} />
      <Route path="/purchase-orders" component={PurchaseOrders} />
      <Route path="/purchase-orders/new" component={PurchaseOrderDetail} />
      <Route path="/purchase-orders/:id" component={PurchaseOrderDetail} />
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
      <Route path="/note-templates" component={NoteTemplates} />
      <Route path="/site-diary-templates" component={SiteDiaryTemplates} />
      <Route path="/scope-templates" component={ScopeTemplates} />
      <Route path="/scope-templates/:templateId" component={ScopeTemplateDetail} />
      <Route path="/schedule-templates" component={ScheduleTemplates} />
      <Route path="/schedule-templates/:templateId" component={ScheduleTemplateDetail} />
      <Route path="/estimate-templates" component={EstimateTemplates} />
      <Route path="/estimate-templates/:templateId" component={EstimateTemplateDetail} />
      <Route path="/selection-templates" component={SelectionTemplates} />
      <Route path="/selection-templates/:templateId" component={SelectionTemplateDetail} />
      <Route path="/selection-templates/:templateId/items/:itemId" component={SelectionTemplateItemDetail} />
      <Route path="/po-templates" component={POTemplates} />
      <Route path="/po-templates/:templateId" component={POTemplateDetail} />
      <Route path="/rfq-templates" component={RfqTemplates} />
      <Route path="/rfq-templates/:templateId" component={RfqTemplateDetail} />
      <Route path="/rfi-templates" component={RfiTemplates} />
      <Route path="/rfi-templates/:templateId" component={RfiTemplateDetail} />
      <Route path="/checklist-templates/:id" component={ChecklistTemplateDetail} />
      <Route path="/checklist-templates" component={ChecklistTemplates} />
      <Route path="/task-templates" component={TaskTemplates} />
      <Route path="/settings" component={Settings} />
      <Route path="/system-configuration" component={SystemConfiguration} />
      <Route path="/field-settings" component={FieldSettings} />
      <Route path="/task-settings" component={TaskSettings} />
      <Route path="/roles-permissions" component={RolesPermissions} />
      <Route path="/suppliers" component={Suppliers} />
      <Route path="/trades" component={Trades} />
      <Route path="/price-list" component={PriceListPage} />
      <Route path="/ai-price-review" component={AIPriceReviewPage} />
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
  // Handle public routes for unauthenticated users
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <Route path="/accept-invite/:token" component={AcceptInvitation} />
      <Route path="/portal/rfq/:token" component={RFQPortal} />
      <Route path="/" component={AuthPage} />
      <Route component={AuthPage} />
    </Switch>
  );
}

function AuthWrapper() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [location, navigate] = useLocation();
  
  // Fetch user's dashboard theme for page background color
  const { data: userTheme } = useQuery<DashboardTheme | null>({
    queryKey: ["/api/dashboard-themes/user"],
    enabled: isAuthenticated && !!user?.companyId,
  });

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

  // DEBUG: Show what we're receiving from backend
  const DEBUG_MODE = false;
  const debugInfo = {
    isAuthenticated,
    hasUser: !!user,
    userId: user?.id,
    email: user?.email,
    companyId: user?.companyId,
    hasCompanyId: !!user?.companyId,
  };

  // Show login/signup/landing pages if not authenticated
  if (!isAuthenticated) {
    return <UnauthenticatedRoutes />;
  }

  // Show onboarding if user doesn't have a company
  if (user && !user.companyId) {
    return (
      <>
        {DEBUG_MODE && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            background: 'red',
            color: 'white',
            padding: '20px',
            zIndex: 9999,
            fontFamily: 'monospace',
            fontSize: '14px'
          }}>
            <h2 style={{ margin: '0 0 10px 0', fontSize: '18px' }}>🔴 PRODUCTION DEBUG - SHOWING SETUP PAGE</h2>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(debugInfo, null, 2)}</pre>
          </div>
        )}
        <OnboardingPage />
      </>
    );
  }

  // Show main app if authenticated and has company
  const style = {
    "--sidebar-width": "3rem",
    "--sidebar-width-icon": "3rem",
  };
  
  // Get custom page background color from user theme
  const pageBackgroundStyle = userTheme?.pageBackgroundColor 
    ? { backgroundColor: userTheme.pageBackgroundColor }
    : {};

  return (
    <TooltipProvider>
      <ThemeProvider>
        <ProjectProvider>
          <SocketProvider>
            <SidebarProvider style={style as React.CSSProperties}>
            <div 
              className="flex flex-col h-screen w-full bg-[hsl(var(--page-background))] p-2 gap-2"
              style={pageBackgroundStyle}
            >
              {DEBUG_MODE && (
                <div style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  background: 'green',
                  color: 'white',
                  padding: '10px 20px',
                  zIndex: 9999,
                  fontFamily: 'monospace',
                  fontSize: '12px'
                }}>
                  <strong>✅ SHOWING DASHBOARD</strong> | User: {debugInfo.email} | CompanyId: {debugInfo.companyId}
                </div>
              )}
              {/* Header in its own floating bar */}
              <Header />
              
              {/* Sidebar and main content below header */}
              <div className="flex flex-1 overflow-hidden gap-2">
                <SidebarNav />
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
