import { MobileHeader } from "@/components/MobileHeader";
import { Plus, Search } from "lucide-react";

export function Messages() {
  const conversations = [
    { 
      id: 1, 
      name: "Project Team", 
      lastMessage: "The materials will arrive tomorrow", 
      time: "10:32 AM",
      unread: 3,
      avatar: "PT",
      online: true
    },
    { 
      id: 2, 
      name: "John Smith", 
      lastMessage: "Can you review the estimates?", 
      time: "Yesterday",
      unread: 0,
      avatar: "JS",
      online: false
    },
    { 
      id: 3, 
      name: "Sarah Johnson", 
      lastMessage: "Thanks for the update!", 
      time: "Monday",
      unread: 0,
      avatar: "SJ",
      online: true
    },
    { 
      id: 4, 
      name: "Suppliers Group", 
      lastMessage: "New pricing list attached", 
      time: "Sunday",
      unread: 1,
      avatar: "SG",
      online: false
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <MobileHeader 
        title="Messages"
        action={
          <button
            className="p-2 hover-elevate active-elevate-2 rounded-md"
            data-testid="button-new-message"
          >
            <Plus className="w-5 h-5" />
          </button>
        }
      />
      
      {/* Search Bar */}
      <div className="bg-card border-b px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search messages..."
            className="w-full h-9 pl-9 pr-3 rounded-md border bg-background text-sm"
            data-testid="input-search-messages"
          />
        </div>
      </div>

      <main className="flex-1 overflow-y-auto">
        <div className="divide-y">
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              className="flex items-start gap-3 p-4 hover-elevate active-elevate-2"
              data-testid={`conversation-${conversation.id}`}
            >
              <div className="relative">
                <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-semibold">
                  {conversation.avatar}
                </div>
                {conversation.online && (
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-card rounded-full" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-semibold text-sm">{conversation.name}</h3>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{conversation.time}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground truncate">{conversation.lastMessage}</p>
                  {conversation.unread > 0 && (
                    <span className="px-2 py-0.5 bg-primary text-primary-foreground rounded-full text-xs font-medium">
                      {conversation.unread}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
