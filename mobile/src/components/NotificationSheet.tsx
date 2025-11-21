import { BottomSheet } from "@/components/ui/BottomSheet";
import { Bell, CheckCircle, AlertCircle, MessageSquare, Calendar } from "lucide-react";

interface NotificationSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Notification {
  id: string;
  type: "task" | "message" | "schedule" | "alert";
  title: string;
  message: string;
  time: string;
  read: boolean;
}

const mockNotifications: Notification[] = [
  {
    id: "1",
    type: "task",
    title: "Task Assigned",
    message: "You've been assigned to 'Install Kitchen Cabinets'",
    time: "2 hours ago",
    read: false,
  },
  {
    id: "2",
    type: "message",
    title: "New Message",
    message: "John commented on the bathroom renovation scope",
    time: "5 hours ago",
    read: false,
  },
  {
    id: "3",
    type: "schedule",
    title: "Schedule Update",
    message: "Site inspection scheduled for tomorrow at 9 AM",
    time: "1 day ago",
    read: true,
  },
  {
    id: "4",
    type: "alert",
    title: "Budget Alert",
    message: "Project budget is 85% utilized",
    time: "2 days ago",
    read: true,
  },
];

const getIcon = (type: Notification["type"]) => {
  switch (type) {
    case "task":
      return <CheckCircle className="w-5 h-5 text-blue-500" />;
    case "message":
      return <MessageSquare className="w-5 h-5 text-green-500" />;
    case "schedule":
      return <Calendar className="w-5 h-5 text-purple-500" />;
    case "alert":
      return <AlertCircle className="w-5 h-5 text-orange-500" />;
  }
};

export function NotificationSheet({ isOpen, onClose }: NotificationSheetProps) {
  const unreadCount = mockNotifications.filter(n => !n.read).length;

  return (
    <BottomSheet 
      isOpen={isOpen} 
      onClose={onClose} 
      title={
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5" />
          <span>Notifications</span>
          {unreadCount > 0 && (
            <span className="bg-destructive text-destructive-foreground text-xs px-2 py-0.5 rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
      }
    >
      <div className="space-y-1">
        {mockNotifications.length === 0 ? (
          <div className="p-8 text-center">
            <Bell className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-30" />
            <p className="text-muted-foreground text-sm">No notifications yet</p>
          </div>
        ) : (
          mockNotifications.map((notification) => (
            <button
              key={notification.id}
              className={`w-full text-left p-4 rounded-lg transition-colors hover-elevate active-elevate-2 ${
                !notification.read ? "bg-[#bba7db]/5" : ""
              }`}
              data-testid={`notification-${notification.id}`}
            >
              <div className="flex gap-3">
                <div className="flex-shrink-0 mt-1">
                  {getIcon(notification.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h4 className={`text-sm font-medium ${!notification.read ? "text-foreground" : "text-muted-foreground"}`}>
                      {notification.title}
                    </h4>
                    {!notification.read && (
                      <div className="w-2 h-2 bg-[#bba7db] rounded-full flex-shrink-0 mt-1" />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-1">
                    {notification.message}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {notification.time}
                  </p>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
      
      {mockNotifications.length > 0 && (
        <div className="pt-3 mt-3 border-t">
          <button className="w-full text-center text-sm text-muted-foreground hover-elevate active-elevate-2 rounded-md py-2">
            Mark all as read
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
