import TaskCard from '../TaskCard';

export default function TaskCardExample() {
  return (
    <div className="p-4 max-w-sm">
      <TaskCard
        title="Foundation Inspection"
        description="Council inspection scheduled for foundation concrete"
        assignee={{ name: "Mike Johnson", initials: "MJ" }}
        dueDate="Today"
        priority="high"
        status="todo"
        comments={3}
        tags={["Inspection", "Critical"]}
      />
    </div>
  );
}