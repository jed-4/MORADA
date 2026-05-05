import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Plus, Pin } from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useQuery } from "@tanstack/react-query";
import { WidgetSkeleton } from "@/components/ui/WidgetSkeleton";
import { WidgetEmpty } from "@/components/ui/WidgetEmpty";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { useTimezone, formatInTimezone } from "@/hooks/useTimezone";

interface Memo {
  id: string;
  content: string;
  pinned?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export default function PersonalMemosWidget({ widget, onUpdate, isConfiguring, onCloseConfig, userId }: WidgetProps) {
  const { effectiveTimezone } = useTimezone();
  const maxMemos = widget.config?.maxMemos || 5;
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [configMaxMemos, setConfigMaxMemos] = useState(maxMemos);
  const [, setLocation] = useLocation();

  useEffect(() => {
    setEditingTitle(widget.title);
    setConfigMaxMemos(widget.config?.maxMemos || 5);
  }, [widget.title, widget.config]);

  const { data: memos = [], isLoading } = useQuery<Memo[]>({
    queryKey: ["/api/user-memos"],
    enabled: !!userId,
  });

  const sortedMemos = [...memos].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
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
          onClick={() => userId && setLocation(`/users/${userId}/notes`)}
          disabled={!userId}
          data-testid="memos-widget-view-all"
        >
          <Plus className="h-3 w-3 mr-1" />
          New
        </Button>
      </div>
      
      <div className="space-y-1">
        {isLoading ? (
          <WidgetSkeleton rows={3} />
        ) : displayMemos.length === 0 ? (
          <WidgetEmpty icon={FileText} message="No memos yet" />
        ) : (
          displayMemos.map((memo) => (
            <div 
              key={memo.id}
              className="p-2 border rounded-md hover-elevate cursor-pointer"
              onClick={() => userId && setLocation(`/users/${userId}/notes`)}
              data-testid={`memo-${memo.id}`}
            >
              <div className="flex items-start gap-2">
                {memo.pinned ? (
                  <Pin className="h-3 w-3 text-amber-500 mt-0.5 flex-shrink-0" />
                ) : (
                  <FileText className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs truncate leading-tight">{truncateContent(memo.content)}</p>
                  <span className="text-data text-muted-foreground">
                    {formatInTimezone(new Date(memo.updatedAt || memo.createdAt), effectiveTimezone, { month: 'short', day: 'numeric' })}
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
