import { MobileHeader } from "@/components/MobileHeader";

export function Dashboard() {
  return (
    <div className="flex flex-col h-full">
      <MobileHeader title="Dashboard" />
      
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="bg-card rounded-xl p-6 border">
          <h2 className="text-xl font-bold mb-2">Quick Stats</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Overview of your active projects and tasks
          </p>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-primary/10 p-4 rounded-lg">
              <div className="text-2xl font-bold text-primary">12</div>
              <div className="text-xs text-muted-foreground mt-1">Active Projects</div>
            </div>
            <div className="bg-primary/10 p-4 rounded-lg">
              <div className="text-2xl font-bold text-primary">47</div>
              <div className="text-xs text-muted-foreground mt-1">Open Tasks</div>
            </div>
            <div className="bg-primary/10 p-4 rounded-lg">
              <div className="text-2xl font-bold text-primary">8</div>
              <div className="text-xs text-muted-foreground mt-1">Pending Bills</div>
            </div>
            <div className="bg-primary/10 p-4 rounded-lg">
              <div className="text-2xl font-bold text-primary">3</div>
              <div className="text-xs text-muted-foreground mt-1">Due Today</div>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl p-6 border">
          <h3 className="font-semibold mb-3">Recent Activity</h3>
          <div className="space-y-3">
            {[
              { title: "Task completed", project: "Villa Renovation", time: "2h ago" },
              { title: "Bill approved", project: "Office Fit-out", time: "5h ago" },
              { title: "New estimate", project: "Beach House", time: "1d ago" },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3 pb-3 border-b last:border-0">
                <div className="w-2 h-2 bg-primary rounded-full mt-2" />
                <div className="flex-1">
                  <div className="font-medium text-sm">{item.title}</div>
                  <div className="text-xs text-muted-foreground">{item.project}</div>
                </div>
                <div className="text-xs text-muted-foreground">{item.time}</div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
