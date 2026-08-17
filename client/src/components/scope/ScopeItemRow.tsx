import { useState, useEffect, useCallback, useRef, useLayoutEffect, CSSProperties } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  GripVertical,
  Trash2,
  CheckSquare,
  Upload,
  Pen,
  Save,
  Circle,
  CheckCircle2,
  X,
  Flag,
} from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Badge } from "@/components/ui/badge";
import { useSortable } from '@dnd-kit/sortable';
import type { ScopeItem } from "@shared/schema";
import { AddToTemplateDialog } from "./AddToTemplateDialog";
import type { ChecklistItem } from "./types";

export interface ScopeItemRowProps {
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
  showDescriptionInline?: boolean; // Show full description inline instead of hover
  dropIndicator?: 'above' | 'below' | null; // Drop indicator position
  dropTarget?: { id: string; position: 'above' | 'below' } | null; // Drop target for nested items
  onOpenDetail?: (itemId: string) => void; // Open the side detail panel for this item
  isDetailOpen?: boolean; // Whether this item is the one shown in the detail panel
}

export function ScopeItemRow({ item, onUpdate, onDelete, onToggleSelect, isSelected, level = 0, children = [], allItems = [], selectedItems = new Set(), isCollapsed = false, onToggleCollapse, getTypeLabel, collapsedItems, showDescriptionInline = false, dropIndicator, dropTarget, onOpenDetail, isDetailOpen = false }: ScopeItemRowProps) {
  const [showGearList, setShowGearList] = useState(false);
  const [showAddToTemplate, setShowAddToTemplate] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [uploadingGearIndex, setUploadingGearIndex] = useState<number | null>(null);
  const [newChecklistItemText, setNewChecklistItemText] = useState("");
  const [showChecklistItems, setShowChecklistItems] = useState(item.itemType === 'checklist');
  const [localTitle, setLocalTitle] = useState(item.title);
  const { toast } = useToast();

  useEffect(() => {
    setLocalTitle(item.title);
  }, [item.title]);

  // Height preservation refs for smooth drag placeholder
  const lastHeightRef = useRef<number>(40);
  const rowRef = useRef<HTMLDivElement>(null);

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
  } = useSortable({
    id: item.id,
    animateLayoutChanges: () => false, // Disable jank, use CSS transitions
  });

  // Measure height synchronously before drag state changes
  useLayoutEffect(() => {
    if (rowRef.current && !isDragging) {
      const height = rowRef.current.offsetHeight;
      if (height > 0) {
        lastHeightRef.current = height;
      }
    }
  });

  // Combine refs for measurement and sortable
  const combinedRef = useCallback((node: HTMLDivElement | null) => {
    (rowRef as { current: HTMLDivElement | null }).current = node;
    setNodeRef(node);
  }, [setNodeRef]);

  // Smooth Y-axis only transform with CSS transition
  const style: CSSProperties = {
    transform: transform ? `translateY(${Math.round(transform.y)}px)` : undefined,
    transition: transition || 'transform 150ms ease',
  };

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

  const isCompleted = item.isCompleted || false;

  const handleToggleComplete = () => {
    onUpdate(item.id, {
      isCompleted: !isCompleted,
      completedAt: !isCompleted ? new Date().toISOString() : null,
    });
  };

  // When dragging, render a placeholder that maintains height
  if (isDragging) {
    return (
      <div
        ref={combinedRef}
        style={{ height: lastHeightRef.current, minHeight: lastHeightRef.current }}
        className={`${level > 0 ? 'ml-8' : ''} relative bg-muted/50 border-b border-border rounded`}
        data-testid={`scope-item-placeholder-${item.id}`}
      >
        <div className="absolute inset-1 rounded border-2 border-dashed border-muted-foreground/30 pointer-events-none" />
      </div>
    );
  }

  return (
    <div
      ref={combinedRef}
      style={style}
      className={`${level > 0 ? 'ml-8' : ''} relative`}
      data-sortable-id={item.id}
    >
      {/* Drop indicator line - shows above or below based on position */}
      {dropIndicator === 'above' && (
        <div className="absolute -top-[2px] left-0 right-0 h-1 bg-primary z-50 rounded-full shadow-[0_0_8px_hsl(var(--primary)/0.6)]" />
      )}
      {dropIndicator === 'below' && (
        <div className="absolute -bottom-[2px] left-0 right-0 h-1 bg-primary z-50 rounded-full shadow-[0_0_8px_hsl(var(--primary)/0.6)]" />
      )}

      {/* Grid Row - compact by default; grows to fit when descriptions are inline */}
      <div
        className={`grid gap-2 px-2 border-b border-border/50 transition-all hover-elevate group cursor-pointer ${
          showDescriptionInline && item.description
            ? 'min-h-10 items-start py-2'
            : 'h-10 items-center'
        } ${
          isDetailOpen ? 'bg-primary/5' : isSelected ? 'bg-primary/5 border-primary/30' : ''
        } ${isCompleted ? 'opacity-60' : ''} ${item.isTodo ? 'border-l-2 border-amber bg-amber/5' : ''}`}
        style={{
          gridTemplateColumns: '24px 24px minmax(200px, 1fr) 100px minmax(150px, 2fr) 24px',
        }}
        data-testid={`scope-item-row-${item.id}`}
        onClick={(e) => {
          // Ignore clicks on interactive controls within the row
          const target = e.target as HTMLElement;
          if (target.closest('input, textarea, button, a, [role="checkbox"], [role="menuitem"], [data-no-detail-open="true"]')) {
            return;
          }
          onOpenDetail?.(item.id);
        }}
      >
        {/* Completion Toggle - 24px */}
        <button
          onClick={handleToggleComplete}
          className="flex items-center justify-center hover:scale-110 transition-transform"
          title={isCompleted ? "Mark as incomplete" : "Mark as complete"}
          data-testid={`button-toggle-complete-${item.id}`}
        >
          {isCompleted ? (
            <CheckCircle2 className="h-4 w-4 text-status-success" />
          ) : (
            <Circle className="h-4 w-4 text-muted-foreground/50 hover:text-muted-foreground" />
          )}
        </button>

        {/* Multi-select checkbox removed with the scope→estimate/RFQ/PO push
            (Scope-PR1). The selectedItems state and the onToggleSelect /
            isSelected plumbing are deliberately left in place — bulk actions
            return in PR4 and this is the render site to restore. */}

        {/* Drag - 24px */}
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical className="h-3 w-3 text-muted-foreground" />
        </div>

        {/* Item Name - minmax(200px, 1fr) */}
        <input
          value={localTitle}
          onChange={(e) => setLocalTitle(e.target.value)}
          onBlur={() => {
            if (localTitle !== item.title) {
              onUpdate(item.id, { title: localTitle });
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur();
            }
          }}
          className={`h-7 text-sm font-medium bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded px-2 ${isCompleted ? 'line-through text-muted-foreground' : ''}`}
          placeholder="Item name"
          data-testid={`input-scope-title-${item.id}`}
        />

        {/* Type - 100px */}
        <div className="flex items-center">
          {getTypeLabel && (
            <span
              className="h-4 px-1.5 text-data font-semibold rounded bg-primary/10 text-primary border border-primary/20 truncate"
              data-testid={`badge-type-${item.id}`}
            >
              {getTypeLabel(item.itemType)}
            </span>
          )}
        </div>

        {/* Description - minmax(150px, 2fr) */}
        <div className={`flex gap-1 ${showDescriptionInline && item.description ? 'items-start pt-1' : 'items-center'}`}>
          {showDescriptionInline ? (
            <div
              className="text-xs text-muted-foreground hover:text-foreground flex-1 break-words"
            >
              {item.description ? (
                <div
                  className="text-xs leading-relaxed whitespace-normal [&_*]:!text-inherit [&_*]:!text-xs"
                  dangerouslySetInnerHTML={{ __html: item.description }}
                />
              ) : (
                <span className="italic">-</span>
              )}
            </div>
          ) : (
            <HoverCard openDelay={200} closeDelay={100}>
              <HoverCardTrigger asChild>
                <div
                  className="text-xs text-muted-foreground truncate hover:text-foreground flex-1"
                >
                  {item.description ? (
                    <span className="line-clamp-1">{item.description.replace(/<[^>]*>/g, '')}</span>
                  ) : (
                    <span className="italic">-</span>
                  )}
                </div>
              </HoverCardTrigger>
              {item.description && (
                <HoverCardContent
                  className="w-80 p-3 z-[9999] bg-popover shadow-xl border border-border"
                  align="start"
                  side="bottom"
                  sideOffset={8}
                >
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</div>
                    <div
                      className="text-sm leading-relaxed text-foreground [&_*]:!text-inherit [&_*]:!opacity-100"
                      dangerouslySetInnerHTML={{ __html: item.description }}
                    />
                  </div>
                </HoverCardContent>
              )}
            </HoverCard>
          )}
          {gearList.length > 0 && (
            <button
              onClick={() => setShowGearList(true)}
              className="h-4 px-1.5 text-data font-semibold rounded bg-status-success-bg text-status-success border border-status-success/30 hover-elevate flex items-center gap-0.5"
              title={`${gearList.filter(g => g.checked).length}/${gearList.length} gear items checked`}
              data-testid={`button-gear-${item.id}`}
            >
              <CheckSquare className="h-2.5 w-2.5" />
              <span>{gearList.filter(g => g.checked).length}/{gearList.length}</span>
            </button>
          )}
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
              onClick={() => onOpenDetail?.(item.id)}
              data-testid={`menu-edit-description-${item.id}`}
            >
              <Pen className="h-3 w-3 mr-2" />
              Open Details
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onUpdate(item.id, { isTodo: !item.isTodo })}
              data-testid={`menu-toggle-todo-${item.id}`}
              className={item.isTodo ? 'text-status-warning' : ''}
            >
              <Flag className="h-3 w-3 mr-2" />
              {item.isTodo ? 'Clear Action Flag' : 'Flag as Action Item'}
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
        <div className="ml-16 border-l-2 border-primary/20 pl-4 py-2 space-y-1 bg-muted/20">
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
              className="flex-1 h-7 text-sm bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded px-2"
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
                    <Badge variant="outline" className="h-5 text-xs bg-status-success-bg text-status-success">
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
              <ScopeItemRow
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
                showDescriptionInline={showDescriptionInline}
                dropIndicator={dropTarget?.id === child.id ? dropTarget.position : null}
                dropTarget={dropTarget}
                onOpenDetail={onOpenDetail}
                isDetailOpen={isDetailOpen}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ScopeItemRow;
