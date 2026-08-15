import { useState, useRef } from "react";
import { usePermission } from "@/hooks/use-permission";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Check,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Trash2,
  Pen,
  X,
  ClipboardList,
  Paperclip,
  Loader2,
  Clock,
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
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
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ScopeItem, ScopeStage, LabourHoursBudget } from "@shared/schema";
import { ScopeItemRow } from "./ScopeItemRow";
import { InlineAddItemRow } from "./InlineAddItemRow";
import { LinkedPOsPanel } from "./panels/LinkedPOsPanel";
import { LinkedSchedulePanel } from "./panels/LinkedSchedulePanel";
import { LinkedChecklistsPanel } from "./panels/LinkedChecklistsPanel";
import { LinkedTasksPanel } from "./panels/LinkedTasksPanel";
import { LabourTrackersPanel } from "./panels/LabourTrackersPanel";
import type {
  LinkedPOForStage,
  LinkedScheduleItemForStage,
  LinkedChecklistForStage,
  ProjectChecklistForStage,
  ProjectTaskForStage,
  StageLabourTracker,
} from "./types";

export interface StageCardProps {
  stageData: ScopeStage;
  items: ScopeItem[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (id: string, data: Partial<ScopeItem>) => void;
  onDelete: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onStartInlineAdd: (stage: string) => void;
  addingForStage?: string | null;
  onSaveInlineAdd?: (title: string, stage: string) => void;
  onCancelInlineAdd?: () => void;
  onOpenDetail?: (itemId: string) => void;
  detailItemId?: string | null;
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
  allProjectPOs?: LinkedPOForStage[]; // All project POs (for link picker)
  onLinkPO?: (poId: string, stageId: string) => void; // Link PO to this stage
  onUnlinkPO?: (poId: string) => void; // Unlink PO from this stage
  linkedScheduleItems?: LinkedScheduleItemForStage[]; // Linked Schedule Items
  onViewScheduleItem?: (itemId: string) => void; // Handler to view schedule item details
  showDescriptionInline?: boolean; // Show descriptions inline instead of hover
  dropTarget?: { id: string; position: 'above' | 'below' } | null; // Drop indicator target
  onToggleStageComplete?: (stageId: string, isCompleted: boolean) => void; // Stage completion
  checklistCount?: number; // Number of checklist instances linked to this stage
  onNavigateToChecklists?: (stageId: string) => void; // Navigate to checklists filtered by stage
  linkedChecklists?: LinkedChecklistForStage[]; // Inline linked checklists
  allProjectChecklists?: ProjectChecklistForStage[]; // All project checklists (for link picker)
  onLinkChecklist?: (checklistId: string, stageId: string) => void;
  onUnlinkChecklist?: (checklistId: string) => void;
  onAddStageAttachment?: (stageId: string, file: File) => void;
  onDeleteStageAttachment?: (stageId: string, attachmentId: string) => void;
  onPreviewAttachment?: (att: { name: string; objectPath: string; size: number }) => void;
  isAttachmentUploading?: boolean;
  allProjectTasks?: ProjectTaskForStage[];
  onLinkTask?: (taskId: string, stageId: string) => void;
  onUnlinkTask?: (taskId: string) => void;
  labourBudgetData?: LabourHoursBudget[];
  onUpdateLabourTrackers?: (stageId: string, trackers: StageLabourTracker[]) => void;
}

export function StageCard({
  stageData,
  items,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onDelete,
  onToggleSelect,
  onStartInlineAdd,
  addingForStage = null,
  onSaveInlineAdd,
  onCancelInlineAdd,
  onOpenDetail,
  detailItemId = null,
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
  showDescriptionInline = false, // Show descriptions inline
  linkedPOs = [], // Linked Purchase Orders
  onViewPO, // Handler to view PO details
  allProjectPOs = [], // All project POs for link picker
  onLinkPO, // Link PO to stage
  onUnlinkPO, // Unlink PO from stage
  linkedScheduleItems = [], // Linked Schedule Items
  onViewScheduleItem, // Handler to view schedule item details
  dropTarget, // Drop indicator target
  onToggleStageComplete, // Stage completion toggle
  checklistCount = 0, // Linked checklists count
  onNavigateToChecklists, // Navigate to filtered checklists
  linkedChecklists = [], // Inline linked checklists
  allProjectChecklists = [], // All project checklists for link picker
  onLinkChecklist,
  onUnlinkChecklist,
  onAddStageAttachment,
  onDeleteStageAttachment,
  onPreviewAttachment,
  isAttachmentUploading = false,
  allProjectTasks = [],
  onLinkTask,
  onUnlinkTask,
  labourBudgetData = [],
  onUpdateLabourTrackers,
}: StageCardProps) {
  const [showLabourPicker, setShowLabourPicker] = useState(false);
  const canViewLabourBudget = usePermission("financial.budget_labour", "view");
  const stageAttachments = (Array.isArray((stageData as any).attachments) ? (stageData as any).attachments : []) as Array<{
    id: string; name: string; objectPath: string; size: number; uploadedAt: string;
  }>;
  const attachFileInputRef = useRef<HTMLInputElement>(null);
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

  const stageLabourTrackers: StageLabourTracker[] = Array.isArray(stageData.labourTrackers)
    ? (stageData.labourTrackers as StageLabourTracker[])
    : [];

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={`mb-3 ${level > 0 ? 'ml-8' : ''}`}
      >
        <div
          className={`rounded-xl bg-card border border-border shadow-sm transition-all duration-200 overflow-hidden ${
            isOver && isDraggingStage ? 'ring-2 ring-primary/50 bg-primary/10' : ''
          }`}
        >
          {/* Stage Header - h-9, collapsible */}
          <div
            className={`h-9 px-3 flex items-center justify-between border-b border-border group cursor-pointer hover-elevate transition-colors ${
              stageData.isCompleted
                ? 'bg-sage/10'
                : 'bg-muted/60 dark:bg-muted/40'
            }`}
            onClick={onToggleExpand}
            data-testid={`stage-header-${stageData.id}`}
          >
            <div className="flex items-center gap-2">
              {/* Stage Completion Checkbox */}
              {onToggleStageComplete && (
                <button
                  className={`h-5 w-5 flex-shrink-0 flex items-center justify-center rounded border-2 transition-colors ${
                    stageData.isCompleted
                      ? 'bg-sage border-sage text-white'
                      : 'border-muted-foreground/40 bg-transparent hover:border-sage'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleStageComplete(stageData.id, !stageData.isCompleted);
                  }}
                  data-testid={`button-toggle-stage-complete-${stageData.id}`}
                  title={stageData.isCompleted ? "Mark stage as incomplete" : "Mark stage as complete"}
                >
                  {stageData.isCompleted && <Check className="h-3 w-3" />}
                </button>
              )}

              {/* Chevron */}
              {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}

              {/* Drag Handle */}
              <div
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity p-1 -ml-1 rounded hover:bg-accent/50"
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
                  className={`text-sm font-semibold ${stageData.isCompleted ? 'line-through text-muted-foreground' : ''}`}
                  data-testid={`text-stage-name-${stageData.id}`}
                >
                  {stageData.name}
                </span>
              )}
              {stageData.isCompleted && (
                <span className="text-data text-status-success font-medium">✓ Complete</span>
              )}

              {/* Item Count Badge */}
              {items.length > 0 && (
                <span className="h-4 px-1.5 text-data font-semibold rounded bg-primary/10 text-primary border border-primary/20">
                  {items.length}
                </span>
              )}

              {/* Linked Checklists Badge */}
              {checklistCount > 0 && (
                <button
                  className="h-4 px-1.5 text-data font-semibold rounded bg-primary/10 text-primary border border-primary/20 flex items-center gap-0.5 hover-elevate"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigateToChecklists?.(stageData.id);
                  }}
                  title="Click to view linked checklists"
                  data-testid={`badge-stage-checklists-${stageData.id}`}
                >
                  <ClipboardList className="h-2.5 w-2.5" />
                  {checklistCount} checklist{checklistCount !== 1 ? 's' : ''}
                </button>
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
                className="h-6 px-2 text-data font-medium rounded-md border border-border/50 hover-elevate active-elevate-2 flex items-center gap-0.5"
                onClick={(e) => {
                  e.stopPropagation();
                  onStartInlineAdd(stageData.name);
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
                    Add Stage Below
                  </DropdownMenuItem>
                  {canViewLabourBudget && (
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowLabourPicker(true);
                      }}
                      data-testid={`menu-add-labour-tracker-${stageData.id}`}
                    >
                      <Clock className="h-4 w-4 mr-2" />
                      Add Labour Tracker
                    </DropdownMenuItem>
                  )}
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
                  className={`text-center text-muted-foreground text-xs border-2 border-dashed rounded-lg transition-all flex items-center justify-center h-[60px] ${isDroppableOver ? 'bg-primary/5 border-primary shadow-md' : 'border-primary/40'}`}
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
                    <ScopeItemRow
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
                      showDescriptionInline={showDescriptionInline}
                      dropIndicator={dropTarget?.id === item.id ? dropTarget.position : null}
                      dropTarget={dropTarget}
                      onOpenDetail={onOpenDetail}
                      isDetailOpen={detailItemId === item.id}
                    />
                  ))}
                </SortableContext>
              )}

              {/* Inline blank-row add for this stage */}
              {addingForStage === stageData.name && (
                <InlineAddItemRow
                  stage={stageData.name}
                  onSave={(title) => onSaveInlineAdd?.(title, stageData.name)}
                  onCancel={() => onCancelInlineAdd?.()}
                />
              )}

              {/* Linked Purchase Orders */}
              <LinkedPOsPanel
                stageId={stageData.id}
                stageName={stageData.name}
                linkedPOs={linkedPOs}
                allProjectPOs={allProjectPOs}
                onViewPO={onViewPO}
                onLinkPO={onLinkPO}
                onUnlinkPO={onUnlinkPO}
              />

              {/* Linked Schedule Items */}
              <LinkedSchedulePanel
                stageId={stageData.id}
                stageName={stageData.name}
                linkedScheduleItems={linkedScheduleItems}
                onViewScheduleItem={onViewScheduleItem}
              />

              {/* Linked Checklists */}
              <LinkedChecklistsPanel
                stageId={stageData.id}
                stageName={stageData.name}
                linkedChecklists={linkedChecklists}
                allProjectChecklists={allProjectChecklists}
                onLinkChecklist={onLinkChecklist}
                onUnlinkChecklist={onUnlinkChecklist}
                onNavigateToChecklists={onNavigateToChecklists}
              />

              {/* Linked Tasks */}
              <LinkedTasksPanel
                stageId={stageData.id}
                stageName={stageData.name}
                allProjectTasks={allProjectTasks}
                onLinkTask={onLinkTask}
                onUnlinkTask={onUnlinkTask}
              />

              {/* Labour Trackers — only visible to users with financial.budget_labour permission */}
              {canViewLabourBudget && (
                <LabourTrackersPanel
                  stageId={stageData.id}
                  stageName={stageData.name}
                  trackers={stageLabourTrackers}
                  labourBudgetData={labourBudgetData}
                  onUpdateLabourTrackers={onUpdateLabourTrackers}
                />
              )}

              {/* Stage Attachments */}
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between px-2">
                  <div className="text-data font-medium text-muted-foreground uppercase tracking-wide">
                    Attachments
                  </div>
                  <button
                    className="h-4 w-4 flex items-center justify-center rounded text-muted-foreground hover-elevate active-elevate-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    title={isAttachmentUploading ? "Uploading…" : "Attach a file to this stage"}
                    disabled={isAttachmentUploading}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isAttachmentUploading) return;
                      attachFileInputRef.current?.click();
                    }}
                    data-testid={`button-attach-file-${stageData.id}`}
                  >
                    {isAttachmentUploading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Plus className="h-3 w-3" />
                    )}
                  </button>
                  <input
                    ref={attachFileInputRef}
                    type="file"
                    className="hidden"
                    disabled={isAttachmentUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) onAddStageAttachment?.(stageData.id, file);
                    }}
                    data-testid={`input-attach-file-${stageData.id}`}
                  />
                </div>
                {stageAttachments.map((att) => (
                  <div
                    key={att.id}
                    className="h-9 flex items-center gap-2 px-3 rounded-lg border border-border/50 bg-background/80 group"
                  >
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <button
                      type="button"
                      onClick={() =>
                        onPreviewAttachment?.({
                          name: att.name,
                          objectPath: att.objectPath,
                          size: att.size,
                        })
                      }
                      className="flex-1 min-w-0 text-left text-sm truncate hover:underline"
                      title={`Preview ${att.name}`}
                      data-testid={`button-preview-attachment-${att.id}`}
                    >
                      {att.name}
                    </button>
                    <span className="text-data text-muted-foreground shrink-0">
                      {att.size < 1024 * 1024
                        ? `${Math.round(att.size / 1024)}KB`
                        : `${(att.size / (1024 * 1024)).toFixed(1)}MB`}
                    </span>
                    <button
                      className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover-elevate shrink-0"
                      title="Remove attachment"
                      onClick={() => onDeleteStageAttachment?.(stageData.id, att.id)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
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
              <StageCard
                key={childStage.id}
                stageData={childStage}
                items={childItems}
                // NOTE (Scope-PR2): `stageExpanded` is not in scope here and never
                // has been — it is the page's state, never threaded through as a
                // prop. Rendering a nested child stage therefore throws a
                // ReferenceError. Carried across verbatim from ProjectScope.tsx
                // so this refactor stays behaviour-neutral; fixing it is its own
                // change.
                isExpanded={stageExpanded[childStage.name] ?? true}
                onToggleExpand={onToggleExpand}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onToggleSelect={onToggleSelect}
                onStartInlineAdd={onStartInlineAdd}
                addingForStage={addingForStage}
                onSaveInlineAdd={onSaveInlineAdd}
                onCancelInlineAdd={onCancelInlineAdd}
                onOpenDetail={onOpenDetail}
                detailItemId={detailItemId}
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
                showDescriptionInline={showDescriptionInline}
                dropTarget={dropTarget}
                onToggleStageComplete={onToggleStageComplete}
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

      {/* Labour Tracker Picker Dialog */}
      <Dialog open={showLabourPicker} onOpenChange={setShowLabourPicker}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Labour Tracker</DialogTitle>
            <DialogDescription>
              Select a labour cost code to track on the "{stageData.name}" stage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {labourBudgetData.length === 0 ? (
              <EmptyState
                variant="inline"
                title="No labour cost codes found"
                description="Add a labour budget to this project first."
                className="py-8"
              />
            ) : (() => {
              const currentTrackers: StageLabourTracker[] = Array.isArray(stageData.labourTrackers) ? (stageData.labourTrackers as StageLabourTracker[]) : [];
              const alreadyPinned = new Set(currentTrackers.map(t => t.costCodeId));
              return labourBudgetData.map((row) => {
                const isPinned = alreadyPinned.has(row.costCodeId ?? '');
                return (
                  <button
                    key={row.id}
                    className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-3 hover-elevate active-elevate-2 ${isPinned ? 'opacity-50 cursor-not-allowed' : ''}`}
                    disabled={isPinned || !row.costCodeId}
                    onClick={() => {
                      if (!row.costCodeId || isPinned) return;
                      const updated = [...currentTrackers, { costCodeId: row.costCodeId }];
                      onUpdateLabourTrackers?.(stageData.id, updated);
                      setShowLabourPicker(false);
                    }}
                    data-testid={`labour-picker-${row.costCodeId}`}
                  >
                    <Clock className="h-4 w-4 text-teal shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{row.costCodeTitle || row.costCodeId}</div>
                      {row.categoryTitle && (
                        <div className="text-xs text-muted-foreground truncate">{row.categoryTitle}</div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0">
                      {(Number(row.budgetedHours) || 0).toFixed(1)} hrs budgeted
                    </div>
                    {isPinned && (
                      <Check className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    )}
                  </button>
                );
              });
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLabourPicker(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default StageCard;
