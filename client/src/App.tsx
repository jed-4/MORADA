import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { DashboardTheme } from "@shared/schema";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";
import { ProjectProvider } from "@/contexts/ProjectContext";
import Header from "@/components/Header";
import { SidebarNav } from "@/components/SidebarNav";
import { useState, useEffect, lazy, Suspense } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation, Redirect } from "wouter";
import { SocketProvider, TaskEventsListener } from "@/lib/socket";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { GlobalMessageNotifier } from "@/components/global-message-notifier";
import { PlanGate } from "@/components/billing/PlanGate";
import * as Sentry from "@sentry/react";
import { Crisp } from "crisp-sdk-web";

// All page imports are lazy-loaded so each route gets its own bundle chunk.
// This eliminates the entire class of "Cannot access '…' before initialization"
// TDZ crashes that occur when Vite's production bundler resolves circular
// module initialization order across a single giant static-import chunk.
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Tasks = lazy(() => import("@/pages/Tasks"));
const Notes = lazy(() => import("@/pages/Notes"));
const Docs = lazy(() => import("@/pages/Docs"));
const Minutes = lazy(() => import("@/pages/Minutes"));
const MinuteDetail = lazy(() => import("@/pages/MinuteDetail"));
const Templates = lazy(() => import("@/pages/Templates"));
const Settings = lazy(() => import("@/pages/Settings"));
const ProjectSettings = lazy(() => import("@/pages/ProjectSettings"));
const SystemConfiguration = lazy(() => import("@/pages/SystemConfiguration"));
const RolesPermissions = lazy(() => import("@/pages/RolesPermissions"));
const Business = lazy(() => import("@/pages/Business"));
const ComingSoonPage = lazy(() => import("@/pages/ComingSoonPage"));
const Estimates = lazy(() => import("@/pages/Estimates"));
const ProjectEstimates = lazy(() => import("@/pages/ProjectEstimates"));
const ProjectCostings = lazy(() => import("@/pages/ProjectCostings"));
const EstimateDetail = lazy(() => import("@/pages/EstimateDetail"));
const Selections = lazy(() => import("@/pages/Selections"));
const SelectionDetail = lazy(() => import("@/pages/SelectionDetail"));
const Suppliers = lazy(() => import("@/pages/Suppliers"));
const Trades = lazy(() => import("@/pages/Trades"));
const Bills = lazy(() => import("@/pages/Bills"));
const BillDetail = lazy(() => import("@/pages/BillDetail"));
const Variations = lazy(() => import("@/pages/Variations"));
const VariationDetail = lazy(() => import("@/pages/VariationDetail"));
const ClientInvoices = lazy(() => import("@/pages/ClientInvoices"));
const ClientInvoiceDetail = lazy(() => import("@/pages/ClientInvoiceDetail"));
const SiteDiaryTemplates = lazy(() => import("@/pages/SiteDiaryTemplates"));
const SiteDiaryEntries = lazy(() => import("@/pages/SiteDiaryEntries"));
const ScopeTemplates = lazy(() => import("@/pages/ScopeTemplates"));
const ScopeTemplateDetail = lazy(() => import("@/pages/ScopeTemplateDetail"));
const ScheduleTemplates = lazy(() => import("@/pages/ScheduleTemplates"));
const ScheduleTemplateDetail = lazy(() => import("@/pages/ScheduleTemplateDetail"));
const EstimateTemplates = lazy(() => import("@/pages/EstimateTemplates"));
const EstimateTemplateDetail = lazy(() => import("@/pages/EstimateTemplateDetail"));
const SelectionTemplates = lazy(() => import("@/pages/SelectionTemplates"));
const SelectionTemplateDetail = lazy(() => import("@/pages/SelectionTemplateDetail"));
const SelectionTemplateItemDetail = lazy(() => import("@/pages/SelectionTemplateItemDetail"));
const POTemplates = lazy(() => import("@/pages/POTemplates"));
const POTemplateDetail = lazy(() => import("@/pages/POTemplateDetail"));
const RfqTemplates = lazy(() => import("@/pages/RfqTemplates"));
const RfqTemplateDetail = lazy(() => import("@/pages/RfqTemplateDetail"));
const RfiTemplates = lazy(() => import("@/pages/RfiTemplates"));
const RfiTemplateDetail = lazy(() => import("@/pages/RfiTemplateDetail"));
const ChecklistTemplates = lazy(() => import("@/pages/ChecklistTemplates"));
const NoteTemplates = lazy(() => import("@/pages/NoteTemplates"));
const TaskTemplates = lazy(() => import("@/pages/TaskTemplates"));
const ChecklistTemplateDetail = lazy(() => import("@/pages/ChecklistTemplateDetail"));
const CostCodes = lazy(() => import("@/pages/CostCodes"));
const Contacts = lazy(() => import("@/pages/Contacts"));
const Budget = lazy(() => import("@/pages/Budget"));
const ArchivedProjects = lazy(() => import("@/pages/ArchivedProjects"));
const Schedule = lazy(() => import("@/pages/Schedule"));
const Timesheets = lazy(() => import("@/pages/Timesheets"));
const Allowances = lazy(() => import("@/pages/Allowances"));
const AllowanceDetail = lazy(() => import("@/pages/AllowanceDetail"));
const Defects = lazy(() => import("@/pages/Defects"));
const Proposals = lazy(() => import("@/pages/Proposals"));
const ProposalDetail = lazy(() => import("@/pages/ProposalDetail"));
const BusinessProjects = lazy(() => import("@/pages/BusinessProjects"));
const Takeoff = lazy(() => import("@/pages/Takeoff"));
const FieldSettings = lazy(() => import("@/pages/FieldSettings"));
const TaskSettings = lazy(() => import("@/pages/TaskSettings"));
const BusinessCalendar = lazy(() => import("@/pages/BusinessCalendar"));
const PersonalCalendar = lazy(() => import("@/pages/PersonalCalendar"));
const UserProfile = lazy(() => import("@/pages/UserProfile"));
const BusinessTasks = lazy(() => import("@/pages/BusinessTasks"));
const Systems = lazy(() => import("@/pages/Systems"));
const PriceListPage = lazy(() => import("@/pages/PriceListPage"));
const AIPriceReviewPage = lazy(() => import("@/pages/AIPriceReviewPage"));
const CreateRFQ = lazy(() => import("@/pages/CreateRFQ"));
const CreateRFI = lazy(() => import("@/pages/CreateRFI"));
const TeamManagement = lazy(() => import("@/pages/TeamManagement"));
const UserProfileView = lazy(() => import("@/pages/UserProfileView"));
const UserWorkspace = lazy(() => import("@/pages/UserWorkspace"));
const NotFound = lazy(() => import("@/pages/not-found"));
const SuggestionsReview = lazy(() => import("@/pages/SuggestionsReview"));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("@/pages/TermsOfService"));
const LandingPage = lazy(() => import("@/pages/landing"));
const OnboardingPage = lazy(() => import("@/pages/onboarding"));
const AcceptInvitation = lazy(() => import("@/pages/AcceptInvitation"));
const AuthPage = lazy(() => import("@/pages/AuthPage"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const Messages = lazy(() => import("@/pages/Messages"));
const RFQs = lazy(() => import("@/pages/RFQs"));
const RFQDetail = lazy(() => import("@/pages/RFQDetail"));
const RFQPortal = lazy(() => import("@/pages/RFQPortal"));
const VariationPortal = lazy(() => import("@/pages/VariationPortal"));
const ProposalPortal = lazy(() => import("@/pages/ProposalPortal"));
const SelectionPortal = lazy(() => import("@/pages/SelectionPortal"));
const TradesPortal = lazy(() => import("@/pages/TradesPortal"));
const ProductLibrary = lazy(() => import("@/pages/ProductLibrary"));
const RFIs = lazy(() => import("@/pages/RFIs"));
const RFIDetail = lazy(() => import("@/pages/RFIDetail"));
const ProjectScope = lazy(() => import("@/pages/ProjectScope"));
const ProjectTeam = lazy(() => import("@/pages/ProjectTeam"));
const PurchaseOrders = lazy(() => import("@/pages/PurchaseOrders"));
const PurchaseOrderDetail = lazy(() => import("@/pages/PurchaseOrderDetail"));
const ProjectChecklists = lazy(() => import("@/pages/ProjectChecklists"));
const ChecklistInstanceDetail = lazy(() => import("@/pages/ChecklistInstanceDetail"));
const ProjectFiles = lazy(() => import("@/pages/ProjectFiles"));
const ProjectActivity = lazy(() => import("@/pages/ProjectActivity"));
const LabourEstimate = lazy(() => import("@/pages/LabourEstimate"));
const BillingResult = lazy(() => import("@/pages/BillingResult"));

function Router() {
  const { user } = useAuth();
  
  return (
    <Switch>
      {/* Public routes */}
      <Route path="/auth" component={AuthPage} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/privacy" component={PrivacyPolicy} />
      <Route path="/terms" component={TermsOfService} />
      <Route path="/portal/rfq/:token" component={RFQPortal} />
      <Route path="/portal/variation/:token" component={VariationPortal} />
      <Route path="/portal/proposal/:id" component={ProposalPortal} />
      <Route path="/portal/selections/:token" component={SelectionPortal} />
      <Route path="/portal/project/:token/trades" component={TradesPortal} />
      
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
      <Route path="/messages" component={Messages} />
      <Route path="/notes" component={Notes} />
      <Route path="/docs" component={Docs} />
      <Route path="/minutes" component={Minutes} />
      <Route path="/minutes/:id" component={MinuteDetail} />
      <Route path="/project-settings" component={ProjectSettings} />
      <Route path="/billing/success" component={BillingResult} />
      <Route path="/billing/cancelled" component={BillingResult} />
      
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
      <Route path="/business/schedule" component={Business} />
      <Route path="/business/files" component={Business} />
      <Route path="/business/overheads" component={Business} />
      <Route path="/business/timesheets" component={Business} />
      <Route path="/business/minutes" component={Business} />
      <Route path="/business/minutes/:id" component={MinuteDetail} />
      <Route path="/business/messages" component={Business} />
      <Route path="/business/notes" component={Business} />
      <Route path="/business/leave" component={Business} />
      <Route path="/business/metrics" component={Business} />
      <Route path="/my-calendar" component={PersonalCalendar} />
      <Route path="/systems" component={Systems} />
      <Route path="/business-team" component={Business} />
      <Route path="/business-team/:userId" component={UserProfileView} />
      
      {/* Project-specific routes */}
      {/* Detail routes (must come before tab routes) */}
      <Route path="/projects/:projectId/minutes/:id" component={MinuteDetail} />
      <Route path="/projects/:projectId/estimates/new" component={EstimateDetail} />
      <Route path="/projects/:projectId/estimates/:estimateId" component={EstimateDetail} />
      <Route path="/projects/:projectId/labour-estimate" component={LabourEstimate} />
      <Route path="/projects/:projectId/costings" component={ProjectCostings} />
      <Route path="/projects/:projectId/selections/:id" component={SelectionDetail} />
      <Route path="/projects/:projectId/rfqs/new" component={CreateRFQ} />
      <Route path="/projects/:projectId/rfqs/:id" component={RFQDetail} />
      <Route path="/projects/:projectId/rfis/new" component={CreateRFI} />
      <Route path="/projects/:projectId/rfis/:id" component={RFIDetail} />
      <Route path="/projects/:projectId/proposals/new" component={ProposalDetail} />
      <Route path="/projects/:projectId/proposals/:id" component={ProposalDetail} />
      <Route path="/projects/:projectId/allowances/:allowanceId" component={AllowanceDetail} />
      <Route path="/projects/:projectId/purchase-orders/new" component={PurchaseOrderDetail} />
      <Route path="/projects/:projectId/purchase-orders/:poId" component={PurchaseOrderDetail} />
      <Route path="/projects/:projectId/variations/new" component={VariationDetail} />
      <Route path="/projects/:projectId/variations/:variationId" component={VariationDetail} />
      <Route path="/projects/:projectId/bills/:id" component={BillDetail} />
      <Route path="/projects/:projectId/client-invoices/new" component={ClientInvoiceDetail} />
      <Route path="/projects/:projectId/client-invoices/:invoiceId" component={ClientInvoiceDetail} />
      <Route path="/projects/:projectId/checklists/:checklistId" component={ChecklistInstanceDetail} />
      
      {/* Tab routes - all render inline within Dashboard/CustomizableProjectOverview */}
      <Route path="/projects/:projectId" component={Dashboard} />
      <Route path="/projects/:projectId/scope" component={Dashboard} />
      <Route path="/projects/:projectId/notes" component={Dashboard} />
      <Route path="/projects/:projectId/messages" component={Dashboard} />
      <Route path="/projects/:projectId/minutes" component={Dashboard} />
      <Route path="/projects/:projectId/tasks" component={Dashboard} />
      <Route path="/projects/:projectId/calendar" component={Dashboard} />
      <Route path="/projects/:projectId/estimates" component={Dashboard} />
      <Route path="/projects/:projectId/selections" component={Dashboard} />
      <Route path="/projects/:projectId/schedule" component={Dashboard} />
      <Route path="/projects/:projectId/takeoff" component={Dashboard} />
      <Route path="/projects/:projectId/rfqs" component={Dashboard} />
      <Route path="/projects/:projectId/rfis" component={Dashboard} />
      <Route path="/projects/:projectId/proposals" component={Dashboard} />
      <Route path="/projects/:projectId/allowances" component={Dashboard} />
      <Route path="/projects/:projectId/defects" component={Dashboard} />
      <Route path="/projects/:projectId/purchase-orders" component={Dashboard} />
      <Route path="/projects/:projectId/variations" component={Dashboard} />
      <Route path="/projects/:projectId/bills" component={Dashboard} />
      <Route path="/projects/:projectId/client-invoices" component={Dashboard} />
      <Route path="/projects/:projectId/invoices" component={Dashboard} />
      <Route path="/projects/:projectId/site-diary" component={Dashboard} />
      <Route path="/projects/:projectId/timesheets" component={Dashboard} />
      <Route path="/projects/:projectId/budget" component={Dashboard} />
      <Route path="/projects/:projectId/files" component={Dashboard} />
      <Route path="/projects/:projectId/team" component={Dashboard} />
      <Route path="/projects/:projectId/activity" component={Dashboard} />
      <Route path="/projects/:projectId/checklists" component={Dashboard} />
      
      {/* Global Project sections - Coming Soon */}
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
      <Route path="/schedule">{() => <ComingSoonPage section="schedule" />}</Route>
      <Route path="/selections" component={Selections} />
      <Route path="/selections/:id" component={SelectionDetail} />
      <Route path="/allowances">{() => <ComingSoonPage section="allowances" />}</Route>
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
      <Route path="/invoices">{() => <ComingSoonPage section="invoices" />}</Route>
      <Route path="/site-diary" component={SiteDiaryEntries} />
      <Route path="/timesheets" component={Timesheets} />
      <Route path="/budget">{() => <ComingSoonPage section="budget" />}</Route>
      <Route path="/files">{() => <ComingSoonPage section="files" />}</Route>
      <Route path="/team">{() => <ComingSoonPage section="team" />}</Route>

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
      <Route path="/product-library" component={ProductLibrary} />
      <Route path="/cost-codes" component={CostCodes} />
      <Route path="/contacts" component={Contacts} />
      <Route path="/archived-projects" component={ArchivedProjects} />
      {user?.isPlatformStaff && (
        <Route path="/suggestions-review" component={SuggestionsReview} />
      )}
      <Route path="/checklists">{() => <ComingSoonPage section="checklists" />}</Route>
      <Route path="/emails">{() => <ComingSoonPage section="emails" />}</Route>
      <Route path="/crm">{() => <ComingSoonPage section="crm" />}</Route>
      <Route path="/business-team">{() => <ComingSoonPage section="business-team" />}</Route>

      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function UnauthenticatedRoutes() {
  // Handle public routes for unauthenticated users
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
      <Switch>
        <Route path="/auth" component={AuthPage} />
        <Route path="/privacy" component={PrivacyPolicy} />
        <Route path="/terms" component={TermsOfService} />
        <Route path="/accept-invite/:token" component={AcceptInvitation} />
        <Route path="/portal/rfq/:token" component={RFQPortal} />
        <Route path="/portal/variation/:token" component={VariationPortal} />
        <Route path="/portal/proposal/:id" component={ProposalPortal} />
        <Route path="/portal/selections/:token" component={SelectionPortal} />
        <Route path="/portal/project/:token/trades" component={TradesPortal} />
        <Route path="/" component={AuthPage} />
        <Route component={AuthPage} />
      </Switch>
    </Suspense>
  );
}

function AuthWrapper() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [location, navigate] = useLocation();
  const { resolvedTheme } = useTheme();
  
  // Fetch user's dashboard theme for page background color
  const { data: userTheme } = useQuery<DashboardTheme | null>({
    queryKey: ["/api/dashboard-themes/user"],
    enabled: isAuthenticated && !!user?.companyId,
  });

  // Stamp Sentry error reports with the signed-in user + company so we can see
  // which customer hit an error. No-op when Sentry isn't configured.
  useEffect(() => {
    if (!import.meta.env.VITE_SENTRY_DSN) return;
    if (user) {
      Sentry.setUser({ id: user.id, email: user.email ?? undefined });
      Sentry.setTag("company_id", user.companyId ?? undefined);
      Sentry.setTag("company", user.companyNickname ?? undefined);
    } else {
      Sentry.setUser(null);
      Sentry.setTag("company_id", undefined);
      Sentry.setTag("company", undefined);
    }
  }, [user]);

  // Crisp support chat: identify the signed-in user with account metadata only.
  // Never pass financial figures, client names, or bill amounts here. No-op when
  // VITE_CRISP_WEBSITE_ID is unset.
  useEffect(() => {
    if (!import.meta.env.VITE_CRISP_WEBSITE_ID) return;
    if (!user) {
      // Signed out (logout or expired session): clear the Crisp identity so the
      // next visitor on this browser starts a fresh, anonymous chat session.
      Crisp.session.reset();
      return;
    }
    if (user.email) Crisp.user.setEmail(user.email);
    const nickname = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "";
    if (nickname) Crisp.user.setNickname(nickname);
    Crisp.session.setData({
      user_id: String(user.id),
      company_id: String(user.companyId ?? ""),
      company_name: user.companyNickname ?? "",
      plan_status: user.planStatus ?? "unknown",
      role: user.roleName ?? "",
    });
  }, [user]);

  // Crisp support chat: keep the floating bubble hidden at all times. It is only
  // shown on demand via "Chat with Support" in the user menu, and re-hides itself
  // when the user closes the chat window (see main.tsx onChatClosed). No-op when
  // VITE_CRISP_WEBSITE_ID is unset.
  useEffect(() => {
    if (!import.meta.env.VITE_CRISP_WEBSITE_ID) return;
    Crisp.chat.hide();
  }, [location, user]);

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="loading-enhanced text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" data-testid="loading-spinner"></div>
          <p className="text-muted-foreground" data-testid="text-loading">Loading Morada...</p>
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
        <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
          <OnboardingPage />
        </Suspense>
      </>
    );
  }

  // Show main app if authenticated and has company
  const style = {
    "--sidebar-width": "3rem",
    "--sidebar-width-icon": "3rem",
  };
  
  // Determine page type from current route for background color
  const getPageType = (path: string): "dashboard" | "workspace" | "project" => {
    // Project pages (individual project dashboards)
    if (path.startsWith("/projects/")) return "project";
    // User workspace pages (personal workspace/overview)
    if (path.startsWith("/users/")) return "workspace";
    // Root redirects to workspace by default
    if (path === "/" || path === "") return "workspace";
    // All other pages are business dashboard context
    return "dashboard";
  };
  
  const pageType = getPageType(location);
  
  // Get custom page background color from user theme palette
  const getPageBackgroundColor = (): string | undefined => {
    // Dark mode is locked to the CSS token — never apply a custom inline colour.
    // resolvedTheme is sourced from ThemeProvider so this re-runs on every toggle.
    if (resolvedTheme === 'dark') return undefined;
    // Try palette first (new per-page colors)
    const palette = (userTheme as any)?.pageBackgroundPalette as Record<string, string> | null;
    if (palette && typeof palette === 'object') {
      // Palette exists — use it directly. An empty string means "reset to default"
      // and must NOT fall through to the legacy field (that's the whole point of clearing).
      return palette[pageType] || undefined;
    }
    // No palette yet — fallback to legacy single color
    return userTheme?.pageBackgroundColor || undefined;
  };
  
  const bgColor = getPageBackgroundColor();
  const pageBackgroundStyle = bgColor ? { backgroundColor: bgColor } : {};

  return (
    <TooltipProvider>
      <ProjectProvider>
        <SocketProvider>
          <TaskEventsListener />
          <GlobalMessageNotifier />
          <PlanGate />
          <SidebarProvider style={style as React.CSSProperties}>
          <div 
            className="flex flex-col h-screen w-full bg-[hsl(var(--page-background))] px-2 pb-2 gap-0"
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
              <main className="flex-1 overflow-hidden flex flex-col">
                <ErrorBoundary context={`route:${location}`} resetKeys={[location]}>
                  <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
                    <Router />
                  </Suspense>
                </ErrorBoundary>
              </main>
            </div>
          </div>
        </SidebarProvider>
        </SocketProvider>
      </ProjectProvider>
    </TooltipProvider>
  );
}

function BfcacheRefresher() {
  // When Chrome / Safari restore the page from bfcache, the React tree is
  // re-attached but React Query data is stale and websocket subscriptions may
  // not have re-fired. Invalidate everything so the UI matches the URL the
  // user actually navigated to.
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        queryClient.invalidateQueries();
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BfcacheRefresher />
        <AuthWrapper />
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
