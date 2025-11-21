import { ReactNode } from "react";
import { X, Settings, User, Users, HelpCircle, LogOut, Camera, Tag } from "lucide-react";
import { useAuth } from "@shared/useAuth";
import { useLocation } from "wouter";

interface MoreMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

interface MenuItem {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  variant?: "default" | "destructive";
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

export function MoreMenu({ isOpen, onClose }: MoreMenuProps) {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  if (!isOpen) return null;

  const sections: MenuSection[] = [
    {
      title: "Company",
      items: [
        {
          icon: <Tag className="w-5 h-5" />,
          label: "Cost Codes",
          onClick: () => {
            // Cost codes view
            onClose();
          },
        },
      ],
    },
    {
      title: "General",
      items: [
        {
          icon: <Camera className="w-5 h-5" />,
          label: "Scan Bill",
          onClick: () => {
            setLocation("/scan-bill");
            onClose();
          },
        },
        {
          icon: <User className="w-5 h-5" />,
          label: "Profile",
          onClick: () => {
            setLocation("/profile");
            onClose();
          },
        },
        {
          icon: <Users className="w-5 h-5" />,
          label: "Team",
          onClick: () => {
            setLocation("/team");
            onClose();
          },
        },
        {
          icon: <Settings className="w-5 h-5" />,
          label: "Settings",
          onClick: () => {
            setLocation("/settings");
            onClose();
          },
        },
        {
          icon: <HelpCircle className="w-5 h-5" />,
          label: "Help & Support",
          onClick: () => {
            setLocation("/help");
            onClose();
          },
        },
        {
          icon: <LogOut className="w-5 h-5" />,
          label: "Logout",
          onClick: async () => {
            await logout();
            onClose();
            setLocation("/");
          },
          variant: "destructive",
        },
      ],
    },
  ];

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
        data-testid="more-menu-overlay"
      />
      
      {/* Side Menu */}
      <div
        className="fixed left-0 top-0 bottom-0 w-[280px] bg-card z-50 shadow-xl animate-slide-in-left"
        data-testid="more-menu"
      >
        {/* Header */}
        <div className="bg-primary text-primary-foreground p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold">BuildPro</h2>
              <p className="text-sm opacity-90 mt-1">{user?.email || "Guest"}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover-elevate active-elevate-2 rounded-md"
              data-testid="button-close-more-menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Menu Items */}
        <div className="p-2 space-y-4">
          {sections.map((section, sectionIndex) => (
            <div key={sectionIndex}>
              {section.title && (
                <h3 className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {section.title}
                </h3>
              )}
              <div className="space-y-1">
                {section.items.map((item, index) => (
                  <button
                    key={index}
                    onClick={item.onClick}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg hover-elevate active-elevate-2 text-left ${
                      item.variant === "destructive"
                        ? "text-destructive"
                        : "text-foreground"
                    }`}
                    data-testid={`menu-item-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {item.icon}
                    <span className="font-medium">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t bg-muted/30">
          <p className="text-xs text-muted-foreground text-center">
            Version 1.0.0
          </p>
        </div>
      </div>
    </>
  );
}
