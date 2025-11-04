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
  GripVertical,
  Trash2,
  CheckSquare,
  Upload,
  FileText,
  Pen,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
    <div ref={setNodeRef} style={style} className={`mb-2 ${level > 0 ? 'ml-8' : ''} group`}>
      <Card 
        className={`transition-all duration-200 border-l-4 ${isSelected ? 'ring-2 ring-primary' : 'hover:shadow-xl hover:-translate-y-1'}`}
        style={{ 
          minHeight: isCollapsed ? '40px' : '80px',
          maxHeight: isCollapsed ? '40px' : 'none',
          borderLeftColor: CASVA_LILAC,
          overflow: isCollapsed ? 'hidden' : 'visible'
        }}
      >
        <CardContent className="py-1 px-3 flex items-start gap-2" style={{ minHeight: '40px' }}>
          {/* Drag Handle - LEFT SIDE */}
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing mt-1">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>

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

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Title - Inter 16px */}
            <Input
              value={item.title}
              onChange={(e) => onUpdate(item.id, { title: e.target.value })}
              className="h-7 text-base font-semibold border-0 focus-visible:ring-1 px-2"
              style={{ fontFamily: 'Inter, sans-serif' }}
              placeholder="Item title"
              data-testid={`input-scope-title-${item.id}`}
            />

            {/* Description - Hidden when collapsed, Manrope 14px */}
            {!isCollapsed && (
              <>
                {isEditingDescription && editor ? (
                  <div className="border rounded-md p-2 bg-background mt-1" style={{ fontFamily: 'Manrope, sans-serif' }}>
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
                    className="text-sm text-muted-foreground cursor-pointer hover:bg-muted/50 rounded px-2 py-1 mt-1"
                    style={{ fontFamily: 'Manrope, sans-serif' }}
                    onClick={() => setIsEditingDescription(true)}
                    dangerouslySetInnerHTML={{ __html: item.description }}
                  />
                ) : (
                  <div
                    className="text-sm text-muted-foreground cursor-pointer hover:bg-muted/50 rounded px-2 py-1 italic mt-1"
                    style={{ fontFamily: 'Manrope, sans-serif' }}
                    onClick={() => setIsEditingDescription(true)}
                  >
                    Click to add description...
                  </div>
                )}
              </>
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

          {/* Right Column: Chips (vertical stack) + 3 dots menu on hover */}
          <div className="flex flex-col items-end gap-2 min-w-0">
            {/* Type Badge - More compact, 20px tall */}
            {getTypeLabel && (
              <Badge 
                variant="secondary"
                className="h-5 px-1.5 text-xs font-semibold rounded shrink-0"
                style={{
                  backgroundColor: CASVA_LILAC,
                  color: 'white',
                }}
                data-testid={`badge-type-${item.id}`}
              >
                {getTypeLabel(item.itemType)}
              </Badge>
            )}

            {/* Badges - Scope 2.0: Smart Links (vertical stack) */}
            {item.needsRfq && (
              <Badge variant="outline" className="h-6 text-xs bg-yellow-100 text-yellow-800 shrink-0">
                RFQ
              </Badge>
            )}
            {item.estimateItemId && (
              <Badge 
                variant="outline" 
                className="h-6 text-xs bg-green-100 text-green-800 cursor-pointer hover:bg-green-200 shrink-0"
                onClick={() => window.location.href = `/projects/${item.projectId}/estimates`}
                data-testid={`link-estimate-${item.id}`}
              >
                <DollarSign className="h-3 w-3 mr-1" />
                Est →
              </Badge>
            )}
            {item.poId && (
              <Badge 
                variant="outline" 
                className="h-6 text-xs bg-blue-100 text-blue-800 cursor-pointer hover:bg-blue-200 shrink-0"
                onClick={() => window.location.href = `/projects/${item.projectId}/purchase-orders`}
                data-testid={`link-po-${item.id}`}
              >
                <Package className="h-3 w-3 mr-1" />
                PO →
              </Badge>
            )}

            {/* 3 dots menu with options (hidden, shown on group hover) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  data-testid={`button-menu-scope-${item.id}`}
                >
                  <span className="text-lg leading-none">⋯</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem 
                  onClick={() => {
                    if (onToggleCollapse) onToggleCollapse(item.id);
                  }}
                  data-testid={`menu-toggle-description-${item.id}`}
                >
                  {isCollapsed ? 'Expand Description' : 'Collapse Description'}
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => setIsEditingDescription(true)}
                  data-testid={`menu-edit-description-${item.id}`}
                >
                  Edit Description
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => onDelete(item.id)}
                  className="text-destructive"
                  data-testid={`menu-delete-scope-${item.id}`}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>

      {/* Render children recursively */}
      {hasChildren && isExpanded && (
        <div className="mt-1">
          {children.map((child) => {
            // Scope 2.0: Get collapse state from parent's collapsed set if provided
            const childCollapsed = onToggleCollapse && getTypeLabel 
              ? (collapsedItems?.has(child.id) ?? false) 
              : false;
            
            return (
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
                isCollapsed={childCollapsed} // Scope 2.0: use actual collapse state
                onToggleCollapse={onToggleCollapse} // Scope 2.0
                getTypeLabel={getTypeLabel} // Scope 2.0
                collapsedItems={collapsedItems} // Scope 2.0: pass down collapsed items set
              />
            );
          })}
        </div>
      )}
    </div>
  );
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

  return (
    <>
      <div 
        ref={setNodeRef} 
        style={{...style, width: '90%', margin: '0 auto 1rem auto'}}
        className={`${level > 0 ? 'ml-8' : ''}`}
      >
        <Card 
          className={`transition-all duration-200 rounded-xl shadow-sm ${isOver && isDraggingStage ? 'ring-2 bg-[#bba7db]/10' : ''}`}
          style={{ 
            borderLeftColor: CASVA_LILAC, 
            borderLeftWidth: '4px',
            ...(level > 0 ? { borderLeftStyle: 'dashed' } : {})
          }}
        >
          <CardHeader 
            className="py-2 px-4 group"
            style={{ minHeight: '40px' }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* Drag Handle */}
                <div 
                  {...attributes} 
                  {...listeners} 
                  className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
                  data-testid={`drag-handle-stage-${stageData.id}`}
                >
                  <GripVertical className="h-5 w-5 text-muted-foreground" style={{ color: CASVA_LILAC }} />
                </div>

                {/* Expand/Collapse and Name */}
                <div 
                  className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 -m-2 p-2 rounded" 
                  onClick={onToggleExpand}
                >
                  {hasChildren || items.length > 0 ? (
                    isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />
                  ) : (
                    <div className="w-5" />
                  )}
                  {isEditing ? (
                    <Input
                      value={editingStageName}
                      onChange={(e) => setEditingStageName(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onBlur={handleSaveEdit}
                      autoFocus
                      className="h-7 text-base font-semibold border-2 px-2"
                      style={{ borderColor: CASVA_LILAC, color: CASVA_LILAC, fontFamily: 'Inter, sans-serif' }}
                      data-testid={`input-edit-stage-${stageData.id}`}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <h3 
                      className="text-base font-semibold" 
                      style={{ color: CASVA_LILAC, fontFamily: 'Inter, sans-serif' }}
                      data-testid={`text-stage-name-${stageData.id}`}
                    >
                      {stageData.name}
                    </h3>
                  )}
                  {!isEditing && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingStageId(stageData.id);
                        setEditingStageName(stageData.name);
                      }}
                      data-testid={`button-edit-stage-${stageData.id}`}
                    >
                      <Pen className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <Badge variant="secondary" className="ml-2">
                  {items.length}
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddItem(stageData.name);
                  }}
                  data-testid={`button-add-item-${stageData.name.toLowerCase().replace(/\s+/g, '-')}`}
                  className="h-7"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Item
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                      data-testid={`button-menu-stage-${stageData.id}`}
                    >
                      <span className="text-lg leading-none">⋯</span>
                    </Button>
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
          </CardHeader>
          
          {isExpanded && (
            <CardContent ref={setDroppableRef} className="pt-2 pb-4 space-y-2">
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
            </CardContent>
          )}
        </Card>
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
const SCOPE_TYPES = ['e-note', 'scope', 'note', 'tool', 'material'] as const;
type ScopeItemType = typeof SCOPE_TYPES[number];

export default function ProjectScope() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  
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

  // Fetch scope stages
  const { data: scopeStages = [], isLoading: isLoadingStages } = useQuery<ScopeStage[]>({
    queryKey: [`/api/projects/${projectId}/scope-stages`],
    enabled: !!projectId,
  });

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

  // Update stage mutation
  const updateStageMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      return apiRequest(`/api/scope-stages/${id}`, 'PATCH', { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope-stages`] });
      toast({ title: "Stage updated successfully" });
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

  // Reorder stages mutation
  const reorderStagesMutation = useMutation({
    mutationFn: async (updates: { id: string; displayOrder: number }[]) => {
      return apiRequest('/api/scope-stages/reorder', 'POST', { updates });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope-stages`] });
    },
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

  // DnD sensors for items
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Separate DnD sensors for stages
  const stageSensors = useSensors(
    useSensor(PointerSensor),
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
          {/* Scope 2.0: Type Filter Chips */}
          <div className="flex items-center gap-2 px-3 py-1 bg-muted/30 rounded-lg">
            {SCOPE_TYPES.map((type) => (
              <Button
                key={type}
                size="sm"
                variant={activeTypeFilters.has(type) ? "default" : "ghost"}
                onClick={() => toggleTypeFilter(type)}
                className={`h-8 text-xs font-medium rounded-full transition-all ${
                  activeTypeFilters.has(type) 
                    ? 'shadow-md' 
                    : 'opacity-60 hover:opacity-100'
                }`}
                style={activeTypeFilters.has(type) ? {
                  backgroundColor: CASVA_LILAC,
                  color: 'white',
                  borderColor: CASVA_LILAC,
                } : {}}
                data-testid={`chip-filter-${type}`}
              >
                {getTypeLabel(type)}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Secondary Actions Bar */}
      <div className="flex items-center justify-end px-6 py-2 border-b bg-muted/20">
        <div className="flex items-center gap-2">
          {/* Add Stage - Icon Only */}
          <Dialog open={isAddStageDialogOpen} onOpenChange={setIsAddStageDialogOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-9 w-9" 
                    onClick={() => {
                      if (scopeStages.length > 0) {
                        setAddStageAfterId(scopeStages[scopeStages.length - 1].id);
                      }
                    }}
                    data-testid="button-add-stage"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
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

          {/* Load Template - Icon Only */}
          <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DialogTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9" data-testid="button-load-template">
                    <FileDown className="h-4 w-4" />
                  </Button>
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

          {/* Create PO */}
          {selectedItems.size > 0 && (
            <Dialog open={isPoDialogOpen} onOpenChange={setIsPoDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-create-po">
                  <Package className="h-4 w-4 mr-2" />
                  Create PO
                </Button>
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

          {/* Export PDF - Icon Only */}
          <Dialog open={isPdfDialogOpen} onOpenChange={(open) => {
            setIsPdfDialogOpen(open);
            if (!open) {
              setHideClientCosts(false); // Reset toggle when dialog closes
            }
          }}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DialogTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9" data-testid="button-export-pdf">
                    <FileText className="h-4 w-4" />
                  </Button>
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
          {scopeItems.length === 0 ? (
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
                    >
                      <strong className="text-xs">B</strong>
                    </Button>
                    <Button
                      type="button"
                      variant={addItemEditor.isActive('italic') ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => addItemEditor.chain().focus().toggleItalic().run()}
                      className="h-8 w-8 p-0"
                    >
                      <em className="text-xs">I</em>
                    </Button>
                    <Button
                      type="button"
                      variant={addItemEditor.isActive('bulletList') ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => addItemEditor.chain().focus().toggleBulletList().run()}
                      className="h-8 w-8 p-0"
                    >
                      <span className="text-xs">•</span>
                    </Button>
                    <Button
                      type="button"
                      variant={addItemEditor.isActive('orderedList') ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => addItemEditor.chain().focus().toggleOrderedList().run()}
                      className="h-8 w-8 p-0"
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
                Use the toolbar to format text with bold, italic, and lists
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
    </div>
  );
}
