import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch, Router, Redirect } from "wouter";
import { queryClient } from "@lib/queryClient";
import { ProjectProvider } from "@/contexts/ProjectContext";
import { MobileAuthGuard } from "@/components/MobileAuthGuard";
import { BottomNav } from "@/components/BottomNav";
import { Dashboard } from "@/pages/Dashboard";
import { Tasks } from "@/pages/Tasks";
import { Timesheets } from "@/pages/Timesheets";
import { Messages } from "@/pages/Messages";
import { Projects } from "@/pages/Projects";
import { ProjectView } from "@/pages/ProjectView";
import { ComingSoon } from "@/pages/ComingSoon";
import { BillScanner } from "@/pages/BillScanner";

function MobileApp() {
  return (
    <MobileAuthGuard>
      <ProjectProvider>
        <Router base="/mobile">
          <div className="flex flex-col h-dvh bg-background">
            <main className="flex-1 overflow-auto pb-16">
              <Switch>
                <Route path="/" component={Dashboard} />
                <Route path="/projects" component={Projects} />
                <Route path="/projects/:id/:tab" component={ProjectView} />
                <Route path="/projects/:id">
                  {(params) => <Redirect to={`/projects/${params.id}/overview`} />}
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
            <BottomNav />
          </div>
        </Router>
      </ProjectProvider>
    </MobileAuthGuard>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MobileApp />
    </QueryClientProvider>
  );
}
