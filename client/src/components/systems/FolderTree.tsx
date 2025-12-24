import { useState, useImperativeHandle, forwardRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  GripVertical,
  ExternalLink,
  Plus
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ProjectSelect } from "@/components/ProjectSelect";
import { UserSelect } from "@/components/UserSelect";
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

interface SortableDocumentProps {
  document: SystemDocument;
  depth: number;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCreateTask?: (templateId: string) => void;
}

function SortableDocument({
  document,
  depth,
  onView,
  onEdit,
  onDelete,
  onCreateTask,
}: SortableDocumentProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `document-${document.id}` });

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
        marginLeft: `${depth * 20 + 24}px`
      }}
      className="hover-elevate rounded-md group mb-2"
    >
      <Card className="p-2">
        <div className="flex items-center gap-2">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
            data-testid={`drag-handle-document-${document.id}`}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <div 
            className="font-medium text-sm cursor-pointer hover:text-primary transition-colors flex-1 min-w-0 truncate"
            onClick={onView}
            data-testid={`view-document-${document.id}`}
          >
            {document.title}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {document.role && (
              <Badge variant="outline" className="text-xs">
                {document.role}
              </Badge>
            )}
            {document.status && (
              <Badge variant="secondary" className="text-xs">
                {document.status}
              </Badge>
            )}
            {document.taskTemplateName && (
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="text-xs bg-primary/5 border-primary/20">
                  📋 {document.taskTemplateName}
                </Badge>
                {onCreateTask && document.taskTemplateId && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateTask(document.taskTemplateId);
                    }}
                    data-testid={`create-task-from-template-${document.id}`}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                )}
              </div>
            )}
            {document.fileUrl && (
              <a
                href={document.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline whitespace-nowrap"
                data-testid={`link-file-${document.id}`}
              >
                <ExternalLink className="h-3 w-3" />
                Open File
              </a>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 opacity-0 group-hover:opacity-100 flex-shrink-0" 
                data-testid={`document-menu-${document.id}`}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onView} data-testid="menu-view-document">
                <FileText className="h-4 w-4 mr-2" />
                View
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit} data-testid="menu-edit-document">
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive"
                data-testid="menu-delete-document"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Card>
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

export interface FolderTreeHandle {
  openNewFolderDialog: () => void;
  openNewDocumentDialog: () => void;
}

interface FolderTreeProps {
  searchQuery?: string;
}

export const FolderTree = forwardRef<FolderTreeHandle, FolderTreeProps>(({ searchQuery }, ref) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [showDocumentDialog, setShowDocumentDialog] = useState(false);
  const [showDocumentViewDialog, setShowDocumentViewDialog] = useState(false);
  const [showCreateTaskDialog, setShowCreateTaskDialog] = useState(false);
  const [editingFolder, setEditingFolder] = useState<SystemFolder | null>(null);
  const [editingDocument, setEditingDocument] = useState<SystemDocument | null>(null);
  const [viewingDocument, setViewingDocument] = useState<SystemDocument | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const { toast} = useToast();

  // Note: useImperativeHandle will be added after dialog functions are defined

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
    role: "",
    status: "",
    taskTemplateId: "",
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

  // Fetch user roles for role dropdown
  const { data: roles = [] } = useQuery<any[]>({
    queryKey: ["/api/user-roles"],
  });

  // Fetch status options from field categories
  const { data: statusCategory } = useQuery<any>({
    queryKey: ["/api/field-categories/by-key/systemDocument.status"],
  });

  // Fetch task templates
  const { data: taskTemplates = [] } = useQuery<any[]>({
    queryKey: ["/api/systems/task-templates"],
  });

  // Fetch projects for task creation
  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ["/api/projects"],
  });

  // Fetch users for assignee selection
  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  // Task form state for creating from template
  const [taskForm, setTaskForm] = useState({
    projectId: "",
    dueDate: "",
    assigneeId: "",
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

  // Update document mutation
  const updateDocumentMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => 
      apiRequest(`/api/systems/documents/${id}`, "PATCH", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/systems/documents"] });
      setShowDocumentDialog(false);
      setEditingDocument(null);
      resetDocumentForm();
      toast({ title: "Document updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update document", variant: "destructive" });
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

  // Reorder documents mutation
  const reorderDocumentsMutation = useMutation({
    mutationFn: ({ documents }: { documents: { id: string; displayOrder: number; folderId?: string | null }[] }) =>
      apiRequest("/api/systems/documents/reorder", "POST", { updates: documents }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/systems/documents"] });
    },
    onError: () => {
      toast({ title: "Failed to reorder documents", variant: "destructive" });
    },
  });

  // Create task from template mutation
  const createTaskFromTemplateMutation = useMutation({
    mutationFn: async (data: { template: any; projectId: string; dueDate?: string; assigneeId?: string }) => {
      const taskData = {
        type: "task",
        title: data.template.title,
        content: data.template.description || "",
        projectId: data.projectId,
        status: "todo",
        priority: "low",
        dueDate: data.dueDate ? new Date(data.dueDate).toISOString() : undefined,
        assigneeId: data.assigneeId || undefined,
        tags: data.template.tags || [],
        customFields: {},
      };
      return apiRequest("/api/tasks", "POST", taskData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setShowCreateTaskDialog(false);
      setSelectedTemplate(null);
      setTaskForm({ projectId: "", dueDate: "", assigneeId: "" });
      toast({ title: "Task created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create task", variant: "destructive" });
    },
  });

  const resetFolderForm = () => {
    setFolderForm({ name: "", description: "", icon: "folder", parentId: null });
  };

  const resetDocumentForm = () => {
    setDocumentForm({ title: "", description: "", type: "document", fileUrl: "", folderId: null, role: "", status: "", taskTemplateId: "" });
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
    setEditingDocument(null);
    setDocumentForm({ ...documentForm, folderId });
    setShowDocumentDialog(true);
  };

  const openEditDocumentDialog = (doc: SystemDocument) => {
    setEditingDocument(doc);
    setDocumentForm({
      title: doc.title,
      description: doc.description || "",
      type: doc.type || "document",
      fileUrl: doc.fileUrl || "",
      folderId: doc.folderId || null,
      role: doc.role || "",
      status: doc.status || "",
      taskTemplateId: doc.taskTemplateId || "",
    });
    setShowDocumentDialog(true);
  };

  const openViewDocumentDialog = (doc: SystemDocument) => {
    setViewingDocument(doc);
    setShowDocumentViewDialog(true);
  };

  const openCreateTaskDialog = async (templateId: string) => {
    const template = taskTemplates.find((t: any) => t.id === templateId);
    if (template) {
      setSelectedTemplate(template);
      setShowCreateTaskDialog(true);
    }
  };

  // Expose dialog opening functions to parent via ref
  useImperativeHandle(ref, () => ({
    openNewFolderDialog,
    openNewDocumentDialog,
  }));

  const handleCreateTask = () => {
    if (!selectedTemplate || !taskForm.projectId) {
      toast({ title: "Please select a project", variant: "destructive" });
      return;
    }
    createTaskFromTemplateMutation.mutate({
      template: selectedTemplate,
      projectId: taskForm.projectId,
      dueDate: taskForm.dueDate,
      assigneeId: taskForm.assigneeId,
    });
  };

  const handleSaveFolder = () => {
    if (editingFolder) {
      updateFolderMutation.mutate({ id: editingFolder.id, data: folderForm });
    } else {
      createFolderMutation.mutate(folderForm);
    }
  };

  const handleSaveDocument = () => {
    if (editingDocument) {
      updateDocumentMutation.mutate({ id: editingDocument.id, data: documentForm });
    } else {
      createDocumentMutation.mutate(documentForm);
    }
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
    const isDraggingDocument = String(active.id).startsWith('document-');
    const isOverFolder = String(over.id).startsWith('folder-');
    const isOverRootZone = over.id === 'root-drop-zone';
    const isOverBefore = String(over.id).startsWith('before-');
    const isOverAfter = String(over.id).startsWith('after-');

    // Handle document dragging
    if (isDraggingDocument) {
      const draggedDocumentId = String(active.id).replace('document-', '');
      const draggedDocument = documents.find(d => d.id === draggedDocumentId);

      if (!draggedDocument) return;

      // Handle drop on folder (move document into folder)
      if (isOverFolder) {
        const targetFolderId = String(over.id).replace('folder-', '');
        const targetFolder = folders.find(f => f.id === targetFolderId);

        if (!targetFolder) return;

        // If dropping on current parent, no-op
        if (draggedDocument.folderId === targetFolderId) return;

        // Get documents in target folder
        const targetFolderDocs = documents.filter(d => d.folderId === targetFolderId);
        const newOrder = targetFolderDocs.length;

        // Get documents in origin folder
        const originDocs = documents
          .filter(d => d.folderId === draggedDocument.folderId && d.id !== draggedDocumentId)
          .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

        // Update moved document
        const updates: Array<{id: string, displayOrder: number, folderId?: string | null}> = [
          { id: draggedDocumentId, folderId: targetFolderId, displayOrder: newOrder }
        ];

        // Reindex origin folder documents
        if (originDocs.length > 0) {
          updates.push(...originDocs.map((d, index) => ({
            id: d.id,
            displayOrder: index
          })));
        }

        reorderDocumentsMutation.mutate({ documents: updates });
        return;
      }

      // Handle drop on root zone
      if (isOverRootZone) {
        // If already at root, no-op
        if (draggedDocument.folderId === null) return;

        // Get root documents
        const rootDocs = documents.filter(d => d.folderId === null);
        const newOrder = rootDocs.length;

        // Get documents in origin folder
        const originDocs = documents
          .filter(d => d.folderId === draggedDocument.folderId && d.id !== draggedDocumentId)
          .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

        // Update moved document
        const updates: Array<{id: string, displayOrder: number, folderId?: string | null}> = [
          { id: draggedDocumentId, folderId: null, displayOrder: newOrder }
        ];

        // Reindex origin folder documents
        if (originDocs.length > 0) {
          updates.push(...originDocs.map((d, index) => ({
            id: d.id,
            displayOrder: index
          })));
        }

        reorderDocumentsMutation.mutate({ documents: updates });
        return;
      }

      return; // No valid drop target for document
    }

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
              <SortableDocument
                key={doc.id}
                document={doc}
                depth={depth + 1}
                onView={() => openViewDocumentDialog(doc)}
                onEdit={() => openEditDocumentDialog(doc)}
                onDelete={() => deleteDocumentMutation.mutate(doc.id)}
                onCreateTask={openCreateTaskDialog}
              />
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
  const allDocumentIds = documents.map(d => `document-${d.id}`);
  const allDraggableIds = [...allFolderIds, ...allDocumentIds];

  return (
    <div className="flex flex-col h-full">
      <Card className="flex-1 m-3 p-4 overflow-auto">
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
            <SortableContext items={allDraggableIds} strategy={verticalListSortingStrategy}>
              <div>
                <RootDropZone 
                  isOver={overId === 'root-drop-zone'} 
                  isDragging={activeId !== null}
                />
                {rootFolders.map((folder, index) => 
                  renderFolder(folder, 0, index === rootFolders.length - 1)
                )}
                {rootDocuments.map((doc) => (
                  <SortableDocument
                    key={doc.id}
                    document={doc}
                    depth={0}
                    onView={() => openViewDocumentDialog(doc)}
                    onEdit={() => openEditDocumentDialog(doc)}
                    onDelete={() => deleteDocumentMutation.mutate(doc.id)}
                    onCreateTask={openCreateTaskDialog}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay>
              {activeId && (() => {
                if (activeId.startsWith('folder-')) {
                  const folderId = activeId.replace('folder-', '');
                  const draggedFolder = folders.find(f => f.id === folderId);
                  return draggedFolder ? (
                    <div className="flex items-center gap-2 py-1.5 px-2 bg-card border rounded-md shadow-lg">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <Folder className="h-4 w-4 text-primary" />
                      <span className="text-sm">{draggedFolder.name}</span>
                    </div>
                  ) : null;
                } else if (activeId.startsWith('document-')) {
                  const documentId = activeId.replace('document-', '');
                  const draggedDocument = documents.find(d => d.id === documentId);
                  return draggedDocument ? (
                    <div className="flex items-center gap-2 py-1.5 px-2 bg-card border rounded-md shadow-lg">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{draggedDocument.title}</span>
                    </div>
                  ) : null;
                }
                return null;
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

      {/* Document Edit Dialog */}
      <Dialog open={showDocumentDialog} onOpenChange={(open) => {
        setShowDocumentDialog(open);
        if (!open) {
          setEditingDocument(null);
          resetDocumentForm();
        }
      }}>
        <DialogContent data-testid="dialog-document">
          <DialogHeader>
            <DialogTitle>{editingDocument ? "Edit Document" : "New Document"}</DialogTitle>
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
            <div>
              <Label>Role (Optional)</Label>
              <Select
                value={documentForm.role || undefined}
                onValueChange={(value) => setDocumentForm({ ...documentForm, role: value })}
              >
                <SelectTrigger data-testid="select-document-role">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.name}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status (Optional)</Label>
              <Select
                value={documentForm.status || undefined}
                onValueChange={(value) => setDocumentForm({ ...documentForm, status: value })}
              >
                <SelectTrigger data-testid="select-document-status">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  {statusCategory?.options?.map((option: any) => (
                    <SelectItem key={option.id} value={option.name}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Task Template (Optional)</Label>
              <Select
                value={documentForm.taskTemplateId || undefined}
                onValueChange={(value) => setDocumentForm({ ...documentForm, taskTemplateId: value })}
              >
                <SelectTrigger data-testid="select-document-task-template">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  {taskTemplates.map((template: any) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDocumentDialog(false)} data-testid="button-cancel-document">
              Cancel
            </Button>
            <Button onClick={handleSaveDocument} data-testid="button-save-document">
              {editingDocument ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document View Dialog */}
      <Dialog open={showDocumentViewDialog} onOpenChange={(open) => {
        setShowDocumentViewDialog(open);
        if (!open) {
          setViewingDocument(null);
        }
      }}>
        <DialogContent data-testid="dialog-document-view">
          <DialogHeader>
            <DialogTitle>{viewingDocument?.title}</DialogTitle>
          </DialogHeader>
          {viewingDocument && (
            <div className="flex flex-col gap-4">
              {viewingDocument.description && (
                <div>
                  <Label className="text-muted-foreground">Description</Label>
                  <p className="text-sm mt-1">{viewingDocument.description}</p>
                </div>
              )}
              {viewingDocument.type && (
                <div>
                  <Label className="text-muted-foreground">Type</Label>
                  <p className="text-sm mt-1 capitalize">{viewingDocument.type}</p>
                </div>
              )}
              <div>
                <Label className="text-muted-foreground">Role</Label>
                <p className="text-sm mt-1">{viewingDocument.role || '—'}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Status</Label>
                <p className="text-sm mt-1">{viewingDocument.status || '—'}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Task Template</Label>
                <p className="text-sm mt-1">{viewingDocument.taskTemplateName || '—'}</p>
              </div>
              {viewingDocument.fileUrl && (
                <div>
                  <Label className="text-muted-foreground">File</Label>
                  <a
                    href={viewingDocument.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm mt-1 text-primary hover:underline block"
                    data-testid="link-document-file"
                  >
                    Open File
                  </a>
                </div>
              )}
              {viewingDocument.createdByName && (
                <div>
                  <Label className="text-muted-foreground">Created By</Label>
                  <p className="text-sm mt-1">{viewingDocument.createdByName}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDocumentViewDialog(false)} data-testid="button-close-view">
              Close
            </Button>
            <Button onClick={() => {
              if (viewingDocument) {
                setShowDocumentViewDialog(false);
                openEditDocumentDialog(viewingDocument);
              }
            }} data-testid="button-edit-from-view">
              Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Task from Template Dialog */}
      <Dialog open={showCreateTaskDialog} onOpenChange={(open) => {
        setShowCreateTaskDialog(open);
        if (!open) {
          setSelectedTemplate(null);
          setTaskForm({ projectId: "", dueDate: "", assigneeId: "" });
        }
      }}>
        <DialogContent data-testid="dialog-create-task-from-template">
          <DialogHeader>
            <DialogTitle>Create Task from Template</DialogTitle>
          </DialogHeader>
          {selectedTemplate && (
            <div className="flex flex-col gap-4">
              <div>
                <Label className="text-muted-foreground">Template</Label>
                <p className="text-sm mt-1 font-medium">{selectedTemplate.title}</p>
                {selectedTemplate.description && (
                  <p className="text-xs text-muted-foreground mt-1">{selectedTemplate.description}</p>
                )}
              </div>
              <div>
                <Label>Project *</Label>
                <ProjectSelect
                  value={taskForm.projectId}
                  onValueChange={(value) => setTaskForm({ ...taskForm, projectId: value })}
                  placeholder="Select project"
                  allowNone={false}
                  data-testid="select-task-project"
                />
              </div>
              <div>
                <Label>Due Date (Optional)</Label>
                <Input
                  type="date"
                  value={taskForm.dueDate}
                  onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                  data-testid="input-task-due-date"
                />
              </div>
              <div>
                <Label>Assign To (Optional)</Label>
                <UserSelect
                  value={taskForm.assigneeId}
                  onValueChange={(value) => setTaskForm({ ...taskForm, assigneeId: value })}
                  placeholder="Unassigned"
                  data-testid="select-task-assignee"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateTaskDialog(false)} data-testid="button-cancel-create-task">
              Cancel
            </Button>
            <Button onClick={handleCreateTask} disabled={createTaskFromTemplateMutation.isPending} data-testid="button-create-task">
              {createTaskFromTemplateMutation.isPending ? "Creating..." : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

FolderTree.displayName = "FolderTree";
