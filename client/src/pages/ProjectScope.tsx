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
  GripVertical,
  Trash2,
  CheckSquare,
  Upload,
  FileText,
} from "lucide-react";
import type { ScopeItem, ScopeTemplate, Estimate } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { DndContext, closestCenter, DragOverlay, DragEndEvent, DragOverEvent, DragStartEvent, useSensor, useSensors, PointerSensor, KeyboardSensor } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Document, Page, Text, View, StyleSheet, PDFDownloadLink } from '@react-pdf/renderer';

// Define the 5 stages
const STAGES = ['Prelim', 'Frame', 'Lockup', 'Fix', 'Handover'] as const;
type Stage = typeof STAGES[number];

// Casva lilac color
const CASVA_LILAC = '#bba7db';

interface StageState {
  [key: string]: boolean;
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
}

function SortableScopeItem({ item, onUpdate, onDelete, onToggleSelect, isSelected, level = 0, children = [], allItems = [], selectedItems = new Set() }: SortableScopeItemProps) {
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [showGearList, setShowGearList] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [uploadingGearIndex, setUploadingGearIndex] = useState<number | null>(null);
  const { toast } = useToast();

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
    extensions: [StarterKit],
    content: item.description || '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onUpdate(item.id, { description: html });
    },
    editable: isEditingDescription,
  });

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

  return (
    <div ref={setNodeRef} style={style} className={`mb-2 ${level > 0 ? 'ml-8' : ''}`}>
      <Card 
        className={`transition-all duration-200 border-l-4 ${isSelected ? 'ring-2 ring-primary' : 'hover:shadow-xl hover:-translate-y-1'}`}
        style={{ 
          minHeight: '40px',
          borderLeftColor: CASVA_LILAC
        }}
      >
        <CardContent className="py-1 px-3 flex items-start gap-2" style={{ minHeight: '40px' }}>
          {/* Expand/Collapse for parent items */}
          {hasChildren ? (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 mt-1"
              onClick={() => setIsExpanded(!isExpanded)}
              data-testid={`button-toggle-scope-${item.id}`}
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          ) : (
            <div className="w-7" />
          )}

          {/* Selection Checkbox */}
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelect(item.id)}
            className="mt-1"
            data-testid={`checkbox-select-${item.id}`}
          />

          {/* Drag Handle */}
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing mt-1">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {/* Title */}
              <Input
                value={item.title}
                onChange={(e) => onUpdate(item.id, { title: e.target.value })}
                className="h-7 text-sm font-medium border-0 focus-visible:ring-1 px-2"
                placeholder="Item title"
                data-testid={`input-scope-title-${item.id}`}
              />

              {/* Badges */}
              {item.needsRfq && (
                <Badge variant="outline" className="h-6 text-xs bg-yellow-100 text-yellow-800">
                  RFQ
                </Badge>
              )}
              {item.estimateItemId && (
                <Badge variant="outline" className="h-6 text-xs bg-green-100 text-green-800">
                  <DollarSign className="h-3 w-3 mr-1" />
                  Est
                </Badge>
              )}
              {item.poId && (
                <Badge variant="outline" className="h-6 text-xs bg-blue-100 text-blue-800">
                  <Package className="h-3 w-3 mr-1" />
                  PO
                </Badge>
              )}
            </div>

            {/* Description */}
            {isEditingDescription && editor ? (
              <div className="border rounded-md p-2 bg-background mt-1">
                <EditorContent editor={editor} className="prose prose-sm max-w-none" />
                <Button
                  size="sm"
                  onClick={() => setIsEditingDescription(false)}
                  className="mt-2"
                >
                  Done
                </Button>
              </div>
            ) : item.description ? (
              <div
                className="text-sm text-muted-foreground cursor-pointer hover:bg-muted/50 rounded px-2 py-1"
                onClick={() => setIsEditingDescription(true)}
                dangerouslySetInnerHTML={{ __html: item.description }}
              />
            ) : (
              <div
                className="text-sm text-muted-foreground cursor-pointer hover:bg-muted/50 rounded px-2 py-1 italic"
                onClick={() => setIsEditingDescription(true)}
              >
                Click to add description...
              </div>
            )}

            {/* Gear Checklist */}
            {gearList.length > 0 && (
              <div className="mt-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowGearList(!showGearList)}
                  className="h-7"
                >
                  <CheckSquare className="h-3 w-3 mr-1" />
                  Gear ({gearList.filter(g => g.checked).length}/{gearList.length})
                  {showGearList ? <ChevronDown className="h-3 w-3 ml-1" /> : <ChevronRight className="h-3 w-3 ml-1" />}
                </Button>
                {showGearList && (
                  <div className="ml-6 mt-1 space-y-1">
                    {gearList.map((gear, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Checkbox
                          checked={gear.checked}
                          onCheckedChange={() => handleToggleGearItem(idx)}
                          data-testid={`checkbox-gear-${item.id}-${idx}`}
                        />
                        <span className={`text-sm ${gear.checked ? 'line-through text-muted-foreground' : ''}`}>
                          {gear.name}
                        </span>
                        {gear.photoUrl && (
                          <Badge variant="outline" className="h-5 text-xs bg-green-100 text-green-800">
                            Photo
                          </Badge>
                        )}
                        <label className="ml-auto cursor-pointer">
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
                )}
              </div>
            )}
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

      {/* Render children recursively */}
      {hasChildren && isExpanded && (
        <div className="mt-1">
          {children.map((child) => (
            <SortableScopeItem
              key={child.id}
              item={child}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onToggleSelect={onToggleSelect}
              isSelected={selectedItems.has(child.id)}
              level={level + 1}
              children={allItems.filter(i => i.parentId === child.id)}
              allItems={allItems}
              selectedItems={selectedItems}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface DroppableStageProps {
  stage: Stage;
  items: ScopeItem[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (id: string, data: Partial<ScopeItem>) => void;
  onDelete: (id: string) => void;
  onToggleSelect: (id: string) => void;
  selectedItems: Set<string>;
  isOver?: boolean;
  allItems?: ScopeItem[];
}

function DroppableStage({ stage, items, isExpanded, onToggleExpand, onUpdate, onDelete, onToggleSelect, selectedItems, isOver, allItems = [] }: DroppableStageProps) {
  const { setNodeRef } = useSortable({ id: `stage-${stage}` });

  // Filter to only top-level items (no parent)
  const topLevelItems = items.filter(item => !item.parentId);

  return (
    <div ref={setNodeRef} className="mb-4">
      <Card 
        className={`transition-all duration-200 ${isOver ? 'ring-2 ring-primary bg-primary/5' : ''}`}
        style={{ borderLeftColor: CASVA_LILAC, borderLeftWidth: '4px' }}
      >
        <CardHeader 
          className="py-2 px-4 cursor-pointer hover:bg-muted/50"
          onClick={onToggleExpand}
          style={{ minHeight: '40px' }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
              <CardTitle className="text-base font-semibold" style={{ color: CASVA_LILAC }}>
                {stage}
              </CardTitle>
              <Badge variant="secondary" className="ml-2">
                {items.length}
              </Badge>
            </div>
          </div>
        </CardHeader>
        
        {isExpanded && (
          <CardContent className="pt-2 pb-4 space-y-2">
            {topLevelItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm italic">
                Drag items here or add new items to this stage
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
                  />
                ))}
              </SortableContext>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}

// PDF Document Component
const ScopePDF = ({ stage, items }: { stage: string; items: ScopeItem[] }) => (
  <Document>
    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.header}>
        <Text style={pdfStyles.title}>Scope of Works - {stage}</Text>
      </View>
      {items.map((item, index) => (
        <View key={item.id} style={pdfStyles.item}>
          <Text style={pdfStyles.itemNumber}>{index + 1}.</Text>
          <View style={pdfStyles.itemContent}>
            <Text style={pdfStyles.itemTitle}>{item.title}</Text>
            {item.description && (
              <Text style={pdfStyles.itemDescription}>{item.description.replace(/<[^>]*>/g, '')}</Text>
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
  item: { flexDirection: 'row', marginBottom: 12 },
  itemNumber: { width: 30, fontWeight: 'bold' },
  itemContent: { flex: 1 },
  itemTitle: { fontWeight: 'bold', marginBottom: 4 },
  itemDescription: { color: '#666', fontSize: 10 },
});

export default function ProjectScope() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [stageExpanded, setStageExpanded] = useState<StageState>({
    Prelim: true,
    Frame: true,
    Lockup: true,
    Fix: true,
    Handover: true,
  });
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [isPushDialogOpen, setIsPushDialogOpen] = useState(false);
  const [selectedEstimateId, setSelectedEstimateId] = useState<string>("");
  const [isRfqDialogOpen, setIsRfqDialogOpen] = useState(false);
  const [isPdfDialogOpen, setIsPdfDialogOpen] = useState(false);
  const [pdfStage, setPdfStage] = useState<Stage>('Prelim');

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

  // Update mutation
  const updateItemMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ScopeItem> }) => {
      return apiRequest(`/api/scope/${id}`, 'PATCH', data);
    },
    onSuccess: () => {
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

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    setOverId(event.over?.id as string || null);
  };

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
      const targetStage = overId.replace('stage-', '') as Stage;
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

  const handleToggleSelect = (id: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItems(newSelected);
  };

  const toggleStage = (stage: Stage) => {
    setStageExpanded(prev => ({ ...prev, [stage]: !prev[stage] }));
  };

  const getItemsByStage = (stage: Stage) => {
    return scopeItems
      .filter(item => item.stage === stage)
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
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
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card">
        <div className="flex items-center gap-3">
          <ListTree className="h-6 w-6" style={{ color: CASVA_LILAC }} />
          <div>
            <h1 className="text-2xl font-bold">Scope</h1>
            <p className="text-sm text-muted-foreground">The DNA of your project</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Load Template */}
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
          {selectedItems.size > 0 && estimates.length > 0 && (
            <Dialog open={isPushDialogOpen} onOpenChange={setIsPushDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-push-to-estimate">
                  <DollarSign className="h-4 w-4 mr-2" />
                  Push ({selectedItems.size})
                </Button>
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
                <Button variant="outline" size="sm" data-testid="button-create-rfq">
                  <Send className="h-4 w-4 mr-2" />
                  Create RFQ
                </Button>
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

          {/* Export PDF */}
          <Dialog open={isPdfDialogOpen} onOpenChange={setIsPdfDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-export-pdf">
                <FileText className="h-4 w-4 mr-2" />
                Export PDF
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Export PDF</DialogTitle>
                <DialogDescription>
                  Select a stage to export
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Stage</Label>
                  <Select value={pdfStage} onValueChange={(v) => setPdfStage(v as Stage)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STAGES.map((stage) => (
                        <SelectItem key={stage} value={stage}>
                          {stage} ({getItemsByStage(stage).length} items)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <PDFDownloadLink
                  document={<ScopePDF stage={pdfStage} items={getItemsByStage(pdfStage)} />}
                  fileName={`scope-${pdfStage.toLowerCase()}.pdf`}
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
          {scopeItems.length === 0 ? (
            <Card className="p-12">
              <div className="text-center text-muted-foreground">
                <ListTree className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p className="text-lg font-medium mb-2">No scope items yet</p>
                <p className="text-sm">Load the "Standard Slab" template to get started with 12 pre-filled items</p>
              </div>
            </Card>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={[...STAGES.map(s => `stage-${s}`), ...scopeItems.map(i => i.id)]}
                strategy={verticalListSortingStrategy}
              >
                {STAGES.map((stage) => (
                  <DroppableStage
                    key={stage}
                    stage={stage}
                    items={getItemsByStage(stage)}
                    isExpanded={stageExpanded[stage]}
                    onToggleExpand={() => toggleStage(stage)}
                    onUpdate={handleUpdateItem}
                    onDelete={handleDeleteItem}
                    onToggleSelect={handleToggleSelect}
                    selectedItems={selectedItems}
                    isOver={overId === `stage-${stage}`}
                    allItems={scopeItems}
                  />
                ))}
              </SortableContext>

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
          )}
        </div>
      </div>
    </div>
  );
}
