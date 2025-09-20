import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ThemeProvider } from "@/contexts/ThemeContext";
import Header from "@/components/Header";
import { AppSidebar } from "@/components/AppSidebar";
import Dashboard from "@/pages/Dashboard";
import Tasks from "@/pages/Tasks";
import Calendar from "@/pages/Calendar";
import BusinessOverviewPage from "@/pages/BusinessOverview";
import ComingSoonPage from "@/pages/ComingSoonPage";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/tasks" component={Tasks} />
      <Route path="/calendar" component={Calendar} />
      
      {/* Business Project */}
      <Route path="/business" component={BusinessOverviewPage} />
      <Route path="/business/expenses" component={() => <ComingSoonPage section="business-expenses" />} />
      <Route path="/business/timesheets" component={() => <ComingSoonPage section="business-timesheets" />} />
      <Route path="/business/messages" component={() => <ComingSoonPage section="business-messages" />} />
      <Route path="/business/leave" component={() => <ComingSoonPage section="business-leave" />} />
      
      {/* Project sections - Coming Soon */}
      <Route path="/messages" component={() => <ComingSoonPage section="messages" />} />
      <Route path="/notes" component={() => <ComingSoonPage section="notes" />} />
      <Route path="/takeoff" component={() => <ComingSoonPage section="takeoff" />} />
      <Route path="/estimates" component={() => <ComingSoonPage section="estimates" />} />
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
      <Route path="/templates" component={() => <ComingSoonPage section="templates" />} />
      <Route path="/settings" component={() => <ComingSoonPage section="settings" />} />
      <Route path="/checklists" component={() => <ComingSoonPage section="checklists" />} />
      <Route path="/emails" component={() => <ComingSoonPage section="emails" />} />
      <Route path="/crm" component={() => <ComingSoonPage section="crm" />} />
      <Route path="/business-team" component={() => <ComingSoonPage section="business-team" />} />

      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // Custom sidebar width for project management application
  const style = {
    "--sidebar-width": "20rem",       // 320px for better content
    "--sidebar-width-icon": "4rem",   // default icon width
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <SidebarProvider style={style as React.CSSProperties}>
            <div className="flex h-screen w-full">
              <AppSidebar />
              <div className="flex flex-col flex-1">
                <Header />
                <main className="flex-1 overflow-auto">
                  <Router />
                </main>
              </div>
            </div>
          </SidebarProvider>
          <Toaster />
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
