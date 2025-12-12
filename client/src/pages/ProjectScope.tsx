import { useState, useEffect, useMemo } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  ListTree,
  Plus,
  FileDown,
  Send,
  DollarSign,
  Package,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  GripVertical,
  Trash2,
  CheckSquare,
  Upload,
  FileText,
  Pen,
  Save,
  CalendarDays,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { ScopeItem, ScopeStage, ScopeTemplate, Estimate } from "@shared/schema";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { DndContext, closestCenter, DragOverlay, DragEndEvent, DragOverEvent, DragStartEvent, useSensor, useSensors, PointerSensor, KeyboardSensor, useDroppable } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { Document, Page, Text, View, StyleSheet, PDFDownloadLink } from '@react-pdf/renderer';

// Casva lilac color
const CASVA_LILAC = '#bba7db';

// Helper function to convert Tiptap JSON to plain text for PDF
const tiptapJsonToText = (jsonOrHtml: string | null | undefined): string => {
  if (!jsonOrHtml) return '';
  
  // Try to parse as JSON first (for new items)
  try {
    const parsed = JSON.parse(jsonOrHtml);
    if (parsed.type && parsed.content) {
      // It's Tiptap JSON, extract text recursively
      const extractText = (node: any): string => {
        if (node.text) return node.text;
        if (node.content) {
          return node.content.map((child: any) => extractText(child)).join(' ');
        }
        return '';
      };
      return extractText(parsed);
    }
  } catch {
    // Not JSON, treat as HTML
  }
  
  // Fallback: strip HTML tags (for existing items)
  return jsonOrHtml.replace(/<[^>]*>/g, '');
};

interface StageState {
  [key: string]: boolean;
}

// Add to Template Dialog Component
interface AddToTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scopeItem: ScopeItem;
}

function AddToTemplateDialog({ open, onOpenChange, scopeItem }: AddToTemplateDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [showNewTemplateDialog, setShowNewTemplateDialog] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDescription, setNewTemplateDescription] = useState("");
  const [newTemplateCategory, setNewTemplateCategory] = useState("");

  // Fetch templates
  const { data: templates = [], isLoading } = useQuery<ScopeTemplate[]>({
    queryKey: ['/api/scope-templates'],
    enabled: open && !!user?.companyId,
  });

  // Add item to template mutation
  const addToTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      return await apiRequest(`/api/scope-templates/${templateId}/add-item`, {
        method: 'POST',
        body: JSON.stringify({
          scopeItem: {
            title: scopeItem.title,
            description: scopeItem.description,
            itemType: scopeItem.itemType,
            quantity: scopeItem.quantity,
            rate: scopeItem.rate,
            gearChecklist: scopeItem.gearChecklist,
            stage: scopeItem.stage,
          },
        }),
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Item added to template successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/scope-templates'] });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add item to template",
        variant: "destructive",
      });
    },
  });

  // Create new template mutation
  const createTemplateMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/scope-templates', {
        method: 'POST',
        body: JSON.stringify({
          name: newTemplateName,
          description: newTemplateDescription,
          category: newTemplateCategory || undefined,
          templateData: [{
            title: scopeItem.title,
            description: scopeItem.description,
            itemType: scopeItem.itemType,
            quantity: scopeItem.quantity,
            rate: scopeItem.rate,
            gearChecklist: scopeItem.gearChecklist,
            stage: scopeItem.stage,
          }],
        }),
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "New template created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/scope-templates'] });
      setShowNewTemplateDialog(false);
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create template",
        variant: "destructive",
      });
    },
  });

  const filteredTemplates = templates.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddToTemplate = () => {
    if (selectedTemplateId) {
      addToTemplateMutation.mutate(selectedTemplateId);
    }
  };

  const handleCreateNewTemplate = () => {
    if (newTemplateName.trim()) {
      createTemplateMutation.mutate();
    }
  };

  if (showNewTemplateDialog) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Template</DialogTitle>
            <DialogDescription>
              Create a new scope template with "{scopeItem.title}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="template-name">Template Name</Label>
              <Input
                id="template-name"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="e.g., Full Build, Bathroom Reno"
                data-testid="input-new-template-name"
              />
            </div>
            <div>
              <Label htmlFor="template-description">Description (Optional)</Label>
              <Input
                id="template-description"
                value={newTemplateDescription}
                onChange={(e) => setNewTemplateDescription(e.target.value)}
                placeholder="Brief description"
                data-testid="input-new-template-description"
              />
            </div>
            <div>
              <Label htmlFor="template-category">Category (Optional)</Label>
              <Input
                id="template-category"
                value={newTemplateCategory}
                onChange={(e) => setNewTemplateCategory(e.target.value)}
                placeholder="e.g., Residential, Commercial"
                data-testid="input-new-template-category"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNewTemplateDialog(false)}
              data-testid="button-cancel-new-template"
            >
              Back
            </Button>
            <Button
              onClick={handleCreateNewTemplate}
              disabled={!newTemplateName.trim() || createTemplateMutation.isPending}
              data-testid="button-create-template"
            >
              {createTemplateMutation.isPending ? "Creating..." : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add to Template</DialogTitle>
          <DialogDescription>
            Select a template to add "{scopeItem.title}"
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Search */}
          <Input
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-templates"
          />

          {/* Templates List */}
          {isLoading ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              Loading templates...
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              {searchQuery ? "No templates match your search" : "No templates yet"}
            </div>
          ) : (
            <div className="max-h-[300px] overflow-y-auto space-y-1">
              {filteredTemplates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => setSelectedTemplateId(template.id)}
                  className={`w-full text-left p-3 rounded border transition-all hover-elevate ${
                    selectedTemplateId === template.id
                      ? 'border-[#bba7db] bg-[#bba7db]/10'
                      : 'border-border'
                  }`}
                  data-testid={`button-select-template-${template.id}`}
                >
                  <div className="font-medium text-sm">{template.name}</div>
                  {template.description && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {template.description}
                    </div>
                  )}
                  {template.category && (
                    <Badge variant="secondary" className="mt-1 h-4 text-[10px]">
                      {template.category}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Create New Template Button */}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setShowNewTemplateDialog(true)}
            data-testid="button-show-new-template"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create New Template
          </Button>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-add-to-template"
          >
            Cancel
          </Button>
          <Button
            onClick={handleAddToTemplate}
            disabled={!selectedTemplateId || addToTemplateMutation.isPending}
            data-testid="button-confirm-add-to-template"
          >
            {addToTemplateMutation.isPending ? "Adding..." : "Add to Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface SortableScopeItemProps {
  item: ScopeItem;
  onUpdate: (id: string, data: Partial<ScopeItem>) => void;
  onDelete: (id: string) => void;
  onToggleSelect: (id: string) => void;
  isSelected: boolean;
  level?: number;
  children?: ScopeItem[];
  allItems?: ScopeItem[];
  selectedItems?: Set<string>;
  isCollapsed?: boolean; // Scope 2.0: minimize/expand state
  onToggleCollapse?: (itemId: string) => void; // Scope 2.0: toggle function
  getTypeLabel?: (type: string | null | undefined) => string; // Scope 2.0: type label helper
  collapsedItems?: Set<string>; // Scope 2.0: full collapsed items set
}

