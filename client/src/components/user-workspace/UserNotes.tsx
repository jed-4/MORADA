import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import type { User } from "@shared/schema";

interface UserNotesProps {
  user: User;
  isOwnPage: boolean;
}

export default function UserNotes({ user, isOwnPage }: UserNotesProps) {
  return (
    <div className="p-4" data-testid="user-notes">
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">
            Personal notes coming soon - quick capture area for thoughts and ideas
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
