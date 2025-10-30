export default function BusinessTasks() {
  return (
    <div className="flex flex-col h-full" data-testid="business-tasks">
      <div className="flex-1 min-h-0 p-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Business Tasks</h1>
          </div>
          <p className="text-muted-foreground">
            Business tasks are tasks not assigned to any specific project. They can be used for company-wide initiatives, administrative tasks, or tasks that span multiple projects.
          </p>
          <div className="flex items-center justify-center h-64 border rounded-lg bg-muted/20">
            <p className="text-muted-foreground">Business tasks feature coming soon...</p>
          </div>
        </div>
      </div>
    </div>
  );
}