function SortableScopeItem({ item, onUpdate, onDelete, onToggleSelect, isSelected, level = 0, children = [], allItems = [], selectedItems = new Set(), isCollapsed = false, onToggleCollapse, getTypeLabel, collapsedItems }: SortableScopeItemProps) {
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [showGearList, setShowGearList] = useState(false);
  const [showAddToTemplate, setShowAddToTemplate] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [uploadingGearIndex, setUploadingGearIndex] = useState<number | null>(null);
  const [newChecklistItemText, setNewChecklistItemText] = useState("");
  const [showChecklistItems, setShowChecklistItems] = useState(item.itemType === 'checklist');
  const { toast } = useToast();
  
  // Checklist items for checklist-type scope items
  const checklistItems = (item.checklistItems as ChecklistItem[] || []);
  
  const handleAddChecklistItem = () => {
    if (!newChecklistItemText.trim()) return;
    const newItem: ChecklistItem = {
      id: crypto.randomUUID(),
      text: newChecklistItemText.trim(),
      completed: false,
    };
    onUpdate(item.id, { checklistItems: [...checklistItems, newItem] as any });
    setNewChecklistItemText("");
  };
  
  const handleToggleChecklistItem = (itemId: string) => {
    const updated = checklistItems.map(ci => 
      ci.id === itemId ? { ...ci, completed: !ci.completed } : ci
    );
    onUpdate(item.id, { checklistItems: updated as any });
  };
  
  const handleDeleteChecklistItem = (itemId: string) => {
    const updated = checklistItems.filter(ci => ci.id !== itemId);
    onUpdate(item.id, { checklistItems: updated as any });
  };

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: item.description || '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onUpdate(item.id, { description: html });
    },
  });

  // Update editor editable state when isEditingDescription changes
  useEffect(() => {
    if (editor) {
      editor.setEditable(isEditingDescription);
      if (isEditingDescription) {
        // Focus the editor when entering edit mode
        editor.commands.focus();
      }
    }
  }, [isEditingDescription, editor]);

  const gearList = (item.gearList as any[] || []);

  const handleToggleGearItem = (index: number) => {
    const updated = [...gearList];
    updated[index] = { ...updated[index], checked: !updated[index].checked };
    onUpdate(item.id, { gearList: updated as any });
  };

  const handleGearPhotoUpload = async (index: number, file: File) => {
    setUploadingGearIndex(index);
    try {
      const formData = new FormData();
      formData.append('photo', file);
      formData.append('scopeItemId', item.id);
      formData.append('gearItemName', gearList[index].name);
      
      const response = await fetch('/api/scope/gear-photos', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) throw new Error('Upload failed');
      
      const result = await response.json();
      const updated = [...gearList];
      updated[index] = { ...updated[index], photoUrl: result.photoUrl };
      onUpdate(item.id, { gearList: updated as any });
      toast({ title: "Photo uploaded successfully" });
    } catch (error) {
      toast({ title: "Failed to upload photo", variant: "destructive" });
    } finally {
      setUploadingGearIndex(null);
    }
  };

  const hasChildren = children.length > 0;
  const itemTotal = (item.quantity || 0) * (item.rate || 0);

  return (
    <div ref={setNodeRef} style={style} className={`${level > 0 ? 'ml-8' : ''}`}>
      {/* Grid Row - h-10, ultra-compact */}
      <div 
        className={`h-10 grid items-center gap-2 px-2 border-b border-border/50 transition-all hover-elevate group ${
          isSelected ? 'bg-[#bba7db]/5 border-[#bba7db]/30' : ''
        }`}
        style={{ 
          gridTemplateColumns: '40px 24px minmax(200px, 1fr) 100px minmax(150px, 2fr) 80px 100px 120px 24px',
        }}
        data-testid={`scope-item-row-${item.id}`}
      >
        {/* Checkbox - 40px */}
        <div className="flex items-center justify-center">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelect(item.id)}
            data-testid={`checkbox-select-${item.id}`}
            className="h-4 w-4"
          />
        </div>

        {/* Drag - 24px */}
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing flex items-center justify-center">
          <GripVertical className="h-3 w-3 text-muted-foreground" />
        </div>

        {/* Item Name - minmax(200px, 1fr) */}
        <input
          value={item.title}
          onChange={(e) => onUpdate(item.id, { title: e.target.value })}
          className="h-7 text-sm font-medium bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-[#bba7db]/30 rounded px-2"
          placeholder="Item name"
          data-testid={`input-scope-title-${item.id}`}
        />

        {/* Type - 100px */}
        <div className="flex items-center">
          {getTypeLabel && (
            <span 
              className="h-4 px-1.5 text-[10px] font-semibold rounded bg-[#bba7db]/10 text-[#bba7db] border border-[#bba7db]/20 truncate"
              data-testid={`badge-type-${item.id}`}
            >
              {getTypeLabel(item.itemType)}
            </span>
          )}
        </div>

        {/* Description - minmax(150px, 2fr) */}
        <div className="flex items-center gap-1">
          <HoverCard openDelay={200} closeDelay={100}>
            <HoverCardTrigger asChild>
              <div 
                className="text-xs text-muted-foreground truncate cursor-pointer hover:text-foreground flex-1"
                onClick={() => setIsEditingDescription(true)}
              >
                {item.description ? (
                  <span className="line-clamp-1">{item.description.replace(/<[^>]*>/g, '')}</span>
                ) : (
                  <span className="italic">-</span>
                )}
              </div>
            </HoverCardTrigger>
            {item.description && (
              <HoverCardContent className="w-80 p-3 bg-popover border border-border shadow-lg" align="start" side="bottom">
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</div>
                  <div 
                    className="prose prose-sm max-w-none text-sm"
                    dangerouslySetInnerHTML={{ __html: item.description }}
                  />
                  <div className="pt-2 border-t">
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setIsEditingDescription(true)}>
                      <Pen className="h-3 w-3 mr-1" /> Edit
                    </Button>
                  </div>
                </div>
              </HoverCardContent>
            )}
          </HoverCard>
          {gearList.length > 0 && (
            <button
              onClick={() => setShowGearList(true)}
              className="h-4 px-1.5 text-[10px] font-semibold rounded bg-green-100 text-green-800 border border-green-200 hover-elevate flex items-center gap-0.5"
              title={`${gearList.filter(g => g.checked).length}/${gearList.length} gear items checked`}
              data-testid={`button-gear-${item.id}`}
            >
              <CheckSquare className="h-2.5 w-2.5" />
              <span>{gearList.filter(g => g.checked).length}/{gearList.length}</span>
            </button>
          )}
        </div>

        {/* Quantity - 80px */}
        <input
          type="number"
          value={item.quantity || ''}
          onChange={(e) => onUpdate(item.id, { quantity: parseFloat(e.target.value) || null })}
          className="h-7 text-sm text-right bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-[#bba7db]/30 rounded px-2"
          placeholder="-"
          data-testid={`input-quantity-${item.id}`}
        />

        {/* Rate - 100px */}
        <input
          type="number"
          value={item.rate || ''}
          onChange={(e) => onUpdate(item.id, { rate: parseFloat(e.target.value) || null })}
          className="h-7 text-sm text-right bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-[#bba7db]/30 rounded px-2"
          placeholder="-"
          data-testid={`input-rate-${item.id}`}
        />

        {/* Total - 120px */}
        <div className="text-sm font-semibold text-right text-muted-foreground">
          {itemTotal > 0 ? `$${itemTotal.toLocaleString()}` : '-'}
        </div>

        {/* Menu - 24px */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="h-6 w-6 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity hover-elevate"
              data-testid={`button-menu-scope-${item.id}`}
            >
              <span className="text-sm leading-none">⋯</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem 
              onClick={() => setIsEditingDescription(true)}
              data-testid={`menu-edit-description-${item.id}`}
            >
              <Pen className="h-3 w-3 mr-2" />
              Edit Description
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => setShowAddToTemplate(true)}
              data-testid={`menu-add-to-template-${item.id}`}
            >
              <Save className="h-3 w-3 mr-2" />
              Add to Template
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => onDelete(item.id)}
              className="text-destructive"
              data-testid={`menu-delete-scope-${item.id}`}
            >
              <Trash2 className="h-3 w-3 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Checklist Items - for itemType="checklist" */}
      {item.itemType === 'checklist' && (
        <div className="ml-16 border-l-2 border-[#bba7db]/20 pl-4 py-2 space-y-1 bg-muted/20">
          {checklistItems.map((ci) => (
            <div key={ci.id} className="flex items-center gap-2 group/ci">
              <Checkbox
                checked={ci.completed}
                onCheckedChange={() => handleToggleChecklistItem(ci.id)}
                className="h-4 w-4"
                data-testid={`checkbox-checklist-item-${ci.id}`}
              />
              <span className={`text-sm flex-1 ${ci.completed ? 'line-through text-muted-foreground' : ''}`}>
                {ci.text}
              </span>
              <button
                onClick={() => handleDeleteChecklistItem(ci.id)}
                className="h-5 w-5 rounded opacity-0 group-hover/ci:opacity-100 transition-opacity hover:bg-destructive/10 flex items-center justify-center"
                data-testid={`button-delete-checklist-item-${ci.id}`}
              >
                <X className="h-3 w-3 text-destructive" />
              </button>
            </div>
          ))}
          {/* Add new checklist item */}
          <div className="flex items-center gap-2 mt-2">
            <Plus className="h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={newChecklistItemText}
              onChange={(e) => setNewChecklistItemText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddChecklistItem()}
              placeholder="Add checklist item..."
              className="flex-1 h-7 text-sm bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-[#bba7db]/30 rounded px-2"
              data-testid={`input-new-checklist-item-${item.id}`}
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={handleAddChecklistItem}
              disabled={!newChecklistItemText.trim()}
              className="h-6"
              data-testid={`button-add-checklist-item-${item.id}`}
            >
              Add
            </Button>
          </div>
        </div>
      )}

      {/* Description Editor Dialog */}
      {isEditingDescription && editor && (
        <Dialog open={isEditingDescription} onOpenChange={setIsEditingDescription}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Description</DialogTitle>
              <DialogDescription>
                Add or edit the description for {item.title}
              </DialogDescription>
            </DialogHeader>
            <div className="border rounded-md overflow-hidden">
              {/* Toolbar */}
              <div className="border-b bg-muted/30 p-2 flex items-center gap-1 flex-wrap">
                <Button
                  type="button"
                  variant={editor.isActive('bold') ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => editor.chain().focus().toggleBold().run()}
                  className="h-8 w-8 p-0"
                  data-testid={`toolbar-bold-${item.id}`}
                >
                  <strong className="text-xs">B</strong>
                </Button>
                <Button
                  type="button"
                  variant={editor.isActive('italic') ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                  className="h-8 w-8 p-0"
                  data-testid={`toolbar-italic-${item.id}`}
                >
                  <em className="text-xs">I</em>
                </Button>
                <Button
                  type="button"
                  variant={editor.isActive('underline') ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => editor.chain().focus().toggleUnderline().run()}
                  className="h-8 w-8 p-0"
                  data-testid={`toolbar-underline-${item.id}`}
                >
                  <span className="text-xs underline">U</span>
                </Button>
                <div className="w-px h-5 bg-border mx-1" />
                <Button
                  type="button"
                  variant={editor.isActive('bulletList') ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => editor.chain().focus().toggleBulletList().run()}
                  className="h-8 w-8 p-0"
                  data-testid={`toolbar-bullet-${item.id}`}
                >
                  <span className="text-xs">•</span>
                </Button>
                <Button
                  type="button"
                  variant={editor.isActive('orderedList') ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => editor.chain().focus().toggleOrderedList().run()}
                  className="h-8 w-8 p-0"
                  data-testid={`toolbar-ordered-${item.id}`}
                >
                  <span className="text-xs">1.</span>
                </Button>
              </div>
              {/* Editor */}
              <div className="p-3 min-h-[200px]">
                <EditorContent editor={editor} className="prose prose-sm max-w-none" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Use the toolbar to format text with bold, italic, underline, and lists
            </p>
            <DialogFooter>
              <Button onClick={() => setIsEditingDescription(false)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Gear Checklist Dialog */}
      {gearList.length > 0 && (
        <Dialog open={showGearList} onOpenChange={setShowGearList}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Gear Checklist</DialogTitle>
              <DialogDescription>
                Track gear items for {item.title}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {gearList.map((gear, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 rounded hover:bg-muted/50">
                  <Checkbox
                    checked={gear.checked}
                    onCheckedChange={() => handleToggleGearItem(idx)}
                    data-testid={`checkbox-gear-${item.id}-${idx}`}
                  />
                  <span className={`text-sm flex-1 ${gear.checked ? 'line-through text-muted-foreground' : ''}`}>
                    {gear.name}
                  </span>
                  {gear.photoUrl && (
                    <Badge variant="outline" className="h-5 text-xs bg-green-100 text-green-800">
                      Photo
                    </Badge>
                  )}
                  <label className="cursor-pointer">
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-6"
                      disabled={uploadingGearIndex === idx}
                      asChild
                    >
                      <span>
                        <Upload className="h-3 w-3" />
                        {uploadingGearIndex === idx && <span className="ml-1 text-xs">...</span>}
                      </span>
                    </Button>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleGearPhotoUpload(idx, file);
                      }}
                      data-testid={`input-gear-photo-${item.id}-${idx}`}
                    />
                  </label>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button onClick={() => setShowGearList(false)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Add to Template Dialog */}
      {showAddToTemplate && (
        <AddToTemplateDialog
          open={showAddToTemplate}
          onOpenChange={setShowAddToTemplate}
          scopeItem={item}
        />
      )}

      {/* Render nested child items */}
      {hasChildren && (
        <div className="ml-8">
          {children.map((child) => {
            const childCollapsed = collapsedItems?.has(child.id) ?? false;
            return (
              <SortableScopeItem
                key={child.id}
                item={child}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onToggleSelect={onToggleSelect}
                isSelected={selectedItems.has(child.id)}
                level={level + 1}
                children={allItems?.filter(i => i.parentId === child.id) || []}
                allItems={allItems}
                selectedItems={selectedItems}
                isCollapsed={childCollapsed}
                onToggleCollapse={onToggleCollapse}
                getTypeLabel={getTypeLabel}
                collapsedItems={collapsedItems}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// Linked PO interface for stage display
interface LinkedPOForStage {
  id: string;
  poNumber: string;
  title: string | null;
  supplierName: string | null;
  status: string;
  total: number;
  scopeStageId: string | null;
  createdAt: string;
}

// Linked Schedule Item interface for stage display
interface LinkedScheduleItemForStage {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  startDate: string;
  endDate: string;
  scopeStageId: string | null;
  assignedToName: string | null;
}

interface DroppableStageProps {
  stageData: ScopeStage;
  items: ScopeItem[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (id: string, data: Partial<ScopeItem>) => void;
  onDelete: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onAddItem: (stage: string) => void;
  onEditStage: (stageId: string, newName: string) => void;
  onDeleteStage: (stageId: string) => void;
  onAddNewStage: (afterStageId: string) => void;
  selectedItems: Set<string>;
  isOver?: boolean;
  allItems?: ScopeItem[];
  editingStageId: string | null;
  editingStageName: string;
  setEditingStageId: (id: string | null) => void;
  setEditingStageName: (name: string) => void;
  level?: number;
  isDraggingStage?: boolean;
  children?: ScopeStage[];
  allStages?: ScopeStage[];
  collapsedItems?: Set<string>; // Scope 2.0
  onToggleItemCollapse?: (itemId: string) => void; // Scope 2.0
  getTypeLabel?: (type: string | null | undefined) => string; // Scope 2.0
  linkedPOs?: LinkedPOForStage[]; // Linked Purchase Orders
  onViewPO?: (poId: string) => void; // Handler to view PO details
  linkedScheduleItems?: LinkedScheduleItemForStage[]; // Linked Schedule Items
  onViewScheduleItem?: (itemId: string) => void; // Handler to view schedule item details
  }

function DroppableStage({ 
  stageData, 
  items, 
  isExpanded, 
  onToggleExpand, 
  onUpdate, 
  onDelete, 
  onToggleSelect, 
  onAddItem, 
  onEditStage,
  onDeleteStage,
  onAddNewStage,
  selectedItems, 
  isOver, 
  allItems = [],
  editingStageId,
  editingStageName,
  setEditingStageId,
  setEditingStageName,
  level = 0,
  isDraggingStage = false,
  children = [],
  allStages = [],
  collapsedItems = new Set(), // Scope 2.0
  onToggleItemCollapse, // Scope 2.0
  getTypeLabel, // Scope 2.0
  linkedPOs = [], // Linked Purchase Orders
  onViewPO, // Handler to view PO details
  linkedScheduleItems = [], // Linked Schedule Items
  onViewScheduleItem, // Handler to view schedule item details
}: DroppableStageProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stageData.id });
  
  // Droppable zone for items to be dragged into this stage
  const { setNodeRef: setDroppableRef, isOver: isDroppableOver } = useDroppable({
    id: `stage-${stageData.name}`,
  });
  
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Filter to only top-level items (no parent)
  const topLevelItems = items.filter(item => !item.parentId);

  const isEditing = editingStageId === stageData.id;

  const handleSaveEdit = () => {
    if (editingStageName.trim() && editingStageName.trim() !== stageData.name) {
      onEditStage(stageData.id, editingStageName.trim());
    }
    setEditingStageId(null);
  };

  const handleCancelEdit = () => {
    setEditingStageId(null);
    setEditingStageName(stageData.name);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
    }
  };

  const handleDeleteStage = () => {
    if (items.length > 0) {
      toast({ 
        title: "Cannot delete stage", 
        description: "Stage must be empty before deleting",
        variant: "destructive" 
      });
      return;
    }
    onDeleteStage(stageData.id);
    setShowDeleteDialog(false);
  };

  const hasChildren = children.length > 0;

  // Calculate total value for this stage
  const stageTotal = items.reduce((sum, item) => {
    const qty = item.quantity || 0;
    const rate = item.rate || 0;
    return sum + (qty * rate);
  }, 0);

  return (
    <>
      <div 
        ref={setNodeRef} 
        style={style}
        className={`mb-3 ${level > 0 ? 'ml-8' : ''}`}
      >
        <div 
          className={`rounded-xl bg-background border-2 border-border shadow-sm transition-all duration-200 overflow-hidden ${
            isOver && isDraggingStage ? 'ring-2 ring-[#bba7db]/50 bg-[#bba7db]/10' : ''
          }`}
        >
          {/* Stage Header - h-9, collapsible */}
          <div 
            className="h-9 px-3 flex items-center justify-between border-b border-border bg-muted/60 dark:bg-muted/40 group cursor-pointer hover-elevate"
            onClick={onToggleExpand}
            data-testid={`stage-header-${stageData.id}`}
          >
            <div className="flex items-center gap-2">
              {/* Chevron */}
              {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              
              {/* Drag Handle */}
              <div 
                {...attributes} 
                {...listeners} 
                className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
                data-testid={`drag-handle-stage-${stageData.id}`}
              >
                <GripVertical className="h-4 w-4 text-muted-foreground" />
              </div>

              {/* Stage Name */}
              {isEditing ? (
                <Input
                  value={editingStageName}
                  onChange={(e) => setEditingStageName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={handleSaveEdit}
                  autoFocus
                  className="h-6 text-sm font-semibold px-2"
                  data-testid={`input-edit-stage-${stageData.id}`}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span 
                  className="text-sm font-semibold" 
                  data-testid={`text-stage-name-${stageData.id}`}
                >
                  {stageData.name}
                </span>
              )}

              {/* Item Count Badge */}
              {items.length > 0 && (
                <span className="h-4 px-1.5 text-[10px] font-semibold rounded bg-[#bba7db]/10 text-[#bba7db] border border-[#bba7db]/20">
                  {items.length}
                </span>
              )}

              {/* Total Value */}
              {stageTotal > 0 && (
                <span className="text-[10px] text-muted-foreground font-medium">
                  ${stageTotal.toLocaleString()}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {/* Edit Button */}
              {!isEditing && (
                <button
                  className="h-6 w-6 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover-elevate"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingStageId(stageData.id);
                    setEditingStageName(stageData.name);
                  }}
                  data-testid={`button-edit-stage-${stageData.id}`}
                >
                  <Pen className="h-3 w-3" />
                </button>
              )}

              {/* Add Item */}
              <button
                className="h-6 px-2 text-[10px] font-medium rounded-md border border-border/50 hover-elevate active-elevate-2 flex items-center gap-0.5"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddItem(stageData.name);
                }}
                data-testid={`button-add-item-${stageData.name.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Plus className="h-3 w-3" />
                <span>Item</span>
              </button>

              {/* Stage Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="h-6 w-6 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover-elevate"
                    onClick={(e) => e.stopPropagation()}
                    data-testid={`button-menu-stage-${stageData.id}`}
                  >
                    <span className="text-sm leading-none">⋯</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem 
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddNewStage(stageData.id);
                    }}
                    data-testid={`menu-add-stage-after-${stageData.id}`}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Stage
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDeleteDialog(true);
                    }}
                    className="text-destructive"
                    data-testid={`menu-delete-stage-${stageData.id}`}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Stage
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          
          {/* Items Container - collapsible */}
          {isExpanded && (
            <div ref={setDroppableRef} className="p-2">
              {topLevelItems.length === 0 ? (
                <div 
                  className={`text-center text-muted-foreground text-xs border-2 border-dashed rounded-lg transition-all hover:h-32 hover:shadow-md flex items-center justify-center ${isDroppableOver ? 'bg-primary/5 border-primary' : ''}`}
                  style={{ 
                    height: '60px',
                    borderColor: isDroppableOver ? CASVA_LILAC : CASVA_LILAC + '40'
                  }}
                >
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-2xl opacity-40">↕</span>
                    <span className="text-xs opacity-60">Drop here</span>
                  </div>
                </div>
              ) : (
                <SortableContext
                  items={topLevelItems.map(item => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {topLevelItems.map((item) => (
                    <SortableScopeItem
                      key={item.id}
                      item={item}
                      onUpdate={onUpdate}
                      onDelete={onDelete}
                      onToggleSelect={onToggleSelect}
                      isSelected={selectedItems.has(item.id)}
                      children={allItems.filter(i => i.parentId === item.id)}
                      allItems={allItems}
                      selectedItems={selectedItems}
                      isCollapsed={collapsedItems.has(item.id)} // Scope 2.0
                      onToggleCollapse={onToggleItemCollapse} // Scope 2.0
                      getTypeLabel={getTypeLabel} // Scope 2.0
                      collapsedItems={collapsedItems} // Scope 2.0: pass down collapsed items set
                    />
                  ))}
                </SortableContext>
              )}
              
              {/* Linked Purchase Orders */}
              {linkedPOs.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide px-2">
                    Linked Purchase Orders
                  </div>
                  {linkedPOs.map((po) => (
                    <div
                      key={po.id}
                      className="h-10 flex items-center gap-3 px-3 rounded-lg border border-border/50 bg-background/80 hover-elevate cursor-pointer group"
                      onClick={() => onViewPO?.(po.id)}
                      data-testid={`linked-po-${po.id}`}
                    >
                      <Package className="h-4 w-4 text-[#bba7db]" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{po.poNumber}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            po.status === 'completed' || po.status === 'billed' 
                              ? 'bg-green-100 text-green-800' 
                              : po.status === 'draft' 
                                ? 'bg-gray-100 text-gray-600' 
                                : 'bg-amber-100 text-amber-800'
                          }`}>
                            {po.status.replace('_', ' ')}
                          </span>
                        </div>
                        {(po.title || po.supplierName) && (
                          <div className="text-xs text-muted-foreground truncate">
                            {po.title && <span>{po.title}</span>}
                            {po.title && po.supplierName && <span> - </span>}
                            {po.supplierName && <span>{po.supplierName}</span>}
                          </div>
                        )}
                      </div>
                      <div className="text-sm font-medium">
                        ${(po.total / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  ))}
                </div>
              )}
              
              {/* Linked Schedule Items */}
              {linkedScheduleItems.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide px-2">
                    Linked Schedule Items
                  </div>
                  {linkedScheduleItems.map((item) => (
                    <div
                      key={item.id}
                      className="h-10 flex items-center gap-3 px-3 rounded-lg border border-border/50 bg-background/80 hover-elevate cursor-pointer group"
                      onClick={() => onViewScheduleItem?.(item.id)}
                      data-testid={`linked-schedule-item-${item.id}`}
                    >
                      <CalendarDays className="h-4 w-4 text-[#bba7db]" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{item.name}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            item.status === 'completed' 
                              ? 'bg-green-100 text-green-800' 
                              : item.status === 'in_progress' 
                                ? 'bg-blue-100 text-blue-800' 
                                : item.status === 'on_hold'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-gray-100 text-gray-600'
                          }`}>
                            {item.status.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {item.startDate && new Date(item.startDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                          {item.endDate && ` - ${new Date(item.endDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`}
                          {item.assignedToName && <span className="ml-2">({item.assignedToName})</span>}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Render nested child stages */}
      {hasChildren && isExpanded && (
        <div className="mt-2">
          {children.map((childStage) => {
            const childItems = allItems.filter(item => item.stage === childStage.name);
            return (
              <DroppableStage
                key={childStage.id}
                stageData={childStage}
                items={childItems}
                isExpanded={stageExpanded[childStage.name] ?? true}
                onToggleExpand={onToggleExpand}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onToggleSelect={onToggleSelect}
                onAddItem={onAddItem}
                onEditStage={onEditStage}
                onDeleteStage={onDeleteStage}
                onAddNewStage={onAddNewStage}
                selectedItems={selectedItems}
                isOver={isOver}
                allItems={allItems}
                editingStageId={editingStageId}
                editingStageName={editingStageName}
                setEditingStageId={setEditingStageId}
                setEditingStageName={setEditingStageName}
                level={level + 1}
                isDraggingStage={isDraggingStage}
                children={allStages.filter(s => s.parentId === childStage.id)}
                allStages={allStages}
                collapsedItems={collapsedItems} // Scope 2.0
                onToggleItemCollapse={onToggleItemCollapse} // Scope 2.0
                getTypeLabel={getTypeLabel} // Scope 2.0
                linkedPOs={[]} // Child stages don't have access to full PO map yet
                onViewPO={onViewPO}
                linkedScheduleItems={[]} // Child stages don't have access to full schedule item map yet
                onViewScheduleItem={onViewScheduleItem}
              />
            );
          })}
        </div>
      )}

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Stage</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the "{stageData.name}" stage? This action cannot be undone.
              {items.length > 0 && (
                <span className="block mt-2 text-destructive font-medium">
                  This stage contains {items.length} item{items.length !== 1 ? 's' : ''}. Please move or delete all items first.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteStage}
              disabled={items.length > 0}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid={`confirm-delete-stage-${stageData.id}`}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// PDF Document Component
const ScopePDF = ({ stage, items, hideClientCosts = false }: { stage: string; items: ScopeItem[]; hideClientCosts?: boolean }) => (
  <Document>
    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.header}>
        <Text style={pdfStyles.title}>Scope of Works - {stage}</Text>
        {hideClientCosts && (
          <Text style={pdfStyles.subtitle}>Client Version</Text>
        )}
      </View>
      {items.map((item, index) => (
        <View key={item.id} style={pdfStyles.item}>
          <Text style={pdfStyles.itemNumber}>{index + 1}.</Text>
          <View style={pdfStyles.itemContent}>
            <Text style={pdfStyles.itemTitle}>{item.title}</Text>
            {item.description && (
              <Text style={pdfStyles.itemDescription}>{tiptapJsonToText(item.description)}</Text>
            )}
            {!hideClientCosts && item.costCodeTitle && (
              <Text style={pdfStyles.itemCostCode}>Cost Code: {item.costCodeTitle}</Text>
            )}
          </View>
        </View>
      ))}
    </Page>
  </Document>
);

const pdfStyles = StyleSheet.create({
  page: { padding: 40, fontSize: 11 },
  header: { marginBottom: 20, borderBottom: '2px solid #bba7db' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#bba7db', marginBottom: 10 },
  subtitle: { fontSize: 12, color: '#999', fontStyle: 'italic', marginTop: 4 },
  item: { flexDirection: 'row', marginBottom: 12 },
  itemNumber: { width: 30, fontWeight: 'bold' },
  itemContent: { flex: 1 },
  itemTitle: { fontWeight: 'bold', marginBottom: 4 },
  itemDescription: { color: '#666', fontSize: 10 },
  itemCostCode: { color: '#bba7db', fontSize: 9, marginTop: 4, fontStyle: 'italic' },
});

// Scope item types
const SCOPE_TYPES = ['e-note', 'scope', 'note', 'tool', 'material', 'proposal', 'checklist'] as const;
type ScopeItemType = typeof SCOPE_TYPES[number];

// Checklist item type for scope items with itemType="checklist"
type ChecklistItem = {
  id: string;
  text: string;
  completed: boolean;
};

export default function ProjectScope() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const pageTitle = usePageTitle({ pageName: "Scope" });
  
  const [stageExpanded, setStageExpanded] = useState<StageState>({});
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [isPushDialogOpen, setIsPushDialogOpen] = useState(false);
  const [selectedEstimateId, setSelectedEstimateId] = useState<string>("");
  const [isRfqDialogOpen, setIsRfqDialogOpen] = useState(false);
  const [isPoDialogOpen, setIsPoDialogOpen] = useState(false);
  const [isPdfDialogOpen, setIsPdfDialogOpen] = useState(false);
  const [pdfStage, setPdfStage] = useState<string>('');
  const [hideClientCosts, setHideClientCosts] = useState(false); // Client toggle for PDF
  const [isAddItemDialogOpen, setIsAddItemDialogOpen] = useState(false);
  const [addItemStage, setAddItemStage] = useState<string | null>(null);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemDescription, setNewItemDescription] = useState("");
  const [newItemType, setNewItemType] = useState<ScopeItemType>("scope"); // Scope 2.0: item type
  
  // Scope 2.0: Type filtering
  const [activeTypeFilters, setActiveTypeFilters] = useState<Set<ScopeItemType>>(new Set(SCOPE_TYPES));
  const [collapsedItems, setCollapsedItems] = useState<Set<string>>(new Set()); // Minimize/expand
  
  // Stage editing state
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [editingStageName, setEditingStageName] = useState("");
  const [isAddStageDialogOpen, setIsAddStageDialogOpen] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [addStageAfterId, setAddStageAfterId] = useState<string | null>(null);
  
  // Import from Estimate state
  const [isImportFromEstimateOpen, setIsImportFromEstimateOpen] = useState(false);
  const [selectedEstimateForImport, setSelectedEstimateForImport] = useState<string | null>(null);
  const [selectedGroupsToImport, setSelectedGroupsToImport] = useState<Set<string>>(new Set());

  // Tiptap editor for Add Item dialog
  const addItemEditor = useEditor({
    extensions: [StarterKit, Underline],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[150px] p-3',
      },
    },
  });

  // Fetch scope items
  const { data: scopeItems = [], isLoading } = useQuery<ScopeItem[]>({
    queryKey: [`/api/projects/${projectId}/scope`],
    enabled: !!projectId,
  });

  // Fetch templates
  const { data: templates = [] } = useQuery<ScopeTemplate[]>({
    queryKey: ['/api/scope-templates'],
  });

  // Fetch estimates
  const { data: estimates = [] } = useQuery<Estimate[]>({
    queryKey: ['/api/estimates'],
    select: (data) => data.filter(est => est.projectId === projectId),
  });

  // Fetch estimate groups for the selected estimate (for fuzzy match import)
  interface EstimateGroup {
    id: string;
    name: string;
    description?: string;
    order: number;
    parentGroupId?: string | null;
  }
  
  const { data: estimateGroups = [] } = useQuery<EstimateGroup[]>({
    queryKey: ['/api/estimates', selectedEstimateForImport, 'groups'],
    queryFn: async () => {
      if (!selectedEstimateForImport) return [];
      const response = await fetch(`/api/estimates/${selectedEstimateForImport}/groups`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!selectedEstimateForImport && isImportFromEstimateOpen,
  });

  // Fetch scope stages
  const { data: scopeStages = [], isLoading: isLoadingStages } = useQuery<ScopeStage[]>({
    queryKey: [`/api/projects/${projectId}/scope-stages`],
    enabled: !!projectId,
  });

  // Fetch purchase orders for the project (to display linked POs in scope)
  interface LinkedPurchaseOrder {
    id: string;
    poNumber: string;
    title: string | null;
    supplierName: string | null;
    status: string;
    total: number;
    scopeStageId: string | null;
    createdAt: string;
  }
  
  const { data: projectPOs = [] } = useQuery<LinkedPurchaseOrder[]>({
    queryKey: ['/api/purchase-orders', { projectId }],
    queryFn: async () => {
      const response = await fetch(`/api/purchase-orders?projectId=${projectId}`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      const data = await response.json();
      return data.purchaseOrders || [];
    },
    enabled: !!projectId,
  });

  // Group POs by stage
  const posByStage = useMemo(() => {
    const grouped: Record<string, LinkedPurchaseOrder[]> = {};
    projectPOs.forEach((po) => {
      if (po.scopeStageId) {
        if (!grouped[po.scopeStageId]) {
          grouped[po.scopeStageId] = [];
        }
        grouped[po.scopeStageId].push(po);
      }
    });
    return grouped;
  }, [projectPOs]);

  // Fetch schedule items for the project (to display linked schedule items in scope)
  interface LinkedScheduleItem {
    id: string;
    name: string;
    description: string | null;
    type: string;
    status: string;
    startDate: string;
    endDate: string;
    scopeStageId: string | null;
    assignedToName: string | null;
  }
  
  const { data: projectScheduleItems = [] } = useQuery<LinkedScheduleItem[]>({
    queryKey: ['/api/schedule-items', { projectId }],
    queryFn: async () => {
      const response = await fetch(`/api/schedule-items?projectId=${projectId}`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      const data = await response.json();
      return data.items || data || [];
    },
    enabled: !!projectId,
  });

  // Group schedule items by stage
  const scheduleItemsByStage = useMemo(() => {
    const grouped: Record<string, LinkedScheduleItem[]> = {};
    projectScheduleItems.forEach((item) => {
      if (item.scopeStageId) {
        if (!grouped[item.scopeStageId]) {
          grouped[item.scopeStageId] = [];
        }
        grouped[item.scopeStageId].push(item);
      }
    });
    return grouped;
  }, [projectScheduleItems]);

  // Initialize default stages if empty
  const initializeStagesMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/projects/${projectId}/scope-stages/initialize`, 'POST');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope-stages`] });
      toast({ title: "Default stages initialized" });
    },
  });

  // Create stage mutation
  const createStageMutation = useMutation({
    mutationFn: async ({ name, displayOrder }: { name: string; displayOrder: number }) => {
      return apiRequest(`/api/projects/${projectId}/scope-stages`, 'POST', {
        projectId,
        name,
        displayOrder,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope-stages`] });
      toast({ title: "Stage added successfully" });
    },
  });

  // Update stage mutation with optimistic updates to prevent flickering
  const updateStageMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      return apiRequest(`/api/scope-stages/${id}`, 'PATCH', { name });
    },
    onMutate: async ({ id, name }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: [`/api/projects/${projectId}/scope-stages`] });
      
      // Snapshot the previous value
      const previousStages = queryClient.getQueryData<ScopeStage[]>([`/api/projects/${projectId}/scope-stages`]);
      
      // Optimistically update the cache
      queryClient.setQueryData<ScopeStage[]>([`/api/projects/${projectId}/scope-stages`], (old) => {
        if (!old) return old;
        return old.map(stage => stage.id === id ? { ...stage, name } : stage);
      });
      
      return { previousStages };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousStages) {
        queryClient.setQueryData([`/api/projects/${projectId}/scope-stages`], context.previousStages);
      }
      toast({ title: "Failed to update stage", variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope-stages`] });
    },
    onSuccess: () => {
      toast({ title: "Stage updated" });
    },
  });

  // Delete stage mutation
  const deleteStageMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/scope-stages/${id}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope-stages`] });
      toast({ title: "Stage deleted successfully" });
    },
  });

  // Reorder stages mutation with optimistic updates
  const reorderStagesMutation = useMutation({
    mutationFn: async (updates: { id: string; displayOrder: number; parentId?: string | null }[]) => {
      return apiRequest('/api/scope-stages/reorder', 'POST', { updates });
    },
    onMutate: async (updates) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: [`/api/projects/${projectId}/scope-stages`] });
      
      // Snapshot the previous value
      const previousStages = queryClient.getQueryData<ScopeStage[]>([`/api/projects/${projectId}/scope-stages`]);
      
      // Optimistically update the cache
      queryClient.setQueryData<ScopeStage[]>([`/api/projects/${projectId}/scope-stages`], (old) => {
        if (!old) return old;
        return old.map(stage => {
          const update = updates.find(u => u.id === stage.id);
          if (update) {
            return { 
              ...stage, 
              displayOrder: update.displayOrder,
              parentId: update.parentId !== undefined ? update.parentId : stage.parentId
            };
          }
          return stage;
        });
      });
      
      return { previousStages };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousStages) {
        queryClient.setQueryData([`/api/projects/${projectId}/scope-stages`], context.previousStages);
      }
      toast({ title: "Failed to reorder stages", variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope-stages`] });
    },
  });

  // Update mutation with optimistic updates for better UX
  const updateItemMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ScopeItem> }) => {
      return apiRequest(`/api/scope/${id}`, 'PATCH', data);
    },
    onMutate: async ({ id, data }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: [`/api/projects/${projectId}/scope`] });
      
      // Snapshot the previous value
      const previousItems = queryClient.getQueryData<ScopeItem[]>([`/api/projects/${projectId}/scope`]);
      
      // Optimistically update the cache
      queryClient.setQueryData<ScopeItem[]>([`/api/projects/${projectId}/scope`], (old) => {
        if (!old) return old;
        return old.map(item => item.id === id ? { ...item, ...data } : item);
      });
      
      return { previousItems };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousItems) {
        queryClient.setQueryData([`/api/projects/${projectId}/scope`], context.previousItems);
      }
      toast({ title: "Failed to update item", variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope`] });
    },
  });

  // Delete mutation
  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/scope/${id}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope`] });
      toast({ title: "Scope item deleted" });
    },
  });

  // Apply template mutation
  const applyTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      return apiRequest(`/api/scope-templates/${templateId}/apply`, 'POST', { projectId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope`] });
      setIsTemplateDialogOpen(false);
      toast({ title: "Template applied successfully - 12 items added!" });
    },
  });

  // Push to estimate mutation
  const pushToEstimateMutation = useMutation({
    mutationFn: async ({ scopeItemIds, estimateId }: { scopeItemIds: string[]; estimateId: string }) => {
      return apiRequest('/api/scope/push-to-estimate', 'POST', { scopeItemIds, estimateId });
    },
    onSuccess: () => {
      setIsPushDialogOpen(false);
      setSelectedItems(new Set());
      toast({ title: "Items pushed to estimate successfully!" });
    },
  });

  // Create scope item mutation
  const createItemMutation = useMutation({
    mutationFn: async ({ title, description, stage }: { title: string; description: string; stage: string }) => {
      return apiRequest(`/api/projects/${projectId}/scope`, 'POST', {
        title,
        description, // Store as HTML (consistent with existing items)
        stage,
        displayOrder: scopeItems.filter(i => i.stage === stage).length,
        needsRfi: false,
        needsRfq: false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope`] });
      setIsAddItemDialogOpen(false);
      setNewItemTitle("");
      setNewItemDescription("");
      toast({ title: "Scope item added successfully!" });
    },
  });

  // Create RFQ mutation
  const createRfqMutation = useMutation({
    mutationFn: async (scopeItemIds: string[]) => {
      return apiRequest('/api/scope/create-rfq', 'POST', { scopeItemIds, projectId });
    },
    onSuccess: () => {
      setIsRfqDialogOpen(false);
      setSelectedItems(new Set());
      toast({ title: "RFQ created successfully!" });
    },
  });

  // Create PO mutation
  const createPoMutation = useMutation({
    mutationFn: async (scopeItemIds: string[]) => {
      return apiRequest('/api/scope/create-po', 'POST', { scopeItemIds, projectId });
    },
    onSuccess: () => {
      setIsPoDialogOpen(false);
      setSelectedItems(new Set());
      toast({ title: "PO created successfully with auto-number!" });
    },
  });

  // DnD sensors for items with activation constraint for better UX
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3, // 3px movement before drag starts - matches estimate drag behavior
      },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Separate DnD sensors for stages with same activation constraint
  const stageSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3, // 3px movement before drag starts - matches estimate drag behavior
      },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Stage drag state
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [overStageId, setOverStageId] = useState<string | null>(null);

  // Item drag handlers
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    setOverId(event.over?.id as string || null);
  };

  // Stage drag handlers
  const handleStageDragStart = (event: DragStartEvent) => {
    setActiveStageId(event.active.id as string);
  };

  const handleStageDragOver = (event: DragOverEvent) => {
    setOverStageId(event.over?.id as string || null);
  };

  // Helper function to check if a stage is a descendant of another
  const isStageDescendant = (potentialDescendant: ScopeStage, ancestor: ScopeStage): boolean => {
    if (!potentialDescendant.parentId) return false;
    if (potentialDescendant.parentId === ancestor.id) return true;
    const parent = scopeStages.find(s => s.id === potentialDescendant.parentId);
    if (!parent) return false;
    return isStageDescendant(parent, ancestor);
  };

  const handleStageDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveStageId(null);
    setOverStageId(null);
    
    if (!over || active.id === over.id) return;

    const activeStage = scopeStages.find(s => s.id === active.id);
    const overStage = scopeStages.find(s => s.id === over.id);
    
    if (!activeStage || !overStage) return;

    // Prevent nesting cycles
    if (isStageDescendant(overStage, activeStage)) {
      toast({ 
        title: "Cannot nest stage", 
        description: "Cannot nest a parent stage under its own child",
        variant: "destructive" 
      });
      return;
    }

    // Determine if this is a reorder or a nest operation
    // If both stages have the same parent, it's a reorder
    // Otherwise, nest the active under the over
    const isSameParent = activeStage.parentId === overStage.parentId;
    
    if (isSameParent) {
      // Reorder within same parent level
      const siblingStages = scopeStages.filter(s => s.parentId === activeStage.parentId);
      const oldIndex = siblingStages.findIndex(s => s.id === active.id);
      const newIndex = siblingStages.findIndex(s => s.id === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const reordered = arrayMove(siblingStages, oldIndex, newIndex);
        const updates = reordered.map((stage, index) => ({
          id: stage.id,
          displayOrder: index,
          parentId: stage.parentId || null,
        }));
        
        reorderStagesMutation.mutate(updates);
        toast({ title: "Stages reordered" });
      }
    } else {
      // Nest active stage under over stage
      // Get all stages at the same level as the target
      const targetSiblings = scopeStages.filter(s => s.parentId === overStage.id);
      const newDisplayOrder = targetSiblings.length;
      
      // Update the dragged stage to be a child of the target
      const updates = [{
        id: activeStage.id,
        displayOrder: newDisplayOrder,
        parentId: overStage.id,
      }];
      
      reorderStagesMutation.mutate(updates);
      toast({ title: `"${activeStage.name}" nested under "${overStage.name}"` });
    }
  };

  // Initialize default stages on first load
  if (!isLoadingStages && scopeStages.length === 0 && projectId && !initializeStagesMutation.isPending) {
    initializeStagesMutation.mutate();
  }

  // Initialize stage expanded state when stages load
  if (scopeStages.length > 0 && Object.keys(stageExpanded).length === 0) {
    const initialExpanded: StageState = {};
    scopeStages.forEach(stage => {
      initialExpanded[stage.name] = true;
    });
    setStageExpanded(initialExpanded);
    
    // Set first stage as default for PDF if not set
    if (!pdfStage && scopeStages[0]) {
      setPdfStage(scopeStages[0].name);
    }
  }

  // Helper function to check if an item is a descendant of another
  const isDescendant = (potentialDescendant: ScopeItem, ancestor: ScopeItem): boolean => {
    if (!potentialDescendant.parentId) return false;
    if (potentialDescendant.parentId === ancestor.id) return true;
    const parent = scopeItems.find(i => i.id === potentialDescendant.parentId);
    if (!parent) return false;
    return isDescendant(parent, ancestor);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverId(null);
    
    if (!over) return;

    const overId = over.id as string;
    const activeItem = scopeItems.find(i => i.id === active.id);
    if (!activeItem) return;
    
    // Check if dragged over a stage
    if (overId.startsWith('stage-')) {
      const targetStage = overId.replace('stage-', '');
      if (activeItem.stage !== targetStage) {
        updateItemMutation.mutate({ 
          id: activeItem.id, 
          data: { stage: targetStage, parentId: null } 
        });
        toast({ title: `Moved to ${targetStage}` });
      }
      return;
    }

    // Check if dragged over another item (nest it)
    const overItem = scopeItems.find(i => i.id === overId);
    if (overItem && overItem.id !== activeItem.id && overItem.id !== activeItem.parentId) {
      // Prevent creating cycles - don't allow dragging a parent onto its descendant
      if (isDescendant(overItem, activeItem)) {
        toast({ 
          title: "Cannot nest item", 
          description: "Cannot nest a parent under its own child",
          variant: "destructive" 
        });
        return;
      }
      
      // Nest the active item under the over item
      updateItemMutation.mutate({
        id: activeItem.id,
        data: { 
          parentId: overItem.id,
          stage: overItem.stage // Inherit parent's stage
        }
      });
      toast({ title: `Nested under ${overItem.title}` });
      return;
    }

    // Reorder within same stage and parent level
    if (activeItem && overItem && activeItem.stage === overItem.stage && activeItem.parentId === overItem.parentId) {
      const siblingItems = scopeItems.filter(i => 
        i.stage === activeItem.stage && i.parentId === activeItem.parentId
      );
      const oldIndex = siblingItems.findIndex(i => i.id === active.id);
      const newIndex = siblingItems.findIndex(i => i.id === overId);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(siblingItems, oldIndex, newIndex);
        const updates = reordered.map((item, index) => ({
          id: item.id,
          displayOrder: index,
          parentId: item.parentId || null,
        }));
        
        apiRequest('/api/scope/reorder', 'POST', { updates }).then(() => {
          queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope`] });
        }).catch((error) => {
          toast({ title: "Failed to reorder", variant: "destructive" });
        });
      }
    }
  };

  const handleUpdateItem = (id: string, data: Partial<ScopeItem>) => {
    updateItemMutation.mutate({ id, data });
  };

  const handleDeleteItem = (id: string) => {
    deleteItemMutation.mutate(id);
  };

  // Handle view PO - navigate to the PO page
  const handleViewPO = (poId: string) => {
    window.location.href = `/projects/${projectId}/purchase-orders/${poId}`;
  };

  // Handle view schedule item - navigate to the schedule page
  const handleViewScheduleItem = (itemId: string) => {
    window.location.href = `/projects/${projectId}/schedule`;
  };

  const handleToggleSelect = (id: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItems(newSelected);
  };

  const handleAddItem = (stage: string) => {
    setAddItemStage(stage);
    setIsAddItemDialogOpen(true);
  };

  const handleCreateItem = () => {
    if (!newItemTitle.trim() || !addItemStage || !addItemEditor) return;
    
    // Get HTML from Tiptap editor (maintains compatibility with existing editing/display)
    const descriptionHtml = addItemEditor.getHTML();
    
    createItemMutation.mutate({
      title: newItemTitle.trim(),
      description: descriptionHtml,
      stage: addItemStage,
      itemType: newItemType, // Scope 2.0: Include item type
    });
    
    // Clear editor and reset type after creation
    addItemEditor.commands.clearContent();
    setNewItemType("scope");
  };

  const toggleStage = (stageName: string) => {
    setStageExpanded(prev => ({ ...prev, [stageName]: !prev[stageName] }));
  };

  // Collapse/Expand all stages
  const toggleAllStages = () => {
    const allExpanded = scopeStages.every(stage => stageExpanded[stage.name]);
    const newExpanded: StageState = {};
    scopeStages.forEach(stage => {
      newExpanded[stage.name] = !allExpanded;
    });
    setStageExpanded(newExpanded);
  };

  // Check if all stages are expanded
  const allStagesExpanded = scopeStages.length > 0 && scopeStages.every(stage => stageExpanded[stage.name]);

  const getItemsByStage = (stageName: string) => {
    return scopeItems
      .filter(item => item.stage === stageName)
      .filter(item => activeTypeFilters.has((item.itemType as ScopeItemType) || 'scope'))  // Scope 2.0: Type filtering
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
  };

  // Scope 2.0: Toggle type filter
  const toggleTypeFilter = (type: ScopeItemType) => {
    const newFilters = new Set(activeTypeFilters);
    if (newFilters.has(type)) {
      newFilters.delete(type);
    } else {
      newFilters.add(type);
    }
    setActiveTypeFilters(newFilters);
  };

  // Scope 2.0: Toggle item collapse/expand
  const toggleItemCollapse = (itemId: string) => {
    const newCollapsed = new Set(collapsedItems);
    if (newCollapsed.has(itemId)) {
      newCollapsed.delete(itemId);
    } else {
      newCollapsed.add(itemId);
    }
    setCollapsedItems(newCollapsed);
  };

  // Scope 2.0: Type label helper
  const getTypeLabel = (type: string | null | undefined): string => {
    const typeMap: Record<string, string> = {
      'e-note': 'E-NOTE',
      'scope': 'SCOPE',
      'note': 'NOTE',
      'tool': 'TOOL',
      'material': 'MATERIAL',
      'proposal': 'PROPOSAL',
      'checklist': 'CHECKLIST',
    };
    return typeMap[type || 'scope'] || 'SCOPE';
  };

  const handleEditStage = (stageId: string, newName: string) => {
    updateStageMutation.mutate({ id: stageId, name: newName });
  };

  const handleDeleteStage = (stageId: string) => {
    deleteStageMutation.mutate(stageId);
  };

  const handleAddNewStage = (afterStageId: string) => {
    setAddStageAfterId(afterStageId);
    setIsAddStageDialogOpen(true);
  };

  const handleCreateNewStage = () => {
    if (!newStageName.trim() || !addStageAfterId) return;
    
    const afterStage = scopeStages.find(s => s.id === addStageAfterId);
    if (!afterStage) return;
    
    const displayOrder = afterStage.displayOrder + 1;
    
    createStageMutation.mutate({
      name: newStageName.trim(),
      displayOrder,
    });
    
    setIsAddStageDialogOpen(false);
    setNewStageName("");
    setAddStageAfterId(null);
  };

  // Fuzzy matching helper - checks if a stage already exists with similar name
  const fuzzyMatchStage = (groupName: string): { matched: boolean; existingStage?: string } => {
    const normalizedGroupName = groupName.toLowerCase().trim();
    for (const stage of scopeStages) {
      const normalizedStageName = stage.name.toLowerCase().trim();
      // Exact match
      if (normalizedStageName === normalizedGroupName) {
        return { matched: true, existingStage: stage.name };
      }
      // Contains match (either direction)
      if (normalizedStageName.includes(normalizedGroupName) || normalizedGroupName.includes(normalizedStageName)) {
        return { matched: true, existingStage: stage.name };
      }
      // Word similarity (at least 2 words matching)
      const groupWords = normalizedGroupName.split(/\s+/);
      const stageWords = normalizedStageName.split(/\s+/);
      const matchingWords = groupWords.filter(gw => stageWords.some(sw => sw === gw || sw.includes(gw) || gw.includes(sw)));
      if (matchingWords.length >= Math.min(2, groupWords.length)) {
        return { matched: true, existingStage: stage.name };
      }
    }
    return { matched: false };
  };

  // Import stages from estimate groups
  const handleImportFromEstimate = async () => {
    if (!selectedEstimateForImport || selectedGroupsToImport.size === 0) return;
    
    const groupsToImport = estimateGroups
      .filter(g => selectedGroupsToImport.has(g.id))
      .sort((a, b) => a.order - b.order);
    
    const maxDisplayOrder = scopeStages.length > 0 
      ? Math.max(...scopeStages.map(s => s.displayOrder)) + 1 
      : 0;
    
    let importCount = 0;
    for (let i = 0; i < groupsToImport.length; i++) {
      const group = groupsToImport[i];
      try {
        await apiRequest(`/api/projects/${projectId}/scope-stages`, 'POST', {
          projectId,
          name: group.name,
          displayOrder: maxDisplayOrder + i,
        });
        importCount++;
      } catch (err) {
        console.error('Failed to import stage:', group.name, err);
      }
    }
    
    queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope-stages`] });
    toast({ title: `Imported ${importCount} stage${importCount !== 1 ? 's' : ''} from estimate` });
    
    // Reset state
    setIsImportFromEstimateOpen(false);
    setSelectedEstimateForImport(null);
    setSelectedGroupsToImport(new Set());
  };

  // Toggle group selection for import
  const toggleGroupForImport = (groupId: string) => {
    const newSet = new Set(selectedGroupsToImport);
    if (newSet.has(groupId)) {
      newSet.delete(groupId);
    } else {
      newSet.add(groupId);
    }
    setSelectedGroupsToImport(newSet);
  };

  // Auto-select new groups (ones that don't have a fuzzy match)
  const selectAllNewGroups = () => {
    const newGroups = estimateGroups.filter(g => !fuzzyMatchStage(g.name).matched);
    setSelectedGroupsToImport(new Set(newGroups.map(g => g.id)));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading scope...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Row 1: Title */}
      <div className="h-9 flex items-center px-3 border-b border-border/50 bg-background">
        <div className="flex items-center gap-2">
          <ListTree className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold" data-testid="text-page-title">{pageTitle}</h1>
        </div>
      </div>

      {/* Row 2: Filters & Actions */}
      <div className="h-9 flex items-center justify-between px-3 border-b border-border/50 bg-background">
        {/* Left: Type Filters */}
        <div className="flex items-center gap-1">
          {SCOPE_TYPES.map((type) => {
            const isActive = activeTypeFilters.has(type);
            return (
              <button
                key={type}
                onClick={() => toggleTypeFilter(type)}
                className={`h-6 px-2 text-[10px] font-medium rounded-md border transition-all hover-elevate active-elevate-2 ${
                  isActive 
                    ? 'bg-[#bba7db]/10 text-[#bba7db] border-[#bba7db]/20' 
                    : 'bg-background text-muted-foreground border-border/50'
                }`}
                data-testid={`chip-filter-${type}`}
              >
                {getTypeLabel(type)}
              </button>
            );
          })}
        </div>

        {/* Right: Action Buttons */}
        <div className="flex items-center gap-1">
          {/* Collapse/Expand All Stages */}
          {scopeStages.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleAllStages}
                  className="h-6 w-6 flex items-center justify-center rounded-md border border-border/50 hover-elevate active-elevate-2"
                  data-testid="button-toggle-all-stages"
                >
                  {allStagesExpanded ? (
                    <ChevronsDownUp className="h-3 w-3" />
                  ) : (
                    <ChevronsUpDown className="h-3 w-3" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{allStagesExpanded ? 'Collapse All' : 'Expand All'}</p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Add Stage */}
          <Dialog open={isAddStageDialogOpen} onOpenChange={setIsAddStageDialogOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DialogTrigger asChild>
                  <button 
                    className="h-6 w-6 flex items-center justify-center rounded-md border border-border/50 hover-elevate active-elevate-2"
                    onClick={() => {
                      if (scopeStages.length > 0) {
                        setAddStageAfterId(scopeStages[scopeStages.length - 1].id);
                      }
                    }}
                    data-testid="button-add-stage"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </DialogTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>Add Stage</p>
              </TooltipContent>
            </Tooltip>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Stage</DialogTitle>
                <DialogDescription>
                  Create a new stage for your scope
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Stage Name</Label>
                  <Input
                    value={newStageName}
                    onChange={(e) => setNewStageName(e.target.value)}
                    placeholder="Enter stage name"
                    data-testid="input-new-stage-name"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleCreateNewStage}
                  disabled={!newStageName.trim()}
                  data-testid="button-confirm-add-stage"
                >
                  Create Stage
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Load Template */}
          <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DialogTrigger asChild>
                  <button className="h-6 w-6 flex items-center justify-center rounded-md border border-border/50 hover-elevate active-elevate-2" data-testid="button-load-template">
                    <FileDown className="h-3 w-3" />
                  </button>
                </DialogTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>Load Template</p>
              </TooltipContent>
            </Tooltip>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Apply Scope Template</DialogTitle>
                <DialogDescription>
                  Choose a template to populate your project scope
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Template</Label>
                  <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => selectedTemplate && applyTemplateMutation.mutate(selectedTemplate)}
                  disabled={!selectedTemplate || applyTemplateMutation.isPending}
                >
                  {applyTemplateMutation.isPending ? "Applying..." : "Apply Template"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Import from Estimate */}
          {estimates.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button 
                  onClick={() => setIsImportFromEstimateOpen(true)}
                  className="h-6 px-2 text-[10px] font-medium rounded-md border border-border/50 hover-elevate active-elevate-2 flex items-center gap-1" 
                  data-testid="button-import-from-estimate"
                >
                  <FileText className="h-3 w-3" />
                  <span>Import Stages</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Import stages from estimate groups</p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Push to Estimate */}
          {selectedItems.size > 0 && estimates.length > 0 && (
            <Dialog open={isPushDialogOpen} onOpenChange={setIsPushDialogOpen}>
              <DialogTrigger asChild>
                <button className="h-6 px-2 text-[10px] font-medium rounded-md border border-border/50 hover-elevate active-elevate-2 flex items-center gap-1" data-testid="button-push-to-estimate">
                  <DollarSign className="h-3 w-3" />
                  <span>Push ({selectedItems.size})</span>
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Push to Estimate</DialogTitle>
                  <DialogDescription>
                    Select an estimate to push {selectedItems.size} selected items
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Estimate</Label>
                    <Select value={selectedEstimateId} onValueChange={setSelectedEstimateId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an estimate" />
                      </SelectTrigger>
                      <SelectContent>
                        {estimates.map((est) => (
                          <SelectItem key={est.id} value={est.id}>
                            {est.name || 'Untitled Estimate'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => selectedEstimateId && pushToEstimateMutation.mutate({ 
                      scopeItemIds: Array.from(selectedItems), 
                      estimateId: selectedEstimateId 
                    })}
                    disabled={!selectedEstimateId || pushToEstimateMutation.isPending}
                  >
                    {pushToEstimateMutation.isPending ? "Pushing..." : "Push Items"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {/* Create RFQ */}
          {selectedItems.size > 0 && (
            <Dialog open={isRfqDialogOpen} onOpenChange={setIsRfqDialogOpen}>
              <DialogTrigger asChild>
                <button className="h-6 px-2 text-[10px] font-medium rounded-md border border-border/50 hover-elevate active-elevate-2 flex items-center gap-1" data-testid="button-create-rfq">
                  <Send className="h-3 w-3" />
                  <span>RFQ</span>
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create RFQ</DialogTitle>
                  <DialogDescription>
                    Generate a Request for Quote from {selectedItems.size} selected items
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    onClick={() => createRfqMutation.mutate(Array.from(selectedItems))}
                    disabled={createRfqMutation.isPending}
                  >
                    {createRfqMutation.isPending ? "Creating..." : "Create RFQ"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {/* Create PO */}
          {selectedItems.size > 0 && (
            <Dialog open={isPoDialogOpen} onOpenChange={setIsPoDialogOpen}>
              <DialogTrigger asChild>
                <button className="h-6 px-2 text-[10px] font-medium rounded-md border border-border/50 hover-elevate active-elevate-2 flex items-center gap-1" data-testid="button-create-po">
                  <Package className="h-3 w-3" />
                  <span>PO</span>
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Purchase Order</DialogTitle>
                  <DialogDescription>
                    Generate a Purchase Order from {selectedItems.size} selected items with auto-numbering
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    onClick={() => createPoMutation.mutate(Array.from(selectedItems))}
                    disabled={createPoMutation.isPending}
                  >
                    {createPoMutation.isPending ? "Creating..." : "Create PO"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {/* Export PDF */}
          <Dialog open={isPdfDialogOpen} onOpenChange={(open) => {
            setIsPdfDialogOpen(open);
            if (!open) {
              setHideClientCosts(false); // Reset toggle when dialog closes
            }
          }}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DialogTrigger asChild>
                  <button className="h-6 w-6 flex items-center justify-center rounded-md border border-border/50 hover-elevate active-elevate-2" data-testid="button-export-pdf">
                    <FileText className="h-3 w-3" />
                  </button>
                </DialogTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>Export PDF</p>
              </TooltipContent>
            </Tooltip>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Export PDF</DialogTitle>
                <DialogDescription>
                  Select a stage and customize for clients
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Stage</Label>
                  <Select value={pdfStage} onValueChange={setPdfStage}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {scopeStages.map((stage) => (
                        <SelectItem key={stage.id} value={stage.name}>
                          {stage.name} ({getItemsByStage(stage.name).length} items)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="hide-costs"
                    checked={hideClientCosts}
                    onCheckedChange={(checked) => setHideClientCosts(!!checked)}
                    data-testid="checkbox-hide-costs"
                  />
                  <Label htmlFor="hide-costs" className="text-sm font-normal cursor-pointer">
                    Client-facing (hide costs)
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Enable to generate a clean PDF without pricing for clients
                </p>
              </div>
              <DialogFooter>
                <PDFDownloadLink
                  document={<ScopePDF stage={pdfStage} items={getItemsByStage(pdfStage)} hideClientCosts={hideClientCosts} />}
                  fileName={`scope-${pdfStage.toLowerCase()}${hideClientCosts ? '-client' : ''}.pdf`}
                >
                  {({ loading }) => (
                    <Button disabled={loading}>
                      {loading ? 'Generating...' : 'Download PDF'}
                    </Button>
                  )}
                </PDFDownloadLink>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto">
          {scopeItems.length === 0 && scopeStages.length === 0 ? (
            <Card className="p-12">
              <div className="text-center text-muted-foreground">
                <ListTree className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p className="text-lg font-medium mb-2">No scope items yet</p>
                <p className="text-sm">Load the "Standard Slab" template to get started with 12 pre-filled items</p>
              </div>
            </Card>
          ) : (
            // Stage DnD Context (separate from item DnD)
            <DndContext
              sensors={stageSensors}
              collisionDetection={closestCenter}
              onDragStart={handleStageDragStart}
              onDragOver={handleStageDragOver}
              onDragEnd={handleStageDragEnd}
            >
              <SortableContext
                items={scopeStages.map(s => s.id)}
                strategy={verticalListSortingStrategy}
              >
                {/* Item DnD Context (nested inside stage DnD) */}
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                >
                  {scopeStages
                    .filter(stage => !stage.parentId) // Only show top-level stages
                    .sort((a, b) => a.displayOrder - b.displayOrder)
                    .map((stage) => (
                      <DroppableStage
                        key={stage.id}
                        stageData={stage}
                        items={getItemsByStage(stage.name)}
                        isExpanded={stageExpanded[stage.name] ?? true}
                        onToggleExpand={() => toggleStage(stage.name)}
                        onUpdate={handleUpdateItem}
                        onDelete={handleDeleteItem}
                        onToggleSelect={handleToggleSelect}
                        onAddItem={handleAddItem}
                        onEditStage={handleEditStage}
                        onDeleteStage={handleDeleteStage}
                        onAddNewStage={handleAddNewStage}
                        selectedItems={selectedItems}
                        isOver={overStageId === stage.id}
                        isDraggingStage={!!activeStageId}
                        allItems={scopeItems}
                        editingStageId={editingStageId}
                        editingStageName={editingStageName}
                        setEditingStageId={setEditingStageId}
                        setEditingStageName={setEditingStageName}
                        children={scopeStages.filter(s => s.parentId === stage.id)}
                        allStages={scopeStages}
                        collapsedItems={collapsedItems} // Scope 2.0
                        onToggleItemCollapse={toggleItemCollapse} // Scope 2.0
                        getTypeLabel={getTypeLabel} // Scope 2.0
                        linkedPOs={posByStage[stage.id] || []}
                        onViewPO={handleViewPO}
                        linkedScheduleItems={scheduleItemsByStage[stage.id] || []}
                        onViewScheduleItem={handleViewScheduleItem}
                      />
                    ))}

                  {/* Item Drag Overlay */}
                  <DragOverlay>
                    {activeId && scopeItems.find(i => i.id === activeId) ? (
                      <Card className="opacity-90 border-l-4" style={{ borderLeftColor: CASVA_LILAC }}>
                        <CardContent className="py-2 px-3">
                          <div className="font-medium text-sm">
                            {scopeItems.find(i => i.id === activeId)?.title}
                          </div>
                        </CardContent>
                      </Card>
                    ) : null}
                  </DragOverlay>
                </DndContext>
              </SortableContext>

              {/* Stage Drag Overlay */}
              <DragOverlay>
                {activeStageId && scopeStages.find(s => s.id === activeStageId) ? (
                  <Card className="opacity-90 border-l-4" style={{ borderLeftColor: CASVA_LILAC }}>
                    <CardHeader className="py-2 px-4">
                      <CardTitle className="text-base font-semibold" style={{ color: CASVA_LILAC }}>
                        {scopeStages.find(s => s.id === activeStageId)?.name}
                      </CardTitle>
                    </CardHeader>
                  </Card>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      </div>

      {/* Add Item Dialog with Tiptap */}
      <Dialog open={isAddItemDialogOpen} onOpenChange={(open) => {
        setIsAddItemDialogOpen(open);
        if (!open) {
          setNewItemTitle("");
          addItemEditor?.commands.clearContent();
          setAddItemStage(null);
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Scope Item to {addItemStage}</DialogTitle>
            <DialogDescription>
              Create a new scope item with rich text description
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="item-title">Title</Label>
              <Input
                id="item-title"
                value={newItemTitle}
                onChange={(e) => setNewItemTitle(e.target.value)}
                placeholder="e.g., Concrete Pour, Skylight Installation"
                data-testid="input-new-item-title"
              />
            </div>
            <div>
              <Label htmlFor="item-type">Type</Label>
              <Select value={newItemType} onValueChange={(value) => setNewItemType(value as ScopeItemType)}>
                <SelectTrigger id="item-type" data-testid="select-item-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="e-note">E-Note</SelectItem>
                  <SelectItem value="scope">Scope</SelectItem>
                  <SelectItem value="note">Note</SelectItem>
                  <SelectItem value="tool">Tool</SelectItem>
                  <SelectItem value="material">Material</SelectItem>
                  <SelectItem value="proposal">Proposal</SelectItem>
                  <SelectItem value="checklist">Checklist</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description (Rich Text)</Label>
              {addItemEditor && (
                <div className="border rounded-md overflow-hidden" data-testid="tiptap-editor">
                  <div className="border-b bg-muted/30 p-2 flex items-center gap-1 flex-wrap">
                    <Button
                      type="button"
                      variant={addItemEditor.isActive('bold') ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => addItemEditor.chain().focus().toggleBold().run()}
                      className="h-8 w-8 p-0"
                      data-testid="toolbar-add-bold"
                    >
                      <strong className="text-xs">B</strong>
                    </Button>
                    <Button
                      type="button"
                      variant={addItemEditor.isActive('italic') ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => addItemEditor.chain().focus().toggleItalic().run()}
                      className="h-8 w-8 p-0"
                      data-testid="toolbar-add-italic"
                    >
                      <em className="text-xs">I</em>
                    </Button>
                    <Button
                      type="button"
                      variant={addItemEditor.isActive('underline') ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => addItemEditor.chain().focus().toggleUnderline().run()}
                      className="h-8 w-8 p-0"
                      data-testid="toolbar-add-underline"
                    >
                      <span className="text-xs underline">U</span>
                    </Button>
                    <div className="w-px h-5 bg-border mx-1" />
                    <Button
                      type="button"
                      variant={addItemEditor.isActive('bulletList') ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => addItemEditor.chain().focus().toggleBulletList().run()}
                      className="h-8 w-8 p-0"
                      data-testid="toolbar-add-bullet"
                    >
                      <span className="text-xs">•</span>
                    </Button>
                    <Button
                      type="button"
                      variant={addItemEditor.isActive('orderedList') ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => addItemEditor.chain().focus().toggleOrderedList().run()}
                      className="h-8 w-8 p-0"
                      data-testid="toolbar-add-ordered"
                    >
                      <span className="text-xs">1.</span>
                    </Button>
                  </div>
                  <EditorContent 
                    editor={addItemEditor}
                    className="prose prose-sm max-w-none p-3 min-h-[200px]"
                  />
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Use the toolbar to format text with bold, italic, underline, and lists
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleCreateItem}
              disabled={!newItemTitle.trim() || createItemMutation.isPending}
              data-testid="button-create-scope-item"
            >
              {createItemMutation.isPending ? "Creating..." : "Add Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add New Stage Dialog */}
      <Dialog open={isAddStageDialogOpen} onOpenChange={(open) => {
        setIsAddStageDialogOpen(open);
        if (!open) {
          setNewStageName("");
          setAddStageAfterId(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Stage</DialogTitle>
            <DialogDescription>
              Create a new stage after the selected stage
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="stage-name">Stage Name</Label>
              <Input
                id="stage-name"
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                placeholder="e.g., Pre-Construction, Finishing"
                data-testid="input-new-stage-name"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newStageName.trim()) {
                    handleCreateNewStage();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleCreateNewStage}
              disabled={!newStageName.trim() || createStageMutation.isPending}
              data-testid="button-create-stage"
            >
              {createStageMutation.isPending ? "Creating..." : "Add Stage"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import from Estimate Dialog */}
      <Dialog open={isImportFromEstimateOpen} onOpenChange={(open) => {
        setIsImportFromEstimateOpen(open);
        if (!open) {
          setSelectedEstimateForImport(null);
          setSelectedGroupsToImport(new Set());
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Stages from Estimate</DialogTitle>
            <DialogDescription>
              Select estimate groups to create as scope stages. Groups that match existing stages are highlighted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Estimate Selection */}
            <div>
              <Label>Select Estimate</Label>
              <Select 
                value={selectedEstimateForImport || ''} 
                onValueChange={(val) => {
                  setSelectedEstimateForImport(val);
                  setSelectedGroupsToImport(new Set());
                }}
              >
                <SelectTrigger data-testid="select-estimate-for-import">
                  <SelectValue placeholder="Choose an estimate" />
                </SelectTrigger>
                <SelectContent>
                  {estimates.map((est) => (
                    <SelectItem key={est.id} value={est.id}>
                      {est.name || 'Untitled Estimate'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Groups List with Fuzzy Match Indicators */}
            {selectedEstimateForImport && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Estimate Groups ({estimateGroups.length})</Label>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-6 text-xs"
                    onClick={selectAllNewGroups}
                  >
                    Select New Only
                  </Button>
                </div>
                <div className="border rounded-md max-h-[300px] overflow-y-auto">
                  {estimateGroups.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground text-center">
                      No groups found in this estimate
                    </div>
                  ) : (
                    estimateGroups
                      .filter(g => !g.parentGroupId) // Only top-level groups
                      .sort((a, b) => a.order - b.order)
                      .map((group) => {
                        const match = fuzzyMatchStage(group.name);
                        const isSelected = selectedGroupsToImport.has(group.id);
                        
                        return (
                          <div 
                            key={group.id}
                            className={`flex items-center gap-3 p-3 border-b last:border-b-0 cursor-pointer hover:bg-muted/50 ${
                              isSelected ? 'bg-[#bba7db]/10' : ''
                            }`}
                            onClick={() => toggleGroupForImport(group.id)}
                            data-testid={`import-group-${group.id}`}
                          >
                            <Checkbox 
                              checked={isSelected}
                              onCheckedChange={() => toggleGroupForImport(group.id)}
                              className="h-4 w-4"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">{group.name}</div>
                              {group.description && (
                                <div className="text-xs text-muted-foreground truncate">{group.description}</div>
                              )}
                            </div>
                            {match.matched ? (
                              <Badge variant="outline" className="shrink-0 bg-amber-100 text-amber-800 border-amber-200 text-[10px]">
                                Matches: {match.existingStage}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="shrink-0 bg-green-100 text-green-800 border-green-200 text-[10px]">
                                New
                              </Badge>
                            )}
                          </div>
                        );
                      })
                  )}
                </div>
                {selectedGroupsToImport.size > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {selectedGroupsToImport.size} group{selectedGroupsToImport.size !== 1 ? 's' : ''} selected for import
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsImportFromEstimateOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleImportFromEstimate}
              disabled={selectedGroupsToImport.size === 0}
              data-testid="button-confirm-import-stages"
            >
              Import {selectedGroupsToImport.size} Stage{selectedGroupsToImport.size !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
