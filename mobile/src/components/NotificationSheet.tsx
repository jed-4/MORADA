import { CheckCircle, AlertCircle, MessageSquare, Calendar, ChevronRight } from "lucide-react";
import { useEffect } from "react";

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
    message: "Install Kitchen Cabinets",
    time: "2h ago",
    read: false,
  },
  {
    id: "2",
    type: "message",
    title: "New Message",
    message: "John commented on scope",
    time: "5h ago",
    read: false,
  },
  {
    id: "3",
    type: "schedule",
    title: "Schedule Update",
    message: "Site inspection tomorrow 9 AM",
    time: "1d ago",
    read: true,
  },
  {
    id: "4",
    type: "alert",
    title: "Budget Alert",
    message: "Budget is 85% utilized",
    time: "2d ago",
    read: true,
  },
];

const getIcon = (type: Notification["type"]) => {
  switch (type) {
    case "task":
      return <CheckCircle className="w-4 h-4 text-blue-500" />;
    case "message":
      return <MessageSquare className="w-4 h-4 text-green-500" />;
    case "schedule":
      return <Calendar className="w-4 h-4 text-purple-500" />;
    case "alert":
      return <AlertCircle className="w-4 h-4 text-orange-500" />;
  }
};

export function NotificationSheet({ isOpen, onClose }: NotificationSheetProps) {
  const unreadCount = mockNotifications.filter(n => !n.read).length;
  const recentNotifications = mockNotifications.slice(0, 4);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-notification-panel]') && !target.closest('[data-testid="button-notifications"]')) {
        onClose();
      }
    };
    
    setTimeout(() => document.addEventListener('click', handleClick), 0);
    return () => document.removeEventListener('click', handleClick);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-40" 
        onClick={onClose}
      />
      
      {/* Dropdown Panel */}
      <div 
        data-notification-panel
        className="fixed top-14 right-4 w-[calc(100vw-2rem)] max-w-sm bg-card border rounded-xl shadow-xl z-50 animate-in fade-in slide-in-from-top-2 duration-200"
        style={{ maxHeight: '60vh' }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <span className="bg-[#bba7db] text-white text-xs px-2 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <button 
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Close
          </button>
        </div>

        {/* Notifications List */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(60vh - 120px)' }}>
          {recentNotifications.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-muted-foreground text-sm">No notifications</p>
            </div>
          ) : (
            <div className="py-1">
              {recentNotifications.map((notification) => (
                <button
                  key={notification.id}
                  onClick={onClose}
                  className={`w-full text-left px-4 py-3 transition-colors hover:bg-accent/10 border-b last:border-b-0 ${
                    !notification.read ? "bg-[#bba7db]/5" : ""
                  }`}
                  data-testid={`notification-${notification.id}`}
                >
                  <div className="flex gap-3 items-start">
                    <div className="flex-shrink-0 mt-0.5">
                      {getIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h4 className={`text-xs font-medium mb-0.5 ${!notification.read ? "text-foreground" : "text-muted-foreground"}`}>
                            {notification.title}
                          </h4>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {notification.message}
                          </p>
                        </div>
                        {!notification.read && (
                          <div className="w-2 h-2 bg-[#bba7db] rounded-full flex-shrink-0 mt-1" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {notification.time}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* Footer */}
        {recentNotifications.length > 0 && (
          <div className="px-4 py-2 border-t bg-muted/30 flex items-center justify-between gap-2">
            <button 
              onClick={onClose}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Mark all read
            </button>
            <button 
              onClick={onClose}
              className="text-xs text-[#bba7db] hover:text-[#bba7db]/80 flex items-center gap-1"
            >
              View all
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
