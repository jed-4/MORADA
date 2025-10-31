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
  ChevronDown
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
import type { SystemFolder, SystemDocument } from "@shared/schema";

export function FolderTree() {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [showDocumentDialog, setShowDocumentDialog] = useState(false);
  const [editingFolder, setEditingFolder] = useState<SystemFolder | null>(null);
  const [editingDocument, setEditingDocument] = useState<SystemDocument | null>(null);
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
    setEditingDocument(null);
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

  // Build folder hierarchy
  const buildFolderTree = (parentId: string | null = null): SystemFolder[] => {
    return folders
      .filter((f) => f.parentId === parentId)
      .sort((a, b) => a.displayOrder - b.displayOrder);
  };

  const getFolderDocuments = (folderId: string | null) => {
    return documents.filter((d) => d.folderId === folderId);
  };

  const renderFolder = (folder: SystemFolder, depth: number = 0) => {
    const isExpanded = expandedFolders.has(folder.id);
    const childFolders = buildFolderTree(folder.id);
    const folderDocs = getFolderDocuments(folder.id);
    const hasChildren = childFolders.length > 0 || folderDocs.length > 0;

    return (
      <div key={folder.id} className="select-none">
        <div
          className="flex items-center gap-2 py-1.5 px-2 hover-elevate rounded-md cursor-pointer group"
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
        >
          <div className="flex items-center gap-1 flex-1" onClick={() => toggleFolder(folder.id)}>
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
              <DropdownMenuItem onClick={() => openNewFolderDialog(folder.id)} data-testid="menu-add-subfolder">
                <FolderPlus className="h-4 w-4 mr-2" />
                Add Subfolder
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openNewDocumentDialog(folder.id)} data-testid="menu-add-document">
                <FilePlus className="h-4 w-4 mr-2" />
                Add Document
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openEditFolderDialog(folder)} data-testid="menu-edit-folder">
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => deleteFolderMutation.mutate(folder.id)}
                className="text-destructive"
                data-testid="menu-delete-folder"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {isExpanded && (
          <div>
            {childFolders.map((child) => renderFolder(child, depth + 1))}
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
          <div>
            {rootFolders.map((folder) => renderFolder(folder, 0))}
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
          setEditingDocument(null);
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
