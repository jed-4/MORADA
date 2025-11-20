import { MobileHeader } from "@/components/MobileHeader";
import { ChevronRight, User, Settings, HelpCircle, LogOut } from "lucide-react";

export function More() {
  const menuItems = [
    { icon: User, label: "Profile", path: "/profile" },
    { icon: Settings, label: "Settings", path: "/settings" },
    { icon: HelpCircle, label: "Help & Support", path: "/help" },
    { icon: LogOut, label: "Log Out", path: "/logout", variant: "destructive" },
  ];

  return (
    <div className="flex flex-col h-full">
      <MobileHeader title="More" />
      
      <main className="flex-1 overflow-y-auto">
        {/* User Info */}
        <div className="bg-card border-b p-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-2xl font-bold">
              JD
            </div>
            <div>
              <h2 className="font-semibold text-lg">Jed Smith</h2>
              <p className="text-sm text-muted-foreground">jed@lighthouseprojects.com.au</p>
            </div>
          </div>
        </div>

        {/* Menu Items */}
        <div className="p-4 space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                className={`w-full flex items-center justify-between p-4 rounded-xl border hover-elevate active-elevate-2 ${
                  item.variant === "destructive" ? "text-destructive" : ""
                }`}
                data-testid={`menu-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
            );
          })}
        </div>

        {/* App Info */}
        <div className="p-4 mt-8">
          <div className="text-center text-xs text-muted-foreground space-y-1">
            <div>BuildPro Mobile</div>
            <div>Version 1.0.0 (Beta)</div>
          </div>
        </div>
      </main>
    </div>
  );
}
