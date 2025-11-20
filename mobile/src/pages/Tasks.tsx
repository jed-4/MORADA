import { MobileHeader } from "@/components/MobileHeader";
import { Plus, Search } from "lucide-react";

export function Tasks() {
  const tasks = [
    { id: 1, title: "Install kitchen cabinets", project: "Villa Renovation", status: "In Progress", priority: "High" },
    { id: 2, title: "Plumbing inspection", project: "Office Fit-out", status: "To Do", priority: "Medium" },
    { id: 3, title: "Final cleanup", project: "Beach House", status: "In Progress", priority: "Low" },
    { id: 4, title: "Paint exterior walls", project: "Villa Renovation", status: "To Do", priority: "High" },
    { id: 5, title: "Electrical rough-in", project: "Office Fit-out", status: "Done", priority: "Medium" },
  ];

  return (
    <div className="flex flex-col h-full">
      <MobileHeader 
        title="Tasks"
        action={
          <button
            className="p-2 hover-elevate active-elevate-2 rounded-md"
            data-testid="button-add-task"
          >
            <Plus className="w-5 h-5" />
          </button>
        }
      />
      
      {/* Search and Filter Bar */}
      <div className="bg-card border-b px-4 py-3 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search tasks..."
            className="w-full h-9 pl-9 pr-3 rounded-md border bg-background text-sm"
            data-testid="input-search-tasks"
          />
        </div>
        
        <div className="flex gap-2 overflow-x-auto">
          {["All", "To Do", "In Progress", "Done"].map((filter) => (
            <button
              key={filter}
              className={`px-3 h-7 rounded-md text-xs font-medium whitespace-nowrap ${
                filter === "All"
                  ? "bg-[#bba7db] text-white"
                  : "border hover-elevate"
              }`}
              data-testid={`filter-${filter.toLowerCase().replace(" ", "-")}`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-3">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="bg-card rounded-xl p-4 border hover-elevate active-elevate-2"
              data-testid={`task-card-${task.id}`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="font-semibold text-sm flex-1">{task.title}</h3>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  task.priority === "High" ? "bg-destructive/10 text-destructive" :
                  task.priority === "Medium" ? "bg-primary/10 text-primary" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {task.priority}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mb-2">{task.project}</div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                  task.status === "Done" ? "bg-green-500/10 text-green-600" :
                  task.status === "In Progress" ? "bg-primary/10 text-primary" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {task.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
