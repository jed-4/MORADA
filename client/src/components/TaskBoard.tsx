import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import TaskCard from "./TaskCard";

// todo: remove mock functionality
const mockColumns = [
  {
    id: "todo",
    title: "To Do",
    tasks: [
      {
        title: "Foundation Inspection",
        description: "Council inspection scheduled for foundation concrete",
        assignee: { name: "Mike Johnson", initials: "MJ" },
        dueDate: "Today",
        priority: "high" as const,
        status: "todo" as const,
        comments: 3,
        tags: ["Inspection", "Critical"],
      },
      {
        title: "Order Materials",
        description: "Order concrete and rebar for foundation",
        assignee: { name: "Sarah Williams", initials: "SW" },
        dueDate: "Mar 12",
        priority: "medium" as const,
        status: "todo" as const,
        comments: 1,
        tags: ["Materials"],
      },
    ],
  },
  {
    id: "in-progress",
    title: "In Progress",
    tasks: [
      {
        title: "Electrical Rough-in",
        description: "Complete electrical rough-in for ground floor",
        assignee: { name: "Tom Brown", initials: "TB" },
        dueDate: "Mar 15",
        priority: "medium" as const,
        status: "in-progress" as const,
        comments: 2,
        tags: ["Electrical"],
      },
    ],
  },
  {
    id: "done",
    title: "Done",
    tasks: [
      {
        title: "Site Preparation",
        description: "Clear and level the building site",
        assignee: { name: "Mike Johnson", initials: "MJ" },
        dueDate: "Mar 1",
        priority: "low" as const,
        status: "done" as const,
        comments: 0,
        tags: ["Site Work"],
      },
    ],
  },
];

export default function TaskBoard() {
  return (
    <div className="p-6" data-testid="task-board">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Tasks</h1>
        <Button data-testid="button-new-task">
          <Plus className="h-4 w-4 mr-2" />
          New Task
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {mockColumns.map((column) => (
          <Card key={column.id} className="h-fit">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{column.title}</CardTitle>
                <Badge variant="secondary">{column.tasks.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {column.tasks.map((task, index) => (
                <TaskCard key={index} {...task} />
              ))}
              <Button
                variant="ghost"
                className="w-full border-2 border-dashed"
                data-testid={`button-add-task-${column.id}`}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Task
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}