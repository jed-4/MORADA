import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch } from "wouter";
import { queryClient } from "@lib/queryClient";
import { BottomNav } from "@/components/BottomNav";
import { Dashboard } from "@/pages/Dashboard";
import { Tasks } from "@/pages/Tasks";
import { Timesheets } from "@/pages/Timesheets";
import { Messages } from "@/pages/Messages";
import { ComingSoon } from "@/pages/ComingSoon";
import { BillScanner } from "@/pages/BillScanner";

function MobileApp() {
  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Content Area with Routes */}
      <main className="flex-1 overflow-hidden">
        <Switch>
          <Route path="/" component={Dashboard} />
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
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MobileApp />
    </QueryClientProvider>
  );
}
