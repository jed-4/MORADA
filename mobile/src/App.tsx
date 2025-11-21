import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch, Router } from "wouter";
import { queryClient } from "@lib/queryClient";
import { ProjectProvider } from "@/contexts/ProjectContext";
import { BottomNav } from "@/components/BottomNav";
import { Dashboard } from "@/pages/Dashboard";
import { Tasks } from "@/pages/Tasks";
import { Timesheets } from "@/pages/Timesheets";
import { Messages } from "@/pages/Messages";
import { Projects } from "@/pages/Projects";
import { ProjectHome } from "@/pages/ProjectHome";
import { ProjectTasks } from "@/pages/ProjectTasks";
import { ComingSoon } from "@/pages/ComingSoon";
import { BillScanner } from "@/pages/BillScanner";

function MobileApp() {
  return (
    <ProjectProvider>
      <Router base="/mobile">
        <div className="flex flex-col h-screen bg-background">
          {/* Content Area with Routes */}
          <main className="flex-1 overflow-hidden">
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/projects" component={Projects} />
              <Route path="/projects/:id" component={ProjectHome} />
              <Route path="/projects/:id/tasks" component={ProjectTasks} />
              <Route path="/projects/:id/scope">
                {() => <ComingSoon title="Scope" description="View and manage project scope" />}
              </Route>
              <Route path="/projects/:id/messages">
                {() => <ComingSoon title="Project Messages" description="Project-specific messages" />}
              </Route>
              <Route path="/projects/:id/schedule">
                {() => <ComingSoon title="Schedule" description="Project schedule and timeline" />}
              </Route>
              <Route path="/projects/:id/estimates">
                {() => <ComingSoon title="Estimates" description="Project estimates" />}
              </Route>
              <Route path="/projects/:id/rfq">
                {() => <ComingSoon title="RFQ" description="Request for quotes" />}
              </Route>
              <Route path="/projects/:id/bills">
                {() => <ComingSoon title="Bills" description="Project bills and invoices" />}
              </Route>
              <Route path="/projects/:id/allowances">
                {() => <ComingSoon title="Allowances" description="Project allowances" />}
              </Route>
              <Route path="/projects/:id/notes">
                {() => <ComingSoon title="Notes" description="Project notes" />}
              </Route>
              <Route path="/projects/:id/minutes">
                {() => <ComingSoon title="Minutes" description="Meeting minutes" />}
              </Route>
              <Route path="/projects/:id/takeoff">
                {() => <ComingSoon title="Take off" description="Quantity take off" />}
              </Route>
              <Route path="/projects/:id/files">
                {() => <ComingSoon title="Files" description="Project files and documents" />}
              </Route>
              <Route path="/projects/:id/team">
                {() => <ComingSoon title="Team" description="Project team members" />}
              </Route>
              <Route path="/tasks" component={Tasks} />
              <Route path="/timesheets" component={Timesheets} />
              <Route path="/messages" component={Messages} />
              <Route path="/profile">
                {() => <ComingSoon title="Profile" description="Manage your profile settings and preferences" />}
              </Route>
              <Route path="/team">
                {() => <ComingSoon title="Team" description="View and manage your team members" />}
              </Route>
              <Route path="/settings">
                {() => <ComingSoon title="Settings" description="Configure your app settings" />}
              </Route>
              <Route path="/help">
                {() => <ComingSoon title="Help & Support" description="Get help and support for BuildPro" />}
              </Route>
              <Route path="/scan-bill" component={BillScanner} />
            </Switch>
          </main>

          {/* Bottom Navigation */}
          <BottomNav />
        </div>
      </Router>
    </ProjectProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MobileApp />
    </QueryClientProvider>
  );
}
