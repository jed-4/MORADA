import { MobileHeader } from "@/components/MobileHeader";
import { Plus, Calendar } from "lucide-react";

export function Timesheets() {
  const timesheets = [
    { id: 1, date: "Nov 18-24, 2024", hours: 42.5, status: "Submitted", project: "Villa Renovation" },
    { id: 2, date: "Nov 11-17, 2024", hours: 38.0, status: "Approved", project: "Office Fit-out" },
    { id: 3, date: "Nov 4-10, 2024", hours: 40.0, status: "Approved", project: "Beach House" },
    { id: 4, date: "Oct 28-Nov 3, 2024", hours: 35.5, status: "Draft", project: "Villa Renovation" },
  ];

  return (
    <div className="flex flex-col h-full">
      <MobileHeader 
        title="Timesheets"
        action={
          <button
            className="p-2 hover-elevate active-elevate-2 rounded-md"
            data-testid="button-add-timesheet"
          >
            <Plus className="w-5 h-5" />
          </button>
        }
      />
      
      <main className="flex-1 overflow-y-auto">
        {/* Current Week Quick Entry */}
        <div className="p-4 bg-card border-b">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm text-muted-foreground">Current Week</div>
              <div className="text-xl font-bold">32.5 hours</div>
            </div>
            <button
              className="px-4 h-9 bg-primary text-primary-foreground rounded-md font-medium hover-elevate active-elevate-2"
              data-testid="button-log-time"
            >
              Log Time
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="w-4 h-4" />
            <span>Nov 18 - Nov 24, 2024</span>
          </div>
        </div>

        {/* Timesheet History */}
        <div className="p-4 space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Recent Timesheets</h3>
          {timesheets.map((timesheet) => (
            <div
              key={timesheet.id}
              className="bg-card rounded-xl p-4 border hover-elevate active-elevate-2"
              data-testid={`timesheet-card-${timesheet.id}`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1">
                  <h3 className="font-semibold text-sm mb-1">{timesheet.date}</h3>
                  <div className="text-xs text-muted-foreground">{timesheet.project}</div>
                </div>
                <span className={`px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap ${
                  timesheet.status === "Approved" ? "bg-green-500/10 text-green-600" :
                  timesheet.status === "Submitted" ? "bg-primary/10 text-primary" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {timesheet.status}
                </span>
              </div>
              <div className="text-2xl font-bold text-primary">{timesheet.hours} hrs</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
