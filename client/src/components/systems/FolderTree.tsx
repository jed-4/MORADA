import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  FolderPlus, 
  FilePlus, 
  Folder, 
  FolderOpen, 
  FileText, 
  MoreVertical, 
  Trash2, 
  Edit, 
  ChevronRight,
  ChevronDown,
  GripVertical
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverEvent,
  DragOverlay,
  useDroppable,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { SystemFolder, SystemDocument } from "@shared/schema";

interface SortableFolderProps {
  folder: SystemFolder;
  depth: number;
  isExpanded: boolean;
  hasChildren: boolean;
  isOver: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddSubfolder: () => void;
  onAddDocument: () => void;
}

function SortableFolder({
  folder,
  depth,
  isExpanded,
  hasChildren,
  isOver,
  onToggle,
  onEdit,
  onDelete,
  onAddSubfolder,
  onAddDocument,
}: SortableFolderProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver: isSortableOver,
  } = useSortable({ id: `folder-${folder.id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        paddingLeft: `${depth * 20 + 8}px`
      }}
      className={`flex items-center gap-2 py-1.5 px-2 hover-elevate rounded-md group ${isOver || isSortableOver ? 'ring-2 ring-primary bg-primary/5' : ''}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
        data-testid={`drag-handle-folder-${folder.id}`}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex items-center gap-1 flex-1 cursor-pointer" onClick={onToggle}>
        {hasChildren && (
          isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )
        )}
        {!hasChildren && <div className="w-4" />}
        {isExpanded ? (
          <FolderOpen className="h-4 w-4 text-primary" />
        ) : (
          <Folder className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="text-sm">{folder.name}</span>
      </div>
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" data-testid={`folder-menu-${folder.id}`}>
            <MoreVertical className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onAddSubfolder} data-testid="menu-add-subfolder">
            <FolderPlus className="h-4 w-4 mr-2" />
            Add Subfolder
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onAddDocument} data-testid="menu-add-document">
            <FilePlus className="h-4 w-4 mr-2" />
            Add Document
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onEdit} data-testid="menu-edit-folder">
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onDelete}
            className="text-destructive"
            data-testid="menu-delete-folder"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function RootDropZone({ isOver, isDragging }: { isOver: boolean; isDragging: boolean }) {
  const { setNodeRef } = useDroppable({
    id: 'root-drop-zone',
  });

  if (!isDragging) return null;

  return (
    <div
      ref={setNodeRef}
      className={`border-2 border-dashed rounded-md p-4 mb-2 text-center text-sm transition-colors ${
        isOver 
          ? 'border-primary bg-primary/10 text-primary' 
          : 'border-muted-foreground/30 text-muted-foreground'
      }`}
      data-testid="root-drop-zone"
    >
      {isOver ? 'Drop here to move to root level' : 'Drag here to move folder to root level'}
    </div>
  );
}

function DropIndicator({ 
  id, 
  isOver, 
  depth 
}: { 
  id: string; 
  isOver: boolean; 
  depth: number;
}) {
  const { setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{ paddingLeft: `${depth * 20 + 8}px` }}
      className={`h-1 transition-all ${
        isOver ? 'bg-primary h-2 my-1' : 'bg-transparent'
      }`}
      data-testid={`drop-indicator-${id}`}
    />
  );
}

