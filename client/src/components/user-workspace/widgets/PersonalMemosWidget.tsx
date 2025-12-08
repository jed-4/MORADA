import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Plus, Pin } from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format } from "date-fns";

interface Memo {
  id: string;
  content: string;
  isPinned?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export default function PersonalMemosWidget({ widget, onUpdate, isConfiguring, onCloseConfig }: WidgetProps) {
  const maxMemos = widget.config?.maxMemos || 5;
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [configMaxMemos, setConfigMaxMemos] = useState(maxMemos);
  const [, setLocation] = useLocation();

  useEffect(() => {
    setEditingTitle(widget.title);
    setConfigMaxMemos(widget.config?.maxMemos || 5);
  }, [widget.title, widget.config]);

  const { data: currentUser } = useQuery<{ id: string }>({
    queryKey: ["/api/user"],
  });

  const { data: memos = [], isLoading } = useQuery<Memo[]>({
    queryKey: ["/api/memos", currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return [];
      try {
        const response = await fetch(`/api/memos?userId=${currentUser.id}`, {
          credentials: 'include'
        });
        if (!response.ok) return [];
        return response.json();
      } catch {
        return [];
      }
    },
    enabled: !!currentUser?.id,
  });

  const sortedMemos = [...memos].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
  });

  const displayMemos = sortedMemos.slice(0, maxMemos);

  const truncateContent = (content: string, maxLength: number = 60) => {
    const plainText = content.replace(/<[^>]*>/g, '').replace(/\n/g, ' ').trim();
    if (plainText.length <= maxLength) return plainText;
    return plainText.substring(0, maxLength) + '...';
  };

  if (isConfiguring) {
    const handleSaveConfig = () => {
      if (onUpdate) {
        onUpdate({
          ...widget,
          title: editingTitle,
          config: { ...widget.config, maxMemos: configMaxMemos }
        });
      }
      onCloseConfig?.();
    };

    const handleCancelConfig = () => {
      setEditingTitle(widget.title);
      setConfigMaxMemos(widget.config?.maxMemos || 5);
      onCloseConfig?.();
    };

    return (
      <div className="space-y-3 p-2">
        <h4 className="text-sm font-medium">Configure Memos</h4>
        
        <div className="space-y-2">
          <Label className="text-xs">Widget Name</Label>
          <Input 
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            className="h-7 text-xs"
            placeholder="Widget title"
          />
        </div>
        
        <div className="space-y-2">
          <Label className="text-xs">Max Memos</Label>
          <Input 
            type="number"
            min={1}
            max={20}
            value={configMaxMemos}
            onChange={(e) => setConfigMaxMemos(parseInt(e.target.value) || 5)}
            className="h-7 text-xs w-20"
          />
        </div>
        
        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="outline" onClick={handleCancelConfig} className="h-6 px-2 text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSaveConfig} className="h-6 px-2 text-xs">
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {memos.length} memo{memos.length !== 1 ? 's' : ''}
        </div>
        <Button 
          size="sm" 
          variant="ghost"
          className="h-6 px-2 text-xs"
          onClick={() => setLocation(`/users/${currentUser?.id}/notes`)}
          data-testid="memos-widget-view-all"
        >
          <Plus className="h-3 w-3 mr-1" />
          New
        </Button>
      </div>
      
      <div className="space-y-1">
        {isLoading ? (
          <div className="space-y-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse p-2 border rounded-md">
                <div className="h-3 bg-muted rounded w-3/4 mb-1"></div>
                <div className="h-2 bg-muted rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : displayMemos.length === 0 ? (
          <div className="text-center py-3 text-xs text-muted-foreground">
            No memos yet
          </div>
        ) : (
          displayMemos.map((memo) => (
            <div 
              key={memo.id}
              className="p-2 border rounded-md hover-elevate cursor-pointer"
              onClick={() => setLocation(`/users/${currentUser?.id}/notes`)}
              data-testid={`memo-${memo.id}`}
            >
              <div className="flex items-start gap-2">
                {memo.isPinned ? (
                  <Pin className="h-3 w-3 text-amber-500 mt-0.5 flex-shrink-0" />
                ) : (
                  <FileText className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs truncate leading-tight">{truncateContent(memo.content)}</p>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(memo.updatedAt || memo.createdAt), 'MMM d')}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
