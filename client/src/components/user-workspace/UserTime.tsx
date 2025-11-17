import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import type { User } from "@shared/schema";

interface UserTimeProps {
  user: User;
  isOwnPage: boolean;
}

export default function UserTime({ user, isOwnPage }: UserTimeProps) {
  return (
    <div className="p-4" data-testid="user-time">
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">
            Time tracking coming soon - will show timesheet entries and project breakdown
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
