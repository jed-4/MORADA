import { ArrowLeft, Menu, Bell } from "lucide-react";
import { useState } from "react";
import { MoreMenu } from "./MoreMenu";
import { ProjectSelector } from "./ProjectSelector";
import { NotificationSheet } from "./NotificationSheet";

interface MobileHeaderProps {
  title?: string;
  showBack?: boolean;
  showMore?: boolean;
  showNotifications?: boolean;
  showProjectSelector?: boolean;
  action?: React.ReactNode;
}

export function MobileHeader({ 
  title, 
  showBack = false, 
  showMore = true,
  showNotifications = true,
  showProjectSelector = false,
  action 
}: MobileHeaderProps) {
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [notificationSheetOpen, setNotificationSheetOpen] = useState(false);

  return (
    <>
      <header className="safe-top bg-card border-b px-4 py-3 flex items-center">
        <div className="flex items-center gap-3">
          {showBack && (
            <button
              onClick={() => window.history.back()}
              className="p-2 -ml-2 hover-elevate active-elevate-2 rounded-md"
              data-testid="button-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          {showMore && !showBack && (
            <button
              onClick={() => setShowMoreMenu(true)}
              className="p-2 -ml-2 hover-elevate active-elevate-2 rounded-md"
              data-testid="button-more-menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          {!showProjectSelector && (
            <h1 className="text-lg font-semibold">{title}</h1>
          )}
        </div>
        <div className="flex-1 flex justify-center">
          {showProjectSelector && <ProjectSelector />}
        </div>
        <div className="flex items-center gap-2">
          {action}
          {showNotifications && (
            <button
              onClick={() => setNotificationSheetOpen(true)}
              className="p-2 hover-elevate active-elevate-2 rounded-md relative"
              data-testid="button-notifications"
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full" />
            </button>
          )}
        </div>
      </header>
      
      <MoreMenu isOpen={showMoreMenu} onClose={() => setShowMoreMenu(false)} />
      <NotificationSheet isOpen={notificationSheetOpen} onClose={() => setNotificationSheetOpen(false)} />
    </>
  );
}
