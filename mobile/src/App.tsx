import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@lib/queryClient";

function MobileApp() {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Mobile Header */}
      <header className="safe-top bg-card border-b px-4 py-3">
        <h1 className="text-lg font-semibold">BuildPro Mobile</h1>
      </header>

      {/* Content Area */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-4">
          <div className="bg-card rounded-lg p-6 text-center">
            <h2 className="text-2xl font-bold mb-2">Welcome to BuildPro Mobile</h2>
            <p className="text-muted-foreground">
              Mobile app structure is set up and ready for development
            </p>
            <div className="mt-4 space-y-2">
              <div className="bg-primary/10 p-3 rounded-md">
                <p className="text-sm font-medium">✅ Capacitor Configured</p>
              </div>
              <div className="bg-primary/10 p-3 rounded-md">
                <p className="text-sm font-medium">✅ iOS Platform Added</p>
              </div>
              <div className="bg-primary/10 p-3 rounded-md">
                <p className="text-sm font-medium">✅ Android Platform Added</p>
              </div>
              <div className="bg-primary/10 p-3 rounded-md">
                <p className="text-sm font-medium">✅ Shared API Client Ready</p>
              </div>
              <div className="bg-primary/10 p-3 rounded-md">
                <p className="text-sm font-medium">✅ Mobile Build System Ready</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Navigation */}
      <nav className="safe-bottom bg-card border-t">
        <div className="flex justify-around items-center h-16">
          {[
            { id: "dashboard", label: "Dashboard", icon: "📊" },
            { id: "tasks", label: "Tasks", icon: "✓" },
            { id: "projects", label: "Projects", icon: "📁" },
            { id: "more", label: "More", icon: "⋯" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                activeTab === tab.id
                  ? "text-primary"
                  : "text-muted-foreground"
              }`}
              data-testid={`tab-${tab.id}`}
            >
              <span className="text-2xl mb-1">{tab.icon}</span>
              <span className="text-xs font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MobileApp />
    </QueryClientProvider>
  );
}
