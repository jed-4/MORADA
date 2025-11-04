import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  ListTree,
  Plus,
  FileDown,
  FileUp,
  Save,
  Trash2,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Send,
  Calendar as CalendarIcon,
  DollarSign,
  Image as ImageIcon,
  Package,
} from "lucide-react";
import type { ScopeItem, ScopeTemplate, Estimate } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { ColorChip } from "@/components/ui/color-chip";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Tiptap editor
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';

interface SortableScopeItemProps {
  item: ScopeItem;
  onUpdate: (id: string, data: Partial<ScopeItem>) => void;
  onDelete: (id: string) => void;
  level?: number;
  children?: ScopeItem[];
}

function SortableScopeItem({ item, onUpdate, onDelete, level = 0, children = [] }: SortableScopeItemProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditingDescription, setIsEditingDescription] = useState(false);

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

  // Initialize Tiptap editor for this item's description
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      BulletList,
      OrderedList,
      ListItem,
      TextStyle,
      Color,
    ],
    content: item.description || '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onUpdate(item.id, { description: html });
    },
    editable: isEditingDescription,
  });

  const stageColors: Record<string, string> = {
    'Preparation': '#bba7db', // Casva lilac
    'Foundation': '#64748b',
    'Framing': '#f59e0b',
    'External': '#3b82f6',
    'Internal': '#10b981',
    'Finishing': '#a58bc7', // Casva lilac variant
    'Landscaping': '#14b8a6',
  };

  const hasChildren = children.length > 0;

  return (
    <div ref={setNodeRef} style={style} className={`mb-2 ${level > 0 ? 'ml-8' : ''}`}>
      <Card 
        className="hover:shadow-xl hover:-translate-y-1 active:translate-y-0 transition-all duration-200 border-l-4"
        style={{ 
          minHeight: '40px',
          borderLeftColor: item.stage ? stageColors[item.stage] : '#bba7db'
        }}
      >
        <CardContent className="py-1 px-3 flex items-start gap-2" style={{ minHeight: '40px' }}>
          {/* Drag Handle */}
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing mt-1">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>

          {/* Expand/Collapse for parent items */}
          {hasChildren && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setIsExpanded(!isExpanded)}
              data-testid={`button-toggle-scope-${item.id}`}
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {/* Stage Badge */}
              {item.stage && (
                <ColorChip 
                  color={stageColors[item.stage] || '#bba7db'} 
                  label={item.stage}
                  size="sm"
                />
              )}

              {/* Title */}
              <Input
                value={item.title}
                onChange={(e) => onUpdate(item.id, { title: e.target.value })}
                className="h-7 text-sm font-medium border-0 focus-visible:ring-1 px-2"
                placeholder="Item title"
                data-testid={`input-scope-title-${item.id}`}
              />

              {/* Badges for flags */}
              {item.needsRfi && (
                <Badge variant="outline" className="h-6 text-xs" style={{ backgroundColor: '#dbeafe', color: '#1e40af' }}>
                  RFI
                </Badge>
              )}
              {item.needsRfq && (
                <Badge variant="outline" className="h-6 text-xs" style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>
                  RFQ
                </Badge>
              )}
              {item.poId && (
                <Badge variant="outline" className="h-6 text-xs" style={{ backgroundColor: '#dcfce7', color: '#166534' }}>
                  <Package className="h-3 w-3 mr-1" />
                  PO
                </Badge>
              )}
            </div>

            {/* Description Editor */}
            <div className="mt-1">
              {isEditingDescription && editor ? (
                <div className="border rounded-md p-2 bg-background">
                  <EditorContent editor={editor} className="prose prose-sm max-w-none" />
                  <div className="flex gap-1 mt-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7"
                      onClick={() => editor.chain().focus().toggleBold().run()}
                    >
                      <strong>B</strong>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7"
                      onClick={() => editor.chain().focus().toggleItalic().run()}
                    >
                      <em>I</em>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7"
                      onClick={() => editor.chain().focus().toggleBulletList().run()}
                    >
                      • List
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setIsEditingDescription(false)}
                      className="ml-auto h-7"
                    >
                      Done
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className="text-sm text-muted-foreground cursor-pointer hover:bg-muted/50 rounded px-2 py-1"
                  onClick={() => setIsEditingDescription(true)}
                  dangerouslySetInnerHTML={{ __html: item.description || '<em>Click to add description...</em>' }}
                />
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => onDelete(item.id)}
              data-testid={`button-delete-scope-${item.id}`}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Render children */}
      {hasChildren && isExpanded && (
        <div className="mt-1">
          {children.map((child) => (
            <SortableScopeItem
              key={child.id}
              item={child}
              onUpdate={onUpdate}
              onDelete={onDelete}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProjectScope() {
  const { id: projectId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedStage, setSelectedStage] = useState<string>("Preparation");
  const [newItemTitle, setNewItemTitle] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);

  // Fetch scope items for the project
  const { data: scopeItems = [], isLoading } = useQuery<ScopeItem[]>({
    queryKey: [`/api/projects/${projectId}/scope`],
    enabled: !!projectId,
  });

  // Fetch scope templates
  const { data: templates = [] } = useQuery<ScopeTemplate[]>({
    queryKey: ['/api/scope-templates'],
  });

  // Fetch estimates for push-to-estimate dropdown
  const { data: estimates = [] } = useQuery<Estimate[]>({
    queryKey: ['/api/estimates'],
    select: (data) => data.filter(est => est.projectId === projectId),
  });

  // Create scope item mutation
  const createItemMutation = useMutation({
    mutationFn: async (data: Partial<ScopeItem>) => {
      console.log("Creating scope item with data:", data);
      console.log("User companyId:", user?.companyId);
      const payload = {
        ...data,
        companyId: user?.companyId, // ADD companyId from session
      };
      console.log("Full payload:", payload);
      return apiRequest(`/api/projects/${projectId}/scope`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope`] });
      setNewItemTitle("");
      toast({ title: "Scope item created" });
    },
    onError: (error: any) => {
      console.error("Failed to create scope item:", error);
      toast({ title: "Failed to create scope item", variant: "destructive" });
    },
  });

  // Update scope item mutation
  const updateItemMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ScopeItem> }) => {
      return apiRequest(`/api/scope/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope`] });
    },
  });

  // Delete scope item mutation
  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/scope/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope`] });
      toast({ title: "Scope item deleted" });
    },
  });

  // Apply template mutation
  const applyTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      return apiRequest(`/api/scope-templates/${templateId}/apply`, {
        method: 'POST',
        body: JSON.stringify({ projectId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope`] });
      setIsTemplateDialogOpen(false);
      toast({ title: "Template applied successfully" });
    },
  });

  // Push to estimate mutation
  const pushToEstimateMutation = useMutation({
    mutationFn: async ({ scopeItemIds, estimateId }: { scopeItemIds: string[]; estimateId: string }) => {
      return apiRequest('/api/scope/push-to-estimate', {
        method: 'POST',
        body: JSON.stringify({ scopeItemIds, estimateId }),
      });
    },
    onSuccess: () => {
      toast({ title: "Items pushed to estimate successfully" });
    },
  });

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = scopeItems.findIndex(item => item.id === active.id);
    const newIndex = scopeItems.findIndex(item => item.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const reorderedItems = arrayMove(scopeItems, oldIndex, newIndex);
      const updates = reorderedItems.map((item, index) => ({
        id: item.id,
        displayOrder: index,
      }));

      apiRequest('/api/scope/reorder', {
        method: 'POST',
        body: JSON.stringify({ updates }),
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope`] });
      });
    }
  };

  const handleAddItem = () => {
    if (!newItemTitle.trim()) return;

    createItemMutation.mutate({
      title: newItemTitle,
      stage: selectedStage,
      displayOrder: scopeItems.length,
      needsRfi: false,
      needsRfq: false,
    });
  };

  const handleUpdateItem = (id: string, data: Partial<ScopeItem>) => {
    updateItemMutation.mutate({ id, data });
  };

  const handleDeleteItem = (id: string) => {
    deleteItemMutation.mutate(id);
  };

  // Build hierarchical tree (parent/children structure)
  const buildTree = (items: ScopeItem[]): ScopeItem[] => {
    const topLevel = items.filter(item => !item.parentId);
    return topLevel;
  };

  const getChildren = (parentId: string): ScopeItem[] => {
    return scopeItems.filter(item => item.parentId === parentId);
  };

  const tree = buildTree(scopeItems);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading scope...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card">
        <div className="flex items-center gap-3">
          <ListTree className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Scope</h1>
            <p className="text-sm text-muted-foreground">The DNA of your project</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Template Dropdown */}
          <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-load-template">
                <FileDown className="h-4 w-4 mr-2" />
                Load Template
              </Button>
            </DialogTrigger>
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

          {/* Push to Estimate */}
          {estimates.length > 0 && scopeItems.length > 0 && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                const estimateId = estimates[0].id;
                const allIds = scopeItems.map(i => i.id);
                pushToEstimateMutation.mutate({ scopeItemIds: allIds, estimateId });
              }}
              data-testid="button-push-to-estimate"
            >
              <DollarSign className="h-4 w-4 mr-2" />
              Push to Estimate
            </Button>
          )}

          {/* Create RFQ */}
          <Button variant="outline" size="sm" data-testid="button-create-rfq">
            <Send className="h-4 w-4 mr-2" />
            Create RFQ
          </Button>

          {/* Export PDF */}
          <Button variant="outline" size="sm" data-testid="button-export-pdf">
            <FileUp className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          {/* Add New Item */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Add Scope Item</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Select value={selectedStage} onValueChange={setSelectedStage}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Preparation">Preparation</SelectItem>
                  <SelectItem value="Foundation">Foundation</SelectItem>
                  <SelectItem value="Framing">Framing</SelectItem>
                  <SelectItem value="External">External</SelectItem>
                  <SelectItem value="Internal">Internal</SelectItem>
                  <SelectItem value="Finishing">Finishing</SelectItem>
                  <SelectItem value="Landscaping">Landscaping</SelectItem>
                </SelectContent>
              </Select>

              <Input
                value={newItemTitle}
                onChange={(e) => setNewItemTitle(e.target.value)}
                placeholder="Enter scope item title..."
                onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
                className="flex-1"
                data-testid="input-new-scope-item"
              />

              <Button 
                onClick={handleAddItem}
                disabled={!newItemTitle.trim() || createItemMutation.isPending}
                data-testid="button-add-scope-item"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </CardContent>
          </Card>

          {/* Scope Items List */}
          {tree.length === 0 ? (
            <Card className="p-12">
              <div className="text-center text-muted-foreground">
                <ListTree className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p className="text-lg font-medium mb-2">No scope items yet</p>
                <p className="text-sm">Add your first scope item or load a template to get started</p>
              </div>
            </Card>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={tree.map(item => item.id)}
                strategy={verticalListSortingStrategy}
              >
                {tree.map((item) => (
                  <SortableScopeItem
                    key={item.id}
                    item={item}
                    onUpdate={handleUpdateItem}
                    onDelete={handleDeleteItem}
                    children={getChildren(item.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>
    </div>
  );
}