export function FolderTree() {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [showDocumentDialog, setShowDocumentDialog] = useState(false);
  const [editingFolder, setEditingFolder] = useState<SystemFolder | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const { toast } = useToast();

  // Folder form state
  const [folderForm, setFolderForm] = useState({
    name: "",
    description: "",
    icon: "folder",
    parentId: null as string | null,
  });

  // Document form state
  const [documentForm, setDocumentForm] = useState({
    title: "",
    description: "",
    type: "document",
    fileUrl: "",
    folderId: null as string | null,
  });

  // Setup sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Fetch folders
  const { data: folders = [], isLoading: foldersLoading } = useQuery<SystemFolder[]>({
    queryKey: ["/api/systems/folders"],
  });

  // Fetch documents
  const { data: documents = [], isLoading: documentsLoading } = useQuery<SystemDocument[]>({
    queryKey: ["/api/systems/documents"],
  });

  // Create folder mutation
  const createFolderMutation = useMutation({
    mutationFn: (data: any) => apiRequest("/api/systems/folders", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/systems/folders"] });
      setShowFolderDialog(false);
      resetFolderForm();
      toast({ title: "Folder created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create folder", variant: "destructive" });
    },
  });

  // Update folder mutation
  const updateFolderMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => 
      apiRequest(`/api/systems/folders/${id}`, "PATCH", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/systems/folders"] });
      setShowFolderDialog(false);
      setEditingFolder(null);
      resetFolderForm();
      toast({ title: "Folder updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update folder", variant: "destructive" });
    },
  });

  // Delete folder mutation
  const deleteFolderMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/systems/folders/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/systems/folders"] });
      toast({ title: "Folder deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete folder", variant: "destructive" });
    },
  });

  // Reorder folders mutation
  const reorderFoldersMutation = useMutation({
    mutationFn: ({ folders }: { folders: { id: string; displayOrder: number }[] }) =>
      apiRequest("/api/systems/folders/reorder", "POST", { updates: folders }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/systems/folders"] });
    },
    onError: () => {
      toast({ title: "Failed to reorder folders", variant: "destructive" });
    },
  });

  // Create document mutation
  const createDocumentMutation = useMutation({
    mutationFn: (data: any) => apiRequest("/api/systems/documents", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/systems/documents"] });
      setShowDocumentDialog(false);
      resetDocumentForm();
      toast({ title: "Document created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create document", variant: "destructive" });
    },
  });

  // Delete document mutation
  const deleteDocumentMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/systems/documents/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/systems/documents"] });
      toast({ title: "Document deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete document", variant: "destructive" });
    },
  });

  const resetFolderForm = () => {
    setFolderForm({ name: "", description: "", icon: "folder", parentId: null });
  };

  const resetDocumentForm = () => {
    setDocumentForm({ title: "", description: "", type: "document", fileUrl: "", folderId: null });
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const openNewFolderDialog = (parentId: string | null = null) => {
    setEditingFolder(null);
    setFolderForm({ ...folderForm, parentId });
    setShowFolderDialog(true);
  };

  const openEditFolderDialog = (folder: SystemFolder) => {
    setEditingFolder(folder);
    setFolderForm({
      name: folder.name,
      description: folder.description || "",
      icon: folder.icon || "folder",
      parentId: folder.parentId || null,
    });
    setShowFolderDialog(true);
  };

  const openNewDocumentDialog = (folderId: string | null = null) => {
    setDocumentForm({ ...documentForm, folderId });
    setShowDocumentDialog(true);
  };

  const handleSaveFolder = () => {
    if (editingFolder) {
      updateFolderMutation.mutate({ id: editingFolder.id, data: folderForm });
    } else {
      createFolderMutation.mutate(folderForm);
    }
  };

  const handleSaveDocument = () => {
    createDocumentMutation.mutate(documentForm);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    setOverId(over ? String(over.id) : null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverId(null);

    if (!over || active.id === over.id) return;

    const isDraggingFolder = String(active.id).startsWith('folder-');
    const isOverFolder = String(over.id).startsWith('folder-');
    const isOverRootZone = over.id === 'root-drop-zone';
    const isOverBefore = String(over.id).startsWith('before-');
    const isOverAfter = String(over.id).startsWith('after-');

    if (!isDraggingFolder) return;

    const draggedFolderId = String(active.id).replace('folder-', '');
    const draggedFolder = folders.find(f => f.id === draggedFolderId);

    if (!draggedFolder) return;

    // Handle drop on root zone
    if (isOverRootZone) {
      // If already at root level, just reorder root folders
      if (draggedFolder.parentId === null) {
        const rootFolders = folders
          .filter(f => f.parentId === null)
          .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
        
        const currentIndex = rootFolders.findIndex(f => f.id === draggedFolderId);
        const newIndex = rootFolders.length - 1; // Move to end
        
        if (currentIndex !== -1 && currentIndex !== newIndex) {
          const reorderedFolders = arrayMove(rootFolders, currentIndex, newIndex);
          const updates = reorderedFolders.map((f, index) => ({
            id: f.id,
            displayOrder: index
          }));

          reorderFoldersMutation.mutate({ folders: updates });
        }
      } else {
        // Moving from subfolder to root
        const rootFolders = folders.filter(f => f.parentId === null);
        const newOrder = rootFolders.length;

        // Update dragged folder to root
        updateFolderMutation.mutate({
          id: draggedFolderId,
          data: { parentId: null, displayOrder: newOrder }
        });

        // Reindex origin level
        const originFolders = folders
          .filter(f => f.parentId === draggedFolder.parentId && f.id !== draggedFolderId)
          .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

        if (originFolders.length > 0) {
          const reorderUpdates = originFolders.map((f, index) => ({
            id: f.id,
            displayOrder: index
          }));

          reorderFoldersMutation.mutate({ folders: reorderUpdates });
        }
      }
      return;
    }

    // Handle drop on before/after indicators (reordering)
    if (isOverBefore || isOverAfter) {
      const targetFolderId = String(over.id).replace('before-', '').replace('after-', '');
      const targetFolder = folders.find(f => f.id === targetFolderId);

      if (!targetFolder) return;

      // Prevent circular nesting: check if target or its parent is a descendant of dragged folder
      const isDescendant = (potentialDescendantId: string | null): boolean => {
        if (!potentialDescendantId) return false;
        if (potentialDescendantId === draggedFolderId) return true;
        const folder = folders.find(f => f.id === potentialDescendantId);
        if (!folder) return false;
        return isDescendant(folder.parentId);
      };

      if (isDescendant(targetFolderId) || isDescendant(targetFolder.parentId)) {
        toast({ title: "Cannot move folder into its own descendant", variant: "destructive" });
        return;
      }

      // Get all folders at the target's level
      const sameLevelFolders = folders
        .filter(f => f.parentId === targetFolder.parentId)
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

      const draggedIndex = sameLevelFolders.findIndex(f => f.id === draggedFolderId);
      const targetIndex = sameLevelFolders.findIndex(f => f.id === targetFolderId);

      // If dragging to a different level
      if (draggedFolder.parentId !== targetFolder.parentId) {
        // Calculate insert position
        const insertIndex = isOverAfter ? targetIndex + 1 : targetIndex;
        
        // Reindex destination level folders
        const destinationFolders = [...sameLevelFolders];
        destinationFolders.splice(insertIndex, 0, draggedFolder);
        
        // Reindex origin level folders (remove dragged folder)
        const originFolders = folders
          .filter(f => f.parentId === draggedFolder.parentId && f.id !== draggedFolderId)
          .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

        const updates = [
          // Update dragged folder's parent and order
          { id: draggedFolderId, parentId: targetFolder.parentId, displayOrder: insertIndex },
          // Reindex destination level
          ...destinationFolders.map((f, index) => ({
            id: f.id,
            displayOrder: index
          })).filter(u => u.id !== draggedFolderId),
          // Reindex origin level
          ...originFolders.map((f, index) => ({
            id: f.id,
            displayOrder: index
          }))
        ];

        // Remove duplicates and update only changed folders
        const uniqueUpdates = updates.reduce((acc, curr) => {
          const existing = acc.find(u => u.id === curr.id);
          if (!existing) {
            acc.push(curr);
          } else {
            Object.assign(existing, curr);
          }
          return acc;
        }, [] as any[]);

        // Update dragged folder
        updateFolderMutation.mutate({
          id: draggedFolderId,
          data: { 
            parentId: targetFolder.parentId, 
            displayOrder: insertIndex 
          }
        });

        // Reorder all affected folders
        const reorderUpdates = uniqueUpdates
          .filter(u => u.id !== draggedFolderId)
          .map(u => ({ id: u.id, displayOrder: u.displayOrder }));
        
        if (reorderUpdates.length > 0) {
          reorderFoldersMutation.mutate({ folders: reorderUpdates });
        }
      } else {
        // Reordering within same level
        if (draggedIndex === -1 || targetIndex === -1) return;

        let newIndex = targetIndex;
        if (isOverAfter) {
          newIndex = draggedIndex < targetIndex ? targetIndex : targetIndex + 1;
        } else {
          newIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
        }

        if (draggedIndex !== newIndex) {
          const reorderedFolders = arrayMove(sameLevelFolders, draggedIndex, newIndex);
          const updates = reorderedFolders.map((f, index) => ({
            id: f.id,
            displayOrder: index
          }));

          reorderFoldersMutation.mutate({ folders: updates });
        }
      }
      return;
    }

    // Handle drop on folder (nesting)
    if (isOverFolder) {
      const overFolderId = String(over.id).replace('folder-', '');
      const overFolder = folders.find(f => f.id === overFolderId);

      if (!overFolder || draggedFolderId === overFolderId) return;

      // If dropping onto current parent, treat as no-op
      if (draggedFolder.parentId === overFolderId) {
        return;
      }

      // Prevent circular nesting
      let checkFolder = overFolder;
      while (checkFolder.parentId) {
        if (checkFolder.parentId === draggedFolderId) {
          toast({ title: "Cannot nest folder into its own descendant", variant: "destructive" });
          return;
        }
        checkFolder = folders.find(f => f.id === checkFolder.parentId) || checkFolder;
        if (checkFolder.id === overFolder.id) break;
      }

      // Update parent and move to new location
      // Filter out dragged folder when calculating new order
      const siblingsInNewParent = folders.filter(f => f.parentId === overFolderId && f.id !== draggedFolderId);
      const newOrder = siblingsInNewParent.length;

      updateFolderMutation.mutate({
        id: draggedFolderId,
        data: { parentId: overFolderId, displayOrder: newOrder }
      });

      // Reindex origin level
      const originFolders = folders
        .filter(f => f.parentId === draggedFolder.parentId && f.id !== draggedFolderId)
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

      if (originFolders.length > 0) {
        const reorderUpdates = originFolders.map((f, index) => ({
          id: f.id,
          displayOrder: index
        }));

        reorderFoldersMutation.mutate({ folders: reorderUpdates });
      }
    }
  };

  // Build folder hierarchy
  const buildFolderTree = (parentId: string | null = null): SystemFolder[] => {
    return folders
      .filter((f) => f.parentId === parentId)
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  };

  const getFolderDocuments = (folderId: string | null) => {
    return documents.filter((d) => d.folderId === folderId);
  };

  const renderFolder = (folder: SystemFolder, depth: number = 0, isLast: boolean = false): React.ReactNode => {
    const isExpanded = expandedFolders.has(folder.id);
    const childFolders = buildFolderTree(folder.id);
    const folderDocs = getFolderDocuments(folder.id);
    const hasChildren = childFolders.length > 0 || folderDocs.length > 0;
    const isOver = overId === `folder-${folder.id}`;

    return (
      <div key={folder.id}>
        <DropIndicator 
          id={`before-${folder.id}`}
          isOver={overId === `before-${folder.id}`}
          depth={depth}
        />
        
        <SortableFolder
          folder={folder}
          depth={depth}
          isExpanded={isExpanded}
          hasChildren={hasChildren}
          isOver={isOver}
          onToggle={() => toggleFolder(folder.id)}
          onEdit={() => openEditFolderDialog(folder)}
          onDelete={() => deleteFolderMutation.mutate(folder.id)}
          onAddSubfolder={() => openNewFolderDialog(folder.id)}
          onAddDocument={() => openNewDocumentDialog(folder.id)}
        />

        {isExpanded && (
          <div>
            {childFolders.map((child, index) => 
              renderFolder(child, depth + 1, index === childFolders.length - 1)
            )}
            {folderDocs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-2 py-1.5 px-2 hover-elevate rounded-md group"
                style={{ paddingLeft: `${(depth + 1) * 20 + 24}px` }}
              >
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm flex-1">{doc.title}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                  onClick={() => deleteDocumentMutation.mutate(doc.id)}
                  data-testid={`delete-document-${doc.id}`}
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
        
        {isLast && (
          <DropIndicator 
            id={`after-${folder.id}`}
            isOver={overId === `after-${folder.id}`}
            depth={depth}
          />
        )}
      </div>
    );
  };

  if (foldersLoading || documentsLoading) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">Loading...</div>
      </Card>
    );
  }

  const rootFolders = buildFolderTree(null);
  const rootDocuments = getFolderDocuments(null);
  const allFolderIds = folders.map(f => `folder-${f.id}`);

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center gap-2">
        <Button onClick={() => openNewFolderDialog()} data-testid="button-new-folder">
          <FolderPlus className="h-4 w-4 mr-2" />
          New Folder
        </Button>
        <Button variant="outline" onClick={() => openNewDocumentDialog()} data-testid="button-new-document">
          <FilePlus className="h-4 w-4 mr-2" />
          New Document
        </Button>
      </div>

      <Card className="flex-1 p-4 overflow-auto">
        {rootFolders.length === 0 && rootDocuments.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            No folders or documents yet. Create your first folder to get started.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={allFolderIds} strategy={verticalListSortingStrategy}>
              <div>
                <RootDropZone 
                  isOver={overId === 'root-drop-zone'} 
                  isDragging={activeId !== null}
                />
                {rootFolders.map((folder, index) => 
                  renderFolder(folder, 0, index === rootFolders.length - 1)
                )}
                {rootDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-2 py-1.5 px-2 hover-elevate rounded-md group"
                  >
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm flex-1">{doc.title}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={() => deleteDocumentMutation.mutate(doc.id)}
                      data-testid={`delete-document-${doc.id}`}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </SortableContext>
            <DragOverlay>
              {activeId && (() => {
                const folderId = activeId.replace('folder-', '');
                const draggedFolder = folders.find(f => f.id === folderId);
                return draggedFolder ? (
                  <div className="flex items-center gap-2 py-1.5 px-2 bg-card border rounded-md shadow-lg">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <Folder className="h-4 w-4 text-primary" />
                    <span className="text-sm">{draggedFolder.name}</span>
                  </div>
                ) : null;
              })()}
            </DragOverlay>
          </DndContext>
        )}
      </Card>

      {/* Folder Dialog */}
      <Dialog open={showFolderDialog} onOpenChange={(open) => {
        setShowFolderDialog(open);
        if (!open) {
          setEditingFolder(null);
          resetFolderForm();
        }
      }}>
        <DialogContent data-testid="dialog-folder">
          <DialogHeader>
            <DialogTitle>{editingFolder ? "Edit Folder" : "New Folder"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div>
              <Label>Name</Label>
              <Input
                value={folderForm.name}
                onChange={(e) => setFolderForm({ ...folderForm, name: e.target.value })}
                placeholder="Folder name"
                data-testid="input-folder-name"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={folderForm.description}
                onChange={(e) => setFolderForm({ ...folderForm, description: e.target.value })}
                placeholder="Optional description"
                data-testid="input-folder-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFolderDialog(false)} data-testid="button-cancel-folder">
              Cancel
            </Button>
            <Button onClick={handleSaveFolder} data-testid="button-save-folder">
              {editingFolder ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document Dialog */}
      <Dialog open={showDocumentDialog} onOpenChange={(open) => {
        setShowDocumentDialog(open);
        if (!open) {
          resetDocumentForm();
        }
      }}>
        <DialogContent data-testid="dialog-document">
          <DialogHeader>
            <DialogTitle>New Document</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div>
              <Label>Title</Label>
              <Input
                value={documentForm.title}
                onChange={(e) => setDocumentForm({ ...documentForm, title: e.target.value })}
                placeholder="Document title"
                data-testid="input-document-title"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={documentForm.description}
                onChange={(e) => setDocumentForm({ ...documentForm, description: e.target.value })}
                placeholder="Optional description"
                data-testid="input-document-description"
              />
            </div>
            <div>
              <Label>File URL</Label>
              <Input
                value={documentForm.fileUrl}
                onChange={(e) => setDocumentForm({ ...documentForm, fileUrl: e.target.value })}
                placeholder="https://example.com/document.pdf"
                data-testid="input-document-url"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDocumentDialog(false)} data-testid="button-cancel-document">
              Cancel
            </Button>
            <Button onClick={handleSaveDocument} data-testid="button-save-document">
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
