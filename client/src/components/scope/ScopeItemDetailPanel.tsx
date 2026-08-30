import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/EmptyState";
import {
  ChevronDown,
  ChevronUp,
  X,
  ClipboardList,
  Paperclip,
} from "lucide-react";
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import type { ScopeItem, ScopeItemTypeDefinition } from "@shared/schema";
import { SCOPE_TYPES } from "./types";

// Right-side detail panel for a scope item (380px, slides in shrinking main content).
export function ScopeItemDetailPanel({
  item,
  onClose,
  onUpdate,
  scopeItemTypeDefs,
  visibleTypeDefs,
}: {
  item: ScopeItem;
  onClose: () => void;
  onUpdate: (id: string, data: Partial<ScopeItem>) => void;
  scopeItemTypeDefs: ScopeItemTypeDefinition[];
  visibleTypeDefs: ScopeItemTypeDefinition[];
}) {
  const [title, setTitle] = useState(item.title);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [checklistsOpen, setChecklistsOpen] = useState(false);
  const [entered, setEntered] = useState(false);

  // Trigger slide-in animation on mount
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Sync local state when the panel switches to a different item
  useEffect(() => {
    setTitle(item.title);
  }, [item.id, item.title]);

  const detailEditor = useEditor({
    extensions: [StarterKit, Underline],
    content: item.description || '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[160px] p-3',
      },
    },
    onUpdate: ({ editor }) => {
      onUpdate(item.id, { description: editor.getHTML() });
    },
  });

  // When the panel is reused for a different item, reset the editor's content
  useEffect(() => {
    if (detailEditor && detailEditor.getHTML() !== (item.description || '<p></p>')) {
      detailEditor.commands.setContent(item.description || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  // Escape closes the panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const typeOptions = scopeItemTypeDefs.length > 0
    ? visibleTypeDefs
    : SCOPE_TYPES.map((t, i) => ({
        id: t,
        name: t.charAt(0).toUpperCase() + t.slice(1),
        displayOrder: i,
        visibleToRoles: [],
        companyId: '',
        createdAt: new Date(),
      } as ScopeItemTypeDefinition));

  return (
    <div
      className={`w-[380px] shrink-0 bg-card border-l border-border flex flex-col overflow-hidden transition-transform duration-200 ${entered ? 'translate-x-0' : 'translate-x-full'}`}
      data-testid="scope-item-detail-panel"
    >
      {/* Header */}
      <div className="h-9 flex items-center justify-between px-3 border-b border-border/50 shrink-0">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Item Details</span>
        <button
          onClick={onClose}
          className="h-6 w-6 flex items-center justify-center rounded-md hover-elevate active-elevate-2"
          data-testid="button-close-detail-panel"
          aria-label="Close detail panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body (scrollable) */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Title */}
        <div>
          <Label htmlFor="detail-title" className="text-xs text-muted-foreground">Title</Label>
          <Input
            id="detail-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              if (title.trim() && title !== item.title) {
                onUpdate(item.id, { title: title.trim() });
              } else if (!title.trim()) {
                setTitle(item.title);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            className="mt-1 text-base font-semibold"
            data-testid="input-detail-title"
          />
        </div>

        {/* Type */}
        <div>
          <Label htmlFor="detail-type" className="text-xs text-muted-foreground">Type</Label>
          <Select
            value={(item.itemType || 'scope').toLowerCase()}
            onValueChange={(value) => onUpdate(item.id, { itemType: value })}
          >
            <SelectTrigger id="detail-type" className="mt-1" data-testid="select-detail-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {typeOptions.map((def) => (
                <SelectItem key={def.id} value={def.name.toLowerCase()}>
                  {def.name.charAt(0).toUpperCase() + def.name.slice(1).toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Description */}
        <div>
          <Label className="text-xs text-muted-foreground">Description</Label>
          {detailEditor && (
            <div className="mt-1 border rounded-md overflow-hidden" data-testid="detail-tiptap-editor">
              <div className="border-b bg-muted/30 p-1.5 flex items-center gap-1 flex-wrap">
                <Button type="button" variant={detailEditor.isActive('bold') ? 'default' : 'ghost'} size="sm" onClick={() => detailEditor.chain().focus().toggleBold().run()} className="h-7 w-7 p-0" data-testid="detail-toolbar-bold">
                  <strong className="text-xs">B</strong>
                </Button>
                <Button type="button" variant={detailEditor.isActive('italic') ? 'default' : 'ghost'} size="sm" onClick={() => detailEditor.chain().focus().toggleItalic().run()} className="h-7 w-7 p-0" data-testid="detail-toolbar-italic">
                  <em className="text-xs">I</em>
                </Button>
                <Button type="button" variant={detailEditor.isActive('underline') ? 'default' : 'ghost'} size="sm" onClick={() => detailEditor.chain().focus().toggleUnderline().run()} className="h-7 w-7 p-0" data-testid="detail-toolbar-underline">
                  <span className="text-xs underline">U</span>
                </Button>
                <div className="w-px h-4 bg-border mx-1" />
                <Button type="button" variant={detailEditor.isActive('bulletList') ? 'default' : 'ghost'} size="sm" onClick={() => detailEditor.chain().focus().toggleBulletList().run()} className="h-7 w-7 p-0" data-testid="detail-toolbar-bullet">
                  <span className="text-xs">•</span>
                </Button>
                <Button type="button" variant={detailEditor.isActive('orderedList') ? 'default' : 'ghost'} size="sm" onClick={() => detailEditor.chain().focus().toggleOrderedList().run()} className="h-7 w-7 p-0" data-testid="detail-toolbar-ordered">
                  <span className="text-xs">1.</span>
                </Button>
              </div>
              <EditorContent editor={detailEditor} />
            </div>
          )}
        </div>

        {/* Attachments — collapsible */}
        <div className="border-t border-border/50 pt-3">
          <button
            onClick={() => setAttachmentsOpen(o => !o)}
            className="w-full flex items-center justify-between px-1 py-1 rounded-md hover-elevate"
            data-testid="button-toggle-detail-attachments"
          >
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <Paperclip className="h-3 w-3" /> Attachments
            </span>
            {attachmentsOpen ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
          </button>
          {attachmentsOpen && (
            <EmptyState
              variant="inline"
              icon={Paperclip}
              title="No attachments yet."
              className="px-1 py-4"
            />
          )}
        </div>

        {/* Linked Checklists — collapsible */}
        <div className="border-t border-border/50 pt-3">
          <button
            onClick={() => setChecklistsOpen(o => !o)}
            className="w-full flex items-center justify-between px-1 py-1 rounded-md hover-elevate"
            data-testid="button-toggle-detail-checklists"
          >
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <ClipboardList className="h-3 w-3" /> Checklists
            </span>
            {checklistsOpen ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
          </button>
          {checklistsOpen && (
            <EmptyState
              variant="inline"
              icon={ClipboardList}
              title="No linked checklists yet."
              className="px-1 py-4"
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default ScopeItemDetailPanel;
