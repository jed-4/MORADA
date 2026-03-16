import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Calendar, DollarSign, Users } from "lucide-react";
import KPICard from "./KPICard";

export default function ProjectOverview() {
  return (
    <div className="p-6 space-y-6" data-testid="project-overview">
      {/* Project Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Sunshine Coast Villa</h1>
            <p className="text-muted-foreground">
              123 Ocean View Drive, Sunshine Coast QLD 4567
            </p>
          </div>
          <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
            In Progress
          </Badge>
        </div>

        {/* Project Progress */}
        <Card>
          <CardHeader>
            <CardTitle>Project Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Overall Completion</span>
                <span>42%</span>
              </div>
              <Progress value={42} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Started: Jan 15, 2024</span>
                <span>Est. Completion: Aug 15, 2024</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Budget"
          value="$750,000"
          icon={<DollarSign className="h-4 w-4" />}
        />
        <KPICard
          title="Spent to Date"
          value="$315,000"
          change={{ value: "+12%", direction: "up" }}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <KPICard
          title="Days Elapsed"
          value="58"
          icon={<Calendar className="h-4 w-4" />}
        />
        <KPICard
          title="Team Members"
          value="12"
          icon={<Users className="h-4 w-4" />}
        />
      </div>

      {/* Recent Activity and Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Tasks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1">
            <CardTitle>Upcoming Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">No upcoming tasks.</p>
          </CardContent>
        </Card>

        {/* Project Timeline */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                {
                  time: "2 hours ago",
                  action: "Foundation inspection completed",
                  user: "Mike Johnson",
                  status: "success",
                },
                {
                  time: "1 day ago",
                  action: "Electrical quote approved",
                  user: "Sarah Williams",
                  status: "info",
                },
                {
                  time: "3 days ago",
                  action: "Plumbing rough-in started",
                  user: "Tom Brown",
                  status: "warning",
                },
              ].map((activity, index) => (
                <div key={index} className="flex items-start gap-3 text-sm">
                  <div className={`w-2 h-2 rounded-full mt-2 ${
                    activity.status === "success" ? "bg-green-500" :
                    activity.status === "info" ? "bg-blue-500" : "bg-yellow-500"
                  }`} />
                  <div className="flex-1">
                    <p>{activity.action}</p>
                    <p className="text-muted-foreground">
                      {activity.user} • {activity.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}