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
import BusinessOverviewPage from "@/pages/BusinessOverview";
import ComingSoonPage from "@/pages/ComingSoonPage";
import Estimates from "@/pages/Estimates";
import EstimateDetail from "@/pages/EstimateDetail";
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
      
      {/* Project sections - Coming Soon */}
      <Route path="/messages" component={() => <ComingSoonPage section="messages" />} />
      <Route path="/takeoff" component={() => <ComingSoonPage section="takeoff" />} />
      <Route path="/estimates" component={Estimates} />
      <Route path="/estimates/:id" component={EstimateDetail} />
      <Route path="/rfq" component={() => <ComingSoonPage section="rfq" />} />
      <Route path="/rfi" component={() => <ComingSoonPage section="rfi" />} />
      <Route path="/proposal" component={() => <ComingSoonPage section="proposal" />} />
      <Route path="/schedule" component={() => <ComingSoonPage section="schedule" />} />
      <Route path="/selections" component={() => <ComingSoonPage section="selections" />} />
      <Route path="/allowances" component={() => <ComingSoonPage section="allowances" />} />
      <Route path="/purchase-orders" component={() => <ComingSoonPage section="purchase-orders" />} />
      <Route path="/variations" component={() => <ComingSoonPage section="variations" />} />
      <Route path="/bills" component={() => <ComingSoonPage section="bills" />} />
      <Route path="/invoices" component={() => <ComingSoonPage section="invoices" />} />
      <Route path="/site-diary" component={() => <ComingSoonPage section="site-diary" />} />
      <Route path="/timesheets" component={() => <ComingSoonPage section="timesheets" />} />
      <Route path="/budget" component={() => <ComingSoonPage section="budget" />} />
      <Route path="/files" component={() => <ComingSoonPage section="files" />} />
      <Route path="/team" component={() => <ComingSoonPage section="team" />} />

      {/* Business sections - Coming Soon */}
      <Route path="/templates" component={Templates} />
      <Route path="/settings" component={Settings} />
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
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('sidebar-width');
    return saved || "20rem";
  });

  useEffect(() => {
    localStorage.setItem('sidebar-width', sidebarWidth);
  }, [sidebarWidth]);

  const style = {
    "--sidebar-width": sidebarWidth,
    "--sidebar-width-icon": "4rem",
  };

  return (
    <TooltipProvider>
      <ThemeProvider>
        <ProjectProvider>
          <SidebarProvider style={style as React.CSSProperties}>
          <div className="flex h-screen w-full">
            <ResizableSidebar 
              onWidthChange={setSidebarWidth}
              initialWidth={sidebarWidth}
            />
            <div className="flex flex-col flex-1">
              <Header />
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
