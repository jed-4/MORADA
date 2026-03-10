import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type Doc, type DocFolder, type User as UserType } from "@shared/schema";
import NotionEditor from "@/components/NotionEditor";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BookOpen,
  Plus,
  Search,
  MoreHorizontal,
  Trash2,
  FolderPlus,
  Folder,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  Pencil,
  Check,
  MoveRight,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// ─── Doc list item ────────────────────────────────────────────────────────────

interface DocListItemProps {
  doc: Doc;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: () => void;
  onMoveToFolder: (folderId: string | null) => void;
  folders: DocFolder[];
  indented?: boolean;
}

function DocListItem({
  doc,
  selected,
  onSelect,
  onDelete,
  onRename,
  onMoveToFolder,
  folders,
  indented = false,
}: DocListItemProps) {
  return (
    <div
      className={cn(
        "group relative flex items-center gap-2 px-3 py-2 cursor-pointer rounded-md mx-1",
        indented && "pl-6",
        selected ? "bg-accent" : "hover-elevate"
      )}
      onClick={onSelect}
    >
      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="text-sm flex-1 truncate">{doc.title || "Untitled"}</span>
      <div className="invisible group-hover:visible shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onRename();
              }}
            >
              <Pencil className="h-3.5 w-3.5 mr-2" />
              Rename
            </DropdownMenuItem>
            {folders.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <MoveRight className="h-3.5 w-3.5 mr-2" />
                  Move to folder
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveToFolder(null);
                    }}
                  >
                    No folder
                  </DropdownMenuItem>
                  {folders.map((f) => (
                    <DropdownMenuItem
                      key={f.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveToFolder(f.id);
                      }}
                    >
                      {f.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function Docs() {
  usePageTitle({ pageName: "Docs" });
  const { toast } = useToast();

  // ── ui state ───────────────────────────────────────────────────────────────
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const lastSavedRef = useRef<{ title: string; html: string }>({ title: "", html: "" });
  const isCreatingRef = useRef(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [activeFolderId, setActiveFolderId] = useState<string | null | undefined>(undefined);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null);
  const [renamingDocTitle, setRenamingDocTitle] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteFolderId, setConfirmDeleteFolderId] = useState<string | null>(null);

  // ── queries ────────────────────────────────────────────────────────────────
  const { data: currentUser } = useQuery<UserType>({ queryKey: ["/api/auth/user"] });

  const { data: folders = [] } = useQuery<DocFolder[]>({
    queryKey: ["/api/doc-folders"],
  });

  const { data: docs = [], isLoading } = useQuery<Doc[]>({
    queryKey: ["/api/docs"],
  });

  const currentUserName = currentUser
    ? `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim() ||
      currentUser.email ||
      "Unknown"
    : "Unknown";

  // ── filter ─────────────────────────────────────────────────────────────────

  const filteredDocs = useMemo(() => {
    let result = docs;
    if (activeFolderId !== undefined) {
      result = result.filter((d) =>
        activeFolderId === null ? !d.folderId : d.folderId === activeFolderId
      );
    }
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(
        (d) =>
          (d.title || "").toLowerCase().includes(lower) ||
          (d.contentText || "").toLowerCase().includes(lower)
      );
    }
    return result.sort(
      (a, b) => new Date(b.updatedAt!).getTime() - new Date(a.updatedAt!).getTime()
    );
  }, [docs, activeFolderId, searchTerm]);

  const docsInFolder = useCallback(
    (folderId: string | null) =>
      docs.filter((d) => (folderId === null ? !d.folderId : d.folderId === folderId)),
    [docs]
  );

  // ── mutations ──────────────────────────────────────────────────────────────

  const invalidateDocs = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/docs"] });
  }, []);

  const createDocMutation = useMutation({
    mutationFn: async (data: { title: string; folderId?: string | null }) =>
      apiRequest("/api/docs", "POST", data),
    onSuccess: (newDoc: Doc) => {
      invalidateDocs();
      setSelectedDocId(newDoc.id);
      setEditTitle(newDoc.title || "");
      lastSavedRef.current = { title: newDoc.title || "", html: newDoc.contentHtml || "" };
      setSaveState("idle");
      isCreatingRef.current = false;
    },
    onError: () => {
      isCreatingRef.current = false;
      toast({ title: "Failed to create doc", variant: "destructive" });
    },
  });

  const silentUpdateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Doc> }) =>
      apiRequest(`/api/docs/${id}`, "PATCH", data),
    onSuccess: () => {
      invalidateDocs();
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    },
    onError: () => {
      setSaveState("idle");
      toast({ title: "Auto-save failed", variant: "destructive" });
    },
  });

  const deleteDocMutation = useMutation({
    mutationFn: async (id: string) => apiRequest(`/api/docs/${id}`, "DELETE"),
    onSuccess: (_, id) => {
      invalidateDocs();
      if (selectedDocId === id) setSelectedDocId(null);
      toast({ title: "Doc deleted" });
    },
    onError: () => toast({ title: "Failed to delete doc", variant: "destructive" }),
  });

  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => apiRequest("/api/doc-folders", "POST", { name }),
    onSuccess: (folder: DocFolder) => {
      queryClient.invalidateQueries({ queryKey: ["/api/doc-folders"] });
      setExpandedFolders((prev) => new Set([...prev, folder.id]));
      setIsCreateFolderOpen(false);
      setNewFolderName("");
    },
    onError: () => toast({ title: "Failed to create folder", variant: "destructive" }),
  });

  const updateFolderMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) =>
      apiRequest(`/api/doc-folders/${id}`, "PATCH", { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/doc-folders"] });
      setEditingFolderId(null);
    },
    onError: () => toast({ title: "Failed to rename folder", variant: "destructive" }),
  });

  const deleteFolderMutation = useMutation({
    mutationFn: async (id: string) => apiRequest(`/api/doc-folders/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/doc-folders"] });
      invalidateDocs();
    },
    onError: () => toast({ title: "Failed to delete folder", variant: "destructive" }),
  });

  const moveDocMutation = useMutation({
    mutationFn: async ({ id, folderId }: { id: string; folderId: string | null }) =>
      apiRequest(`/api/docs/${id}`, "PATCH", { folderId }),
    onSuccess: invalidateDocs,
    onError: () => toast({ title: "Failed to move doc", variant: "destructive" }),
  });

  const renameDocMutation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) =>
      apiRequest(`/api/docs/${id}`, "PATCH", { title }),
    onSuccess: () => {
      invalidateDocs();
      if (selectedDocId === renamingDocId) setEditTitle(renamingDocTitle);
      setRenamingDocId(null);
    },
    onError: () => toast({ title: "Failed to rename doc", variant: "destructive" }),
  });

  // ── selected doc sync ─────────────────────────────────────────────────────

  const selectedDoc = useMemo(
    () => docs.find((d) => d.id === selectedDocId) ?? null,
    [docs, selectedDocId]
  );

  useEffect(() => {
    if (selectedDoc && !isCreatingRef.current) {
      setEditTitle(selectedDoc.title || "");
      lastSavedRef.current = {
        title: selectedDoc.title || "",
        html: selectedDoc.contentHtml || "",
      };
    }
  }, [selectedDocId]);

  // ── auto-save ─────────────────────────────────────────────────────────────

  const scheduleAutoSave = useCallback(
    (title: string, html: string) => {
      if (!selectedDocId) return;
      clearTimeout(saveTimerRef.current);
      setSaveState("saving");
      saveTimerRef.current = setTimeout(() => {
        const contentText = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        silentUpdateMutation.mutate({
          id: selectedDocId,
          data: { title, contentHtml: html, contentText } as any,
        });
        lastSavedRef.current = { title, html };
      }, 800);
    },
    [selectedDocId]
  );

  const handleTitleChange = (value: string) => {
    setEditTitle(value);
    scheduleAutoSave(value, lastSavedRef.current.html);
  };

  const handleContentChange = useCallback(
    (html: string) => {
      const currentTitle =
        lastSavedRef.current.title !== editTitle ? editTitle : lastSavedRef.current.title;
      scheduleAutoSave(currentTitle, html);
      lastSavedRef.current = { ...lastSavedRef.current, html };
    },
    [scheduleAutoSave, editTitle]
  );

  useEffect(() => () => clearTimeout(saveTimerRef.current), []);

  // ── handlers ──────────────────────────────────────────────────────────────

  const handleNewDoc = (folderId?: string | null) => {
    if (isCreatingRef.current) return;
    isCreatingRef.current = true;
    createDocMutation.mutate({
      title: "Untitled",
      folderId: folderId ?? (activeFolderId !== undefined ? activeFolderId : null),
    });
  };

  const toggleFolder = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full" data-testid="docs-page">
      {/* ── LEFT PANEL ─────────────────────────────────────────────────── */}
      <div className="w-72 shrink-0 border-r flex flex-col overflow-hidden">
        {/* header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
          <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
          <h2 className="text-sm font-semibold flex-1">Docs</h2>
          <Button
            size="icon"
            variant="ghost"
            title="New Folder"
            onClick={() => setIsCreateFolderOpen(true)}
          >
            <FolderPlus className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            title="New Doc"
            onClick={() => handleNewDoc()}
            disabled={createDocMutation.isPending}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* search */}
        <div className="px-2 py-1.5 border-b shrink-0">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search docs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-7 pl-7 text-xs"
            />
          </div>
        </div>

        {/* list */}
        <div className="flex-1 overflow-y-auto py-1">
          {/* All Docs item */}
          <div
            className={cn(
              "flex items-center gap-2 px-3 py-2 cursor-pointer rounded-md mx-1 text-sm",
              activeFolderId === undefined && !searchTerm
                ? "bg-accent font-medium"
                : "hover-elevate text-muted-foreground"
            )}
            onClick={() => {
              setActiveFolderId(undefined);
              setSearchTerm("");
            }}
          >
            <BookOpen className="h-3.5 w-3.5 shrink-0" />
            <span>All Docs</span>
            <span className="ml-auto text-[10px] text-muted-foreground">{docs.length}</span>
          </div>

          {/* Folders */}
          {folders.map((folder) => {
            const isExpanded = expandedFolders.has(folder.id);
            const folderDocs = docsInFolder(folder.id);
            return (
              <div key={folder.id}>
                <div
                  className={cn(
                    "group flex items-center gap-1.5 px-3 py-2 cursor-pointer rounded-md mx-1",
                    activeFolderId === folder.id
                      ? "bg-accent"
                      : "hover-elevate"
                  )}
                  onClick={() => {
                    setActiveFolderId(folder.id);
                    toggleFolder(folder.id);
                  }}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-primary" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-primary" />
                  )}
                  {isExpanded ? (
                    <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary" />
                  ) : (
                    <Folder className="h-3.5 w-3.5 shrink-0 text-primary" />
                  )}
                  {editingFolderId === folder.id ? (
                    <Input
                      value={editingFolderName}
                      onChange={(e) => setEditingFolderName(e.target.value)}
                      onBlur={() => {
                        if (editingFolderName.trim()) {
                          updateFolderMutation.mutate({
                            id: folder.id,
                            name: editingFolderName.trim(),
                          });
                        } else {
                          setEditingFolderId(null);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && editingFolderName.trim()) {
                          updateFolderMutation.mutate({
                            id: folder.id,
                            name: editingFolderName.trim(),
                          });
                        } else if (e.key === "Escape") {
                          setEditingFolderId(null);
                        }
                      }}
                      className="h-5 text-xs flex-1"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="text-sm flex-1 truncate">{folder.name}</span>
                  )}
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {folderDocs.length}
                  </span>
                  <div className="invisible group-hover:visible shrink-0">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleNewDoc(folder.id);
                          }}
                        >
                          <Plus className="h-3.5 w-3.5 mr-2" />
                          New doc here
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingFolderId(folder.id);
                            setEditingFolderName(folder.name);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-2" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteFolderId(folder.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" />
                          Delete folder
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* docs inside folder */}
                {isExpanded &&
                  folderDocs.map((doc) => (
                    <DocListItem
                      key={doc.id}
                      doc={doc}
                      selected={selectedDocId === doc.id}
                      onSelect={() => setSelectedDocId(doc.id)}
                      onDelete={() => setConfirmDeleteId(doc.id)}
                      onRename={() => {
                        setRenamingDocId(doc.id);
                        setRenamingDocTitle(doc.title || "");
                      }}
                      onMoveToFolder={(fid) =>
                        moveDocMutation.mutate({ id: doc.id, folderId: fid })
                      }
                      folders={folders}
                      indented
                    />
                  ))}
              </div>
            );
          })}

          {/* Ungrouped docs (no folder) */}
          {docsInFolder(null).length > 0 && (
            <div className="mt-1">
              {folders.length > 0 && (
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide px-4 py-1">
                  Unfiled
                </p>
              )}
              {docsInFolder(null).map((doc) => (
                <DocListItem
                  key={doc.id}
                  doc={doc}
                  selected={selectedDocId === doc.id}
                  onSelect={() => setSelectedDocId(doc.id)}
                  onDelete={() => setConfirmDeleteId(doc.id)}
                  onRename={() => {
                    setRenamingDocId(doc.id);
                    setRenamingDocTitle(doc.title || "");
                  }}
                  onMoveToFolder={(fid) =>
                    moveDocMutation.mutate({ id: doc.id, folderId: fid })
                  }
                  folders={folders}
                />
              ))}
            </div>
          )}

          {isLoading && (
            <p className="text-xs text-muted-foreground text-center py-8">Loading…</p>
          )}

          {!isLoading && docs.length === 0 && (
            <div className="text-center py-10 px-4">
              <BookOpen className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-xs text-muted-foreground">No docs yet</p>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2 h-7 text-xs"
                onClick={() => handleNewDoc()}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                New Doc
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedDoc ? (
          <>
            {/* top bar */}
            <div className="flex items-center gap-2 px-6 py-2 border-b shrink-0">
              {selectedDoc.folderId && (
                <span className="text-xs text-muted-foreground">
                  {folders.find((f) => f.id === selectedDoc.folderId)?.name ?? ""}
                  {" / "}
                </span>
              )}
              <span className="text-xs text-muted-foreground flex-1 truncate">
                {selectedDoc.ownerName || currentUserName}
                {selectedDoc.updatedAt && (
                  <> · Updated {format(new Date(selectedDoc.updatedAt), "MMM d, yyyy")}</>
                )}
              </span>
              {saveState === "saving" && (
                <span className="text-[11px] text-muted-foreground">Saving…</span>
              )}
              {saveState === "saved" && (
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  Saved
                </span>
              )}
              <Button
                size="icon"
                variant="ghost"
                title="Delete doc"
                onClick={() => setConfirmDeleteId(selectedDoc.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {/* editor area */}
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-3xl mx-auto px-10 py-10">
                <input
                  value={editTitle}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Untitled"
                  className="w-full text-3xl font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/40 mb-6"
                />
                <NotionEditor
                  key={selectedDoc.id}
                  content={selectedDoc.contentHtml || ""}
                  onChange={handleContentChange}
                  placeholder="Start writing, or press '/' for commands…"
                />
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center flex-col gap-3 text-center px-8">
            <BookOpen className="h-12 w-12 text-muted-foreground/30" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Select a doc to view
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Create SOPs, procedures, and guides for your team
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => handleNewDoc()}
              disabled={createDocMutation.isPending}
            >
              <Plus className="h-4 w-4 mr-1" />
              New Doc
            </Button>
          </div>
        )}
      </div>

      {/* ── CREATE FOLDER DIALOG ──────────────────────────────────────── */}
      <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New Folder</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2 mt-2">
            <Input
              placeholder="Folder name…"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newFolderName.trim()) {
                  createFolderMutation.mutate(newFolderName.trim());
                }
              }}
              autoFocus
            />
            <Button
              onClick={() => {
                if (newFolderName.trim()) createFolderMutation.mutate(newFolderName.trim());
              }}
              disabled={!newFolderName.trim() || createFolderMutation.isPending}
            >
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── RENAME DOC DIALOG ─────────────────────────────────────────── */}
      <Dialog
        open={!!renamingDocId}
        onOpenChange={(open) => !open && setRenamingDocId(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Doc</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2 mt-2">
            <Input
              value={renamingDocTitle}
              onChange={(e) => setRenamingDocTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && renamingDocTitle.trim() && renamingDocId) {
                  renameDocMutation.mutate({ id: renamingDocId, title: renamingDocTitle.trim() });
                }
              }}
              autoFocus
            />
            <Button
              onClick={() => {
                if (renamingDocTitle.trim() && renamingDocId) {
                  renameDocMutation.mutate({
                    id: renamingDocId,
                    title: renamingDocTitle.trim(),
                  });
                }
              }}
              disabled={!renamingDocTitle.trim() || renameDocMutation.isPending}
            >
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── CONFIRM DELETE DOC ────────────────────────────────────────── */}
      <AlertDialog
        open={!!confirmDeleteId}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete doc?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The document will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDeleteId) {
                  deleteDocMutation.mutate(confirmDeleteId);
                  setConfirmDeleteId(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── CONFIRM DELETE FOLDER ─────────────────────────────────────── */}
      <AlertDialog
        open={!!confirmDeleteFolderId}
        onOpenChange={(open) => !open && setConfirmDeleteFolderId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder?</AlertDialogTitle>
            <AlertDialogDescription>
              The folder will be deleted. Docs inside will become unfiled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDeleteFolderId) {
                  deleteFolderMutation.mutate(confirmDeleteFolderId);
                  setConfirmDeleteFolderId(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
