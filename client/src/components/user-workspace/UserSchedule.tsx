import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import type { User } from "@shared/schema";

interface UserScheduleProps {
  user: User;
  isOwnPage: boolean;
}

export default function UserSchedule({ user, isOwnPage }: UserScheduleProps) {
  return (
    <div className="p-4" data-testid="user-schedule">
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">
            Schedule view coming soon - will show calendar events, tasks with due dates, and Google Calendar integration
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
