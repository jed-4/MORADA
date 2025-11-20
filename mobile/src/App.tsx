import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch } from "wouter";
import { queryClient } from "@lib/queryClient";
import { BottomNav } from "@/components/BottomNav";
import { Dashboard } from "@/pages/Dashboard";
import { Tasks } from "@/pages/Tasks";
import { Projects } from "@/pages/Projects";
import { More } from "@/pages/More";

function MobileApp() {
  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Content Area with Routes */}
      <main className="flex-1 overflow-hidden">
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/tasks" component={Tasks} />
          <Route path="/projects" component={Projects} />
          <Route path="/more" component={More} />
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
