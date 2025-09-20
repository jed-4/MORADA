import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Plus, Edit3 } from "lucide-react";
import { useState } from "react";
import { WidgetProps } from "@/types/widgets";

// todo: remove mock functionality
const mockNotes = [
  {
    id: "1",
    content: "Client wants to upgrade kitchen tiles - need to get new quote",
    timestamp: "2 hours ago",
    author: "John Doe",
  },
  {
    id: "2", 
    content: "Weather delay expected next week due to heavy rain forecast",
    timestamp: "1 day ago",
    author: "Mike Johnson",
  },
];

export default function NotesWidget({ widget }: WidgetProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [newNote, setNewNote] = useState("");
  const maxNotes = widget.config?.maxNotes || 3;
  
  const displayNotes = mockNotes.slice(0, maxNotes);

  const handleAddNote = () => {
    if (newNote.trim()) {
      console.log("Adding note:", newNote);
      setNewNote("");
      setIsEditing(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {displayNotes.length} note{displayNotes.length !== 1 ? 's' : ''}
        </div>
        <Button 
          size="sm" 
          variant="ghost"
          onClick={() => setIsEditing(!isEditing)}
          data-testid="notes-widget-add"
        >
          {isEditing ? <Edit3 className="h-3 w-3 mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
          {isEditing ? 'Cancel' : 'Add'}
        </Button>
      </div>
      
      {isEditing && (
        <div className="space-y-2" data-testid="notes-widget-editor">
          <Textarea
            placeholder="Add a project note..."
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            rows={2}
            className="text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAddNote} disabled={!newNote.trim()}>
              Save Note
            </Button>
          </div>
        </div>
      )}
      
      <div className="space-y-2">
        {displayNotes.map((note) => (
          <div 
            key={note.id} 
            className="p-3 border rounded hover-elevate cursor-pointer"
            data-testid={`note-widget-item-${note.id}`}
          >
            <div className="flex items-start gap-2">
              <FileText className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm">{note.content}</p>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <span>{note.author}</span>
                  <span>•</span>
                  <span>{note.timestamp}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {displayNotes.length === 0 && !isEditing && (
        <div className="text-center py-4 text-sm text-muted-foreground">
          No project notes yet
        </div>
      )}
    </div>
  );
}