import { useState, useMemo, useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch, useLocation } from "wouter";
import { format } from "date-fns";
import {
  BookOpen, Plus, MoreHorizontal, Trash2, Folder, FolderOpen, ChevronDown, ChevronRight,
  FileText, Pencil, Check, MoveRight, History, Archive, ArchiveRestore, Send, ShieldCheck,
  Undo2, Link2, ExternalLink, Lock, ListTodo, FolderPlus, ClipboardCheck, X, Search, Filter,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import NotionEditor from "@/components/NotionEditor";
import { useToast } from "@/hooks/use-toast";
import { usePermission } from "@/hooks/use-permission";
import { useAuth } from "@/hooks/use-auth";
import { FolderAccessDialog } from "@/components/library/FolderAccessDialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  type Doc, type DocFolder, type DocVersion, type LibraryDocType, type LibraryDocStatus,
  LIBRARY_DOC_TYPES,
} from "@shared/schema";

export const DOC_TYPE_LABEL: Record<LibraryDocType, string> = {
  sop: "SOP",
  policy: "Policy",
  template: "Template",
  checklist: "Checklist",
  reference: "Reference",
  document: "Document",
};
const DOC_TYPE_PLURAL: Record<LibraryDocType, string> = {
  sop: "SOPs",
  policy: "Policies",
  template: "Templates",
  checklist: "Checklists",
  reference: "References",
  document: "Documents",
};

/** The Library offers two types. Older policy / template / checklist /
 *  reference documents read as Documents (Jed, 2026-11-15). */
export type LibraryKind = "sop" | "document";
export const kindOf = (t: string | null | undefined): LibraryKind => (t === "sop" ? "sop" : "document");

export interface LibraryFilters {
  type: "all" | LibraryKind;
  status: LibraryDocStatus | "active";
}

const STATUS_LABEL: Record<LibraryDocStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  archived: "Archived",
};
// Status chips use the shared --status-* pairs (dark mode already carries its
// own alpha, so never add a Tailwind /opacity to the -bg token).
const STATUS_TONE: Record<LibraryDocStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  in_review: "bg-[hsl(var(--status-warning-bg))] text-[hsl(var(--status-warning-fg))]",
  approved: "bg-[hsl(var(--status-success-bg))] text-[hsl(var(--status-success-fg))]",
  archived: "bg-muted text-muted-foreground line-through",
};

function StatusChip({ status, className }: { status: string; className?: string }) {
  const s = (status in STATUS_LABEL ? status : "draft") as LibraryDocStatus;
  return (
    <span
      className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium leading-none", STATUS_TONE[s], className)}
      data-testid={`doc-status-${s}`}
    >
      {STATUS_LABEL[s]}
    </span>
  );
}

const docText = (text: string) => text.replace(/\s+/g, " ").trim();

// The app's standard small buttons (see PurchaseOrderDetail / Tasks).
const DOC_BTN = "h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1 flex-shrink-0";
const DOC_PRIMARY_BTN = "h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-1 flex-shrink-0";
const DOC_ICON_BTN = "h-6 w-6 flex items-center justify-center rounded-md border hover-elevate active-elevate-2 flex-shrink-0";

export interface LibraryHandle {
  newDoc: (type?: LibraryKind) => void;
  newFolder: (parentFolderId?: string | null) => void;
}

interface LibraryProps {
  /** Folder names then the document title, for the page breadcrumb. */
  onPathChange?: (path: string[]) => void;
}

export const Library = forwardRef<LibraryHandle, LibraryProps>(function Library({ onPathChange }, ref) {
  const { toast } = useToast();
  const canAdd = usePermission("operations.library", "add");
  const canEditLibrary = usePermission("operations.library", "edit");
  // Per-folder access (migration 0127): the server marks each document and
  // folder with whether THIS person may change it. Viewing and editing are
  // separate — a role can read a folder's SOPs without being able to edit them.
  const editableDoc = (d: object | null | undefined) => !!d && canEditLibrary && (d as { canEdit?: boolean }).canEdit !== false;
  const editableFolder = (f: object | null | undefined) => !!f && canEditLibrary && (f as { canEdit?: boolean }).canEdit !== false;
  const { user } = useAuth();
  const isAdmin = !!(user as any)?.isAdminLike;
  const [accessFolder, setAccessFolder] = useState<DocFolder | null>(null);
  const canDelete = usePermission("operations.library", "delete");
  const canApprove = usePermission("operations.library", "approve");

  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  // Search and filters belong to the Library (its folder panel), not the page
  // header — they search documents, not the other Operations tabs.
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<LibraryFilters>({ type: "all", status: "active" });
  const typeFilter = filters.type;
  const statusFilter = filters.status;
  const activeFilterCount = (filters.type !== "all" ? 1 : 0) + (filters.status !== "active" ? 1 : 0);
  const filterChip = (on: boolean) =>
    `px-2 h-6 rounded-md text-xs border transition-colors ${on ? "bg-primary/10 text-primary border-primary/20" : "border-border/50 text-muted-foreground hover-elevate"}`;
  const [activeFolderId, setActiveFolderId] = useState<string | null | undefined>(undefined);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const [editTitle, setEditTitle] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  // An approved or in-review doc opens read-only; "Edit" unlocks it, and the
  // first change reopens it as a draft on the server.
  const [unlockedDocId, setUnlockedDocId] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const pendingRef = useRef<{ title: string; html: string; text: string } | null>(null);
  // The editor's own markup for the doc it last mounted (see its onChange).
  const editorBaselineRef = useRef<{ mount: string; html: string } | null>(null);
  const isCreatingRef = useRef(false);

  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  // Which folder a new folder goes inside (null = top level).
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null);
  // Opening a doc you just created goes straight into edit mode.
  const unlockOnOpenRef = useRef<string | null>(null);
  const [linkDraft, setLinkDraft] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteFolderId, setConfirmDeleteFolderId] = useState<string | null>(null);
  const [sendBackOpen, setSendBackOpen] = useState(false);
  const [sendBackNote, setSendBackNote] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewVersion, setViewVersion] = useState<number | null>(null);

  // ── queries ────────────────────────────────────────────────────────────────
  const { data: folders = [] } = useQuery<DocFolder[]>({ queryKey: ["/api/doc-folders"] });
  const { data: docs = [], isLoading } = useQuery<Doc[]>({ queryKey: ["/api/docs"] });
  const selectedDoc = useMemo(() => docs.find((d) => d.id === selectedDocId) ?? null, [docs, selectedDocId]);

  // ?doc=<id> opens a document directly — the "View SOP" link on a To-Do and
  // the task editor's "Open" both land here.
  const docParam = new URLSearchParams(useSearch()).get("doc");
  const [, navigate] = useLocation();
  useEffect(() => { if (docParam) setSelectedDocId(docParam); }, [docParam]);
  useEffect(() => {
    const folderId = selectedDoc?.folderId;
    if (folderId) setExpandedFolders((prev) => (prev.has(folderId) ? prev : new Set([...Array.from(prev), folderId])));
  }, [selectedDoc?.folderId]);

  const { data: usage = [] } = useQuery<{ id: string; title: string; isActive: boolean }[]>({
    queryKey: ["/api/docs", selectedDocId, "usage"],
    queryFn: async () => (await fetch(`/api/docs/${selectedDocId}/usage`, { credentials: "include" })).json(),
    enabled: !!selectedDocId,
  });

  // Someone who can only read the Library should be reading what was signed
  // off, not a draft someone is part-way through. Show the last approved
  // version while a newer draft is in progress.
  const canEdit = editableDoc(selectedDoc);
  const showApprovedCopy = !!selectedDoc && !canEdit
    && (selectedDoc.status === "draft" || selectedDoc.status === "in_review")
    && selectedDoc.currentVersion > 0;
  const { data: approvedCopy } = useQuery<DocVersion>({
    queryKey: ["/api/docs", selectedDocId, "versions", selectedDoc?.currentVersion],
    queryFn: async () => (await fetch(`/api/docs/${selectedDocId}/versions/${selectedDoc!.currentVersion}`, { credentials: "include" })).json(),
    enabled: showApprovedCopy,
  });

  const { data: versions = [] } = useQuery<Omit<DocVersion, "contentHtml">[]>({
    queryKey: ["/api/docs", selectedDocId, "versions"],
    queryFn: async () => (await fetch(`/api/docs/${selectedDocId}/versions`, { credentials: "include" })).json(),
    enabled: !!selectedDocId && historyOpen,
  });
  const { data: versionBody } = useQuery<DocVersion>({
    queryKey: ["/api/docs", selectedDocId, "versions", viewVersion],
    queryFn: async () => (await fetch(`/api/docs/${selectedDocId}/versions/${viewVersion}`, { credentials: "include" })).json(),
    enabled: !!selectedDocId && viewVersion !== null,
  });

  // ── filtering ──────────────────────────────────────────────────────────────
  const matches = useCallback((d: Doc) => {
    if (typeFilter !== "all" && kindOf(d.docType) !== typeFilter) return false;
    if (statusFilter === "active" ? d.status === "archived" : d.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!(d.title || "").toLowerCase().includes(q) && !(d.contentText || "").toLowerCase().includes(q)) return false;
    }
    return true;
  }, [typeFilter, statusFilter, searchQuery]);

  const visibleDocs = useMemo(
    () => docs.filter(matches).sort((a, b) => (a.title || "").localeCompare(b.title || "", undefined, { numeric: true })),
    [docs, matches],
  );
  // ── folder tree ────────────────────────────────────────────────────────────
  // A folder whose parent is gone (deleted, or never brought across) shows at
  // the top level rather than disappearing.
  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const parentOf = useCallback(
    (f: DocFolder) => (f.parentFolderId && folderById.has(f.parentFolderId) ? f.parentFolderId : null),
    [folderById],
  );
  const childFolders = useCallback(
    (parentId: string | null) =>
      folders
        .filter((f) => parentOf(f) === parentId)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, undefined, { numeric: true })),
    [folders, parentOf],
  );
  const folderPath = useCallback((id: string | null | undefined): DocFolder[] => {
    const out: DocFolder[] = [];
    let cur = id ? folderById.get(id) : undefined;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) { seen.add(cur.id); out.unshift(cur); cur = parentOf(cur) ? folderById.get(parentOf(cur)!) : undefined; }
    return out;
  }, [folderById, parentOf]);
  // Folders in tree order, with depth — for "Move to folder".
  const flatFolders = useMemo(() => {
    const out: { folder: DocFolder; depth: number }[] = [];
    const walk = (parentId: string | null, depth: number) => {
      for (const f of childFolders(parentId)) { out.push({ folder: f, depth }); walk(f.id, depth + 1); }
    };
    walk(null, 0);
    return out;
  }, [childFolders]);

  const docsIn = useCallback(
    (folderId: string | null) => visibleDocs.filter((d) => (folderId === null ? !d.folderId : d.folderId === folderId)),
    [visibleDocs],
  );
  const filtering = typeFilter !== "all" || statusFilter !== "active" || !!searchQuery;
  const reviewCount = docs.filter((d) => d.status === "in_review").length;

  // ── mutations ──────────────────────────────────────────────────────────────
  const invalidateDocs = () => queryClient.invalidateQueries({ queryKey: ["/api/docs"] });
  const fail = (title: string) => (err: any) =>
    toast({ title, description: err?.message, variant: "destructive" });

  const createDoc = useMutation({
    mutationFn: async (data: { title: string; folderId?: string | null; docType?: LibraryDocType }) =>
      apiRequest("/api/docs", "POST", data),
    onSuccess: (doc: Doc) => {
      invalidateDocs();
      unlockOnOpenRef.current = doc.id;
      setSelectedDocId(doc.id);
      setEditTitle(doc.title || "");
      isCreatingRef.current = false;
    },
    onError: (e) => { isCreatingRef.current = false; fail("Failed to create document")(e); },
  });

  const saveDoc = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Doc> }) => apiRequest(`/api/docs/${id}`, "PATCH", data),
    onSuccess: () => {
      invalidateDocs();
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    },
    onError: (e) => { setSaveState("idle"); fail("Couldn't save")(e); },
  });

  const review = useMutation({
    mutationFn: async ({ id, action, note }: { id: string; action: "submit" | "approve" | "reject" | "archive" | "restore"; note?: string }) =>
      apiRequest(`/api/docs/${id}/${action}`, "POST", note !== undefined ? { note } : {}),
    onSuccess: (_doc, { action }) => {
      invalidateDocs();
      queryClient.invalidateQueries({ queryKey: ["/api/docs", selectedDocId, "versions"] });
      setUnlockedDocId(null);
      const done = { submit: "Sent for review", approve: "Approved", reject: "Sent back to draft", archive: "Archived", restore: "Restored" }[action];
      toast({ title: done });
    },
    onError: fail("That didn't work"),
  });

  const deleteDoc = useMutation({
    mutationFn: async (id: string) => apiRequest(`/api/docs/${id}`, "DELETE"),
    onSuccess: (_r, id) => { invalidateDocs(); if (selectedDocId === id) setSelectedDocId(null); toast({ title: "Document deleted" }); },
    onError: fail("Failed to delete document"),
  });

  const createFolder = useMutation({
    mutationFn: async (name: string) =>
      apiRequest("/api/doc-folders", "POST", { name, parentFolderId: newFolderParentId }),
    onSuccess: (folder: DocFolder) => {
      queryClient.invalidateQueries({ queryKey: ["/api/doc-folders"] });
      setExpandedFolders((prev) => new Set([...Array.from(prev), folder.id, ...(newFolderParentId ? [newFolderParentId] : [])]));
      setIsCreateFolderOpen(false);
      setNewFolderName("");
    },
    onError: fail("Failed to create folder"),
  });
  const renameFolder = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => apiRequest(`/api/doc-folders/${id}`, "PATCH", { name }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/doc-folders"] }); setEditingFolderId(null); },
    onError: fail("Failed to rename folder"),
  });
  const deleteFolder = useMutation({
    mutationFn: async (id: string) => apiRequest(`/api/doc-folders/${id}`, "DELETE"),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/doc-folders"] }); invalidateDocs(); },
    onError: fail("Failed to delete folder"),
  });

  // ── editor state ───────────────────────────────────────────────────────────
  // Resolves once the pending text is on the server, so a review action never
  // signs off a version that is missing the last few keystrokes.
  const flushSave = useCallback(async () => {
    clearTimeout(saveTimerRef.current);
    const pending = pendingRef.current;
    if (!pending || !selectedDocId) return;
    pendingRef.current = null;
    await saveDoc.mutateAsync({ id: selectedDocId, data: { title: pending.title, contentHtml: pending.html, contentText: pending.text } });
  }, [selectedDocId]);
  const act = async (action: "submit" | "approve" | "archive" | "restore") => {
    if (!selectedDoc) return;
    try { await flushSave(); } catch { return; }
    review.mutate({ id: selectedDoc.id, action });
  };

  // Switching docs saves what was typed in the previous one first.
  // Keyed on the loaded doc, not the selected id: a ?doc= link selects an id
  // before the list has arrived, and the title would otherwise stay blank.
  useEffect(() => {
    if (selectedDoc && !isCreatingRef.current) setEditTitle(selectedDoc.title || "");
  }, [selectedDoc?.id]);
  useEffect(() => {
    setUnlockedDocId(unlockOnOpenRef.current && unlockOnOpenRef.current === selectedDocId ? selectedDocId : null);
    unlockOnOpenRef.current = null;
    setViewVersion(null);
    return () => { flushSave().catch(() => {}); };
  }, [selectedDocId]);
  useEffect(() => () => clearTimeout(saveTimerRef.current), []);

  const scheduleSave = (next: Partial<{ title: string; html: string; text: string }>) => {
    if (!selectedDoc) return;
    const base = pendingRef.current ?? {
      title: selectedDoc.title || "",
      html: selectedDoc.contentHtml || "",
      text: selectedDoc.contentText || "",
    };
    pendingRef.current = { ...base, ...next };
    setSaveState("saving");
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { flushSave().catch(() => {}); }, 800);
  };

  // Folder › document, for the page breadcrumb.
  useEffect(() => {
    if (!onPathChange) return;
    if (!selectedDoc) { onPathChange([]); return; }
    onPathChange([...folderPath(selectedDoc.folderId).map((f) => f.name), editTitle || selectedDoc.title || "Untitled"]);
  }, [selectedDoc?.id, selectedDoc?.folderId, editTitle, folders, onPathChange]);
  useEffect(() => () => onPathChange?.([]), []);

  const status = (selectedDoc?.status ?? "draft") as LibraryDocStatus;
  const lockedByReview = status === "approved" || status === "in_review";
  // Every document opens to READ. Someone allowed to edit presses Edit; that's
  // the only way into the editor (was: drafts opened straight into editing).
  const editable = !!selectedDoc && canEdit && status !== "archived" && unlockedDocId === selectedDoc.id;
  const finishEditing = async () => {
    try { await flushSave(); } catch { return; }
    setUnlockedDocId(null);
  };

  const handleNewDoc = (folderId?: string | null, type?: LibraryKind) => {
    if (isCreatingRef.current) return;
    isCreatingRef.current = true;
    createDoc.mutate({
      title: "Untitled",
      folderId: folderId ?? (activeFolderId !== undefined ? activeFolderId : null),
      docType: type ?? (typeFilter !== "all" ? typeFilter : "sop"),
    });
  };
  const openNewFolder = (parentId: string | null) => {
    setNewFolderParentId(parentId);
    setNewFolderName("");
    setIsCreateFolderOpen(true);
  };

  useImperativeHandle(ref, () => ({
    newDoc: (type?: LibraryKind) => handleNewDoc(undefined, type),
    newFolder: (parentId?: string | null) => openNewFolder(parentId ?? (activeFolderId || null)),
  }));

  const toggleFolder = (id: string) =>
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // ── list rows ──────────────────────────────────────────────────────────────
  // A render function, not a component: defined inline as a component it
  // would remount on every refetch and close any open row menu.
  const docRow = (doc: Doc, depth = 0) => (
    <div
      key={doc.id}
      className={cn(
        "group relative flex items-center gap-2 px-3 py-1.5 cursor-pointer rounded-md mx-1",
        selectedDocId === doc.id ? "bg-primary/10 text-primary" : "hover-elevate",
      )}
      style={depth ? { paddingLeft: 12 + depth * 16 } : undefined}
      onClick={() => setSelectedDocId(doc.id)}
      data-testid={`library-doc-${doc.id}`}
    >
      {kindOf(doc.docType) === "sop"
        ? <ClipboardCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
        : <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
      <span className="text-sm flex-1 truncate">{doc.title || "Untitled"}</span>
      {doc.status !== "approved" && <StatusChip status={doc.status} className="shrink-0" />}
      {editableDoc(doc) && (
        <div className="invisible group-hover:visible shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => e.stopPropagation()}>
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {flatFolders.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger><MoveRight className="h-3.5 w-3.5 mr-2" />Move to folder</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); saveDoc.mutate({ id: doc.id, data: { folderId: null } }); }}>No folder</DropdownMenuItem>
                    {flatFolders.filter(({ folder: f }) => editableFolder(f)).map(({ folder: f, depth }) => (
                      <DropdownMenuItem key={f.id} onClick={(e) => { e.stopPropagation(); saveDoc.mutate({ id: doc.id, data: { folderId: f.id } }); }}>
                        <span style={{ paddingLeft: depth * 12 }}>{f.name}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(doc.id); }}>
                    <Trash2 className="h-3.5 w-3.5 mr-2" />Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );

  // A folder, its documents, then its sub-folders. A render function for the
  // same reason as docRow. Counts include everything below.
  const countBelow = (id: string): number =>
    docsIn(id).length + childFolders(id).reduce((n, c) => n + countBelow(c.id), 0);
  const folderNode = (folder: DocFolder, depth: number): JSX.Element | null => {
    const total = countBelow(folder.id);
    if (filtering && total === 0) return null;
    const open = expandedFolders.has(folder.id) || filtering;
    return (
      <div key={folder.id}>
        <div
          className={cn("group flex items-center gap-1.5 px-3 py-1.5 cursor-pointer rounded-md mx-1", activeFolderId === folder.id && !selectedDocId ? "bg-primary/10 text-primary" : "hover-elevate")}
          style={depth ? { paddingLeft: 12 + depth * 16 } : undefined}
          onClick={() => { setActiveFolderId(folder.id); toggleFolder(folder.id); }}
          data-testid={`library-folder-${folder.id}`}
        >
          {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-primary" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-primary" />}
          {open ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary" /> : <Folder className="h-3.5 w-3.5 shrink-0 text-primary" />}
          {editingFolderId === folder.id ? (
            <Input
              value={editingFolderName}
              onChange={(e) => setEditingFolderName(e.target.value)}
              onBlur={() => editingFolderName.trim() ? renameFolder.mutate({ id: folder.id, name: editingFolderName.trim() }) : setEditingFolderId(null)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && editingFolderName.trim()) renameFolder.mutate({ id: folder.id, name: editingFolderName.trim() });
                else if (e.key === "Escape") setEditingFolderId(null);
              }}
              className="h-5 text-xs flex-1"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="text-sm flex-1 truncate">{folder.name}</span>
          )}
          {isAdmin && (Array.isArray((folder as any).viewRoleIds) || Array.isArray((folder as any).editRoleIds)) && (
            <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Access set on this folder" />
          )}
          <span className="text-data text-muted-foreground shrink-0">{total}</span>
          {(editableFolder(folder) || isAdmin) && (
            <div className="invisible group-hover:visible shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-5 w-5" onClick={(e) => e.stopPropagation()} data-testid={`library-folder-menu-${folder.id}`}>
                    <MoreHorizontal className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {canAdd && editableFolder(folder) && <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleNewDoc(folder.id, "sop"); }}><ClipboardCheck className="h-3.5 w-3.5 mr-2" />New SOP here</DropdownMenuItem>}
                  {canAdd && editableFolder(folder) && <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleNewDoc(folder.id, "document"); }}><FileText className="h-3.5 w-3.5 mr-2" />New document here</DropdownMenuItem>}
                  {canAdd && editableFolder(folder) && <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openNewFolder(folder.id); }} data-testid={`library-new-subfolder-${folder.id}`}><FolderPlus className="h-3.5 w-3.5 mr-2" />New sub-folder</DropdownMenuItem>}
                  {editableFolder(folder) && <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditingFolderId(folder.id); setEditingFolderName(folder.name); }}><Pencil className="h-3.5 w-3.5 mr-2" />Rename</DropdownMenuItem>}
                  {isAdmin && <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setAccessFolder(folder); }} data-testid={`library-folder-access-${folder.id}`}><Lock className="h-3.5 w-3.5 mr-2" />Who can see &amp; edit…</DropdownMenuItem>}
                  {canDelete && editableFolder(folder) && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); setConfirmDeleteFolderId(folder.id); }}><Trash2 className="h-3.5 w-3.5 mr-2" />Delete folder</DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
        {open && (
          <>
            {docsIn(folder.id).map((doc) => docRow(doc, depth + 1))}
            {childFolders(folder.id).map((c) => folderNode(c, depth + 1))}
          </>
        )}
      </div>
    );
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full" data-testid="library">
      {/* LEFT: filters + folder tree */}
      <div className="w-72 shrink-0 border-r flex flex-col overflow-hidden bg-card">
        {/* Search + Filter for the Library itself. */}
        <div className="flex items-center gap-1.5 px-2 py-2 border-b shrink-0">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search library..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") setSearchQuery(""); }}
              className="pl-7 pr-2 h-6 text-xs"
              data-testid="input-search-library"
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={cn(DOC_ICON_BTN, "relative", activeFilterCount ? "bg-primary/10 text-primary border-primary/20" : "border-border/50 text-muted-foreground")}
                aria-label="Filter"
                data-testid="button-filter-library"
              >
                <Filter className="h-3 w-3" />
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-primary text-white text-[9px] leading-[14px] font-semibold text-center">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-3 space-y-3">
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Type</p>
                <div className="flex flex-wrap gap-1">
                  {([["all", "All"], ["sop", "SOPs"], ["document", "Documents"]] as const).map(([v, l]) => (
                    <button key={v} className={filterChip(filters.type === v)} onClick={() => setFilters({ ...filters, type: v })} data-testid={`library-type-${v}`}>{l}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Status</p>
                <div className="flex flex-wrap gap-1">
                  {([["active", "All current"], ["draft", "Drafts"], ["in_review", `In review${reviewCount ? ` (${reviewCount})` : ""}`], ["approved", "Approved"], ["archived", "Archived"]] as const).map(([v, l]) => (
                    <button key={v} className={filterChip(filters.status === v)} onClick={() => setFilters({ ...filters, status: v as LibraryFilters["status"] })} data-testid={`library-status-${v}`}>{l}</button>
                  ))}
                </div>
              </div>
              {activeFilterCount > 0 && (
                <button className="text-xs text-primary hover:underline" onClick={() => setFilters({ type: "all", status: "active" })}>Clear filters</button>
              )}
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {childFolders(null).map((folder) => folderNode(folder, 0))}

          {docsIn(null).length > 0 && (
            <div className="mt-1">
              {folders.length > 0 && <p className="text-data text-muted-foreground uppercase tracking-wide px-4 py-1 mt-1">Unfiled</p>}
              {docsIn(null).map((doc) => docRow(doc))}
            </div>
          )}

          {isLoading && <p className="text-xs text-muted-foreground text-center py-8">Loading…</p>}
          {!isLoading && visibleDocs.length === 0 && (
            <div className="text-center py-10 px-4">
              <BookOpen className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-xs text-muted-foreground">{docs.length === 0 ? "Nothing in the library yet" : "Nothing matches"}</p>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: document */}
      <div className="flex-1 flex flex-col overflow-hidden bg-card">
        {selectedDoc ? (
          <>
            <div className="flex items-center gap-2 px-4 h-10 border-b shrink-0">
              {editable ? (
                <Select
                  value={kindOf(selectedDoc.docType)}
                  onValueChange={(v) => v && v !== kindOf(selectedDoc.docType) && saveDoc.mutate({ id: selectedDoc.id, data: { docType: v as LibraryDocType } })}
                >
                  <SelectTrigger className="h-6 w-28 text-xs" data-testid="library-doc-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sop">SOP</SelectItem>
                    <SelectItem value="document">Document</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium leading-none",
                    kindOf(selectedDoc.docType) === "sop" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                  )}
                  data-testid="library-doc-kind"
                >
                  {kindOf(selectedDoc.docType) === "sop" ? <ClipboardCheck className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                  {kindOf(selectedDoc.docType) === "sop" ? "SOP" : "Document"}
                </span>
              )}
              <StatusChip status={status} />
              {selectedDoc.currentVersion > 0 && (
                <span className="text-xs text-muted-foreground" data-testid="library-doc-version">
                  v{selectedDoc.currentVersion}
                  {status === "approved" && selectedDoc.approvedAt && <> · approved {format(new Date(selectedDoc.approvedAt), "d MMM yyyy")}{selectedDoc.approvedByName ? ` by ${selectedDoc.approvedByName}` : ""}</>}
                  {status === "draft" && " approved · edited since"}
                </span>
              )}
              <span className="flex-1" />
              {saveState === "saving" && <span className="text-table text-muted-foreground">Saving…</span>}
              {saveState === "saved" && <span className="text-table text-muted-foreground flex items-center gap-1"><Check className="h-3 w-3" />Saved</span>}

              {/* Link to a file elsewhere (Drive, SharePoint…): a small icon,
                  tinted when set. Was a full-width field under the title. */}
              {(editable || selectedDoc.linkUrl) && (
                <Popover onOpenChange={(o) => o && setLinkDraft(selectedDoc.linkUrl ?? "")}>
                  <PopoverTrigger asChild>
                    <button
                      className={cn(DOC_ICON_BTN, selectedDoc.linkUrl ? "bg-primary/10 text-primary border-primary/20" : "border-border/50 text-muted-foreground")}
                      title={selectedDoc.linkUrl ? "Linked file" : "Link a file"}
                      data-testid="library-doc-link-button"
                    >
                      <Link2 className="h-3 w-3" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80 p-2 space-y-2">
                    {editable ? (
                      <>
                        <Input
                          autoFocus
                          value={linkDraft}
                          onChange={(e) => setLinkDraft(e.target.value)}
                          placeholder="Paste a link to a file…"
                          className="h-7 text-xs"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveDoc.mutate({ id: selectedDoc.id, data: { linkUrl: linkDraft.trim() || null } });
                          }}
                          data-testid="library-doc-link"
                        />
                        <div className="flex items-center gap-1.5">
                          <button className={DOC_PRIMARY_BTN} onClick={() => saveDoc.mutate({ id: selectedDoc.id, data: { linkUrl: linkDraft.trim() || null } })}>Save</button>
                          {selectedDoc.linkUrl && (
                            <button className={cn(DOC_BTN, "text-muted-foreground")} onClick={() => saveDoc.mutate({ id: selectedDoc.id, data: { linkUrl: null } })}>Remove</button>
                          )}
                        </div>
                      </>
                    ) : (
                      <a href={selectedDoc.linkUrl!} target="_blank" rel="noreferrer" className="text-xs text-primary underline break-all">{selectedDoc.linkUrl}</a>
                    )}
                  </PopoverContent>
                </Popover>
              )}

              {/* Read by default; Edit opens the editor for those allowed. */}
              {canEdit && status !== "archived" && !editable && (
                <button className={cn(DOC_BTN, "border-border/50")} onClick={() => setUnlockedDocId(selectedDoc.id)} data-testid="library-unlock">
                  <Pencil className="h-3 w-3" />Edit
                </button>
              )}
              {editable && (
                <button className={cn(DOC_BTN, "border-border/50")} onClick={finishEditing} data-testid="library-done-editing">
                  <Check className="h-3 w-3" />Done
                </button>
              )}
              {canEdit && status === "draft" && !canApprove && (
                <button className={cn(DOC_BTN, "border-border/50")} onClick={() => act("submit")} data-testid="library-submit">
                  <Send className="h-3 w-3" />Send for review
                </button>
              )}
              {canApprove && status === "in_review" && (
                <button className={cn(DOC_BTN, "border-border/50")} onClick={() => { setSendBackNote(""); setSendBackOpen(true); }} data-testid="library-reject">
                  <Undo2 className="h-3 w-3" />Send back
                </button>
              )}
              {canApprove && (status === "draft" || status === "in_review") && (
                <button className={DOC_PRIMARY_BTN} onClick={() => act("approve")} data-testid="library-approve">
                  <ShieldCheck className="h-3 w-3" />Approve
                </button>
              )}
              {canEdit && status === "archived" && (
                <button className={cn(DOC_BTN, "border-border/50")} onClick={() => act("restore")} data-testid="library-restore">
                  <ArchiveRestore className="h-3 w-3" />Restore
                </button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={cn(DOC_ICON_BTN, "border-border/50 text-muted-foreground")} data-testid="library-doc-menu"><MoreHorizontal className="h-3 w-3" /></button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => setHistoryOpen(true)}><History className="h-3.5 w-3.5 mr-2" />Version history</DropdownMenuItem>
                  {canEdit && canApprove && status === "draft" && (
                    <DropdownMenuItem onClick={() => act("submit")}><Send className="h-3.5 w-3.5 mr-2" />Send for review</DropdownMenuItem>
                  )}
                  {canEdit && status !== "archived" && (
                    <DropdownMenuItem onClick={() => act("archive")}><Archive className="h-3.5 w-3.5 mr-2" />Archive</DropdownMenuItem>
                  )}
                  {canDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onClick={() => setConfirmDeleteId(selectedDoc.id)}><Trash2 className="h-3.5 w-3.5 mr-2" />Delete</DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {status === "draft" && selectedDoc.reviewNote && (
              <div className="px-6 py-2 border-b text-xs bg-[hsl(var(--status-warning-bg))] text-[hsl(var(--status-warning-fg))]" data-testid="library-review-note">
                <span className="font-medium">Sent back:</span> {selectedDoc.reviewNote}
              </div>
            )}
            {showApprovedCopy && (
              <div className="px-6 py-2 border-b text-xs text-muted-foreground" data-testid="library-showing-approved">
                Showing approved v{selectedDoc.currentVersion}. A newer draft is being worked on.
              </div>
            )}
            {!canEdit && selectedDoc.currentVersion === 0 && status !== "archived" && (
              <div className="px-6 py-2 border-b text-xs bg-[hsl(var(--status-warning-bg))] text-[hsl(var(--status-warning-fg))]" data-testid="library-not-approved">
                Not approved yet — this may still change.
              </div>
            )}
            {editable && lockedByReview && (
              <div className="px-6 py-2 border-b text-xs text-muted-foreground flex items-center gap-1.5">
                <Lock className="h-3 w-3" />Changing this document reopens it as a draft. The approved version stays in its history.
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              <div className="max-w-3xl mx-auto px-10 py-10">
                <input
                  value={showApprovedCopy ? (approvedCopy?.title ?? "") : editTitle}
                  onChange={(e) => { setEditTitle(e.target.value); scheduleSave({ title: e.target.value }); }}
                  placeholder="Untitled"
                  readOnly={!editable}
                  className="w-full text-3xl font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/40 mb-3"
                  data-testid="library-doc-title"
                />
                {selectedDoc.linkUrl && (
                  <a
                    href={selectedDoc.linkUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 mb-4 text-xs text-muted-foreground hover:text-primary"
                    data-testid="library-doc-link-chip"
                  >
                    <Link2 className="h-3 w-3" />
                    {(() => { try { return new URL(selectedDoc.linkUrl).hostname.replace(/^www\./, ""); } catch { return "Linked file"; } })()}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {usage.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap mb-4 text-xs text-muted-foreground" data-testid="library-doc-usage">
                    <ListTodo className="h-3.5 w-3.5 shrink-0" />
                    <span>Used by</span>
                    {usage.map((t, i) => (
                      <button
                        key={t.id}
                        type="button"
                        className="text-foreground hover:underline"
                        onClick={() => navigate("/systems?tab=tasks")}
                      >
                        {t.title}{!t.isActive ? " (inactive)" : ""}{i < usage.length - 1 ? "," : ""}
                      </button>
                    ))}
                  </div>
                )}
                {showApprovedCopy && !approvedCopy ? (
                  <p className="text-xs text-muted-foreground">Loading…</p>
                ) : (
                <NotionEditor
                  key={`${selectedDoc.id}-${editable}-${showApprovedCopy ? approvedCopy?.version : "live"}`}
                  content={showApprovedCopy ? approvedCopy!.contentHtml : (selectedDoc.contentHtml || "")}
                  editable={editable}
                  onChange={(html, text) => {
                    if (!editable) return;
                    const base = pendingRef.current?.text ?? selectedDoc.contentText ?? "";
                    // The editor re-emits on load with its own markup (list
                    // items wrapped in <p>, whitespace between tags gone). Same
                    // words, so it's not an edit: that markup becomes the
                    // baseline instead of being saved, or every first open of a
                    // doc not written in this editor (starter pack, imports)
                    // would write. Recorded on the first emit whatever it is and
                    // moved on every save, so a bold-only change still saves.
                    const mount = `${selectedDoc.id}-${editable}`;
                    const first = editorBaselineRef.current?.mount !== mount;
                    if (first) editorBaselineRef.current = { mount, html };
                    if (docText(text) === docText(base) && (first || html === editorBaselineRef.current!.html)) return;
                    editorBaselineRef.current!.html = html; // what's saved now
                    scheduleSave({ html, text });
                  }}
                  placeholder="Start writing, or press '/' for commands…"
                />
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center flex-col gap-3 text-center px-8">
            <BookOpen className="h-12 w-12 text-muted-foreground/30" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Select a document</p>
              <p className="text-xs text-muted-foreground mt-1">Your SOPs and documents</p>
            </div>
            {canAdd && (
              <Button size="sm" onClick={() => handleNewDoc()} disabled={createDoc.isPending} data-testid="library-new-empty">
                <Plus className="h-4 w-4 mr-1" />New document
              </Button>
            )}
          </div>
        )}
      </div>

      {/* New folder */}
      <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{newFolderParentId ? `New folder in ${folderById.get(newFolderParentId)?.name ?? "folder"}` : "New folder"}</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2 mt-2">
            <Input
              placeholder="Folder name…"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && newFolderName.trim()) createFolder.mutate(newFolderName.trim()); }}
              autoFocus
            />
            <Button onClick={() => newFolderName.trim() && createFolder.mutate(newFolderName.trim())} disabled={!newFolderName.trim() || createFolder.isPending}>Create</Button>
          </div>
        </DialogContent>
      </Dialog>

      {accessFolder && (
        <FolderAccessDialog
          folder={accessFolder}
          parentName={accessFolder.parentFolderId ? folderById.get(accessFolder.parentFolderId)?.name ?? null : null}
          onClose={() => setAccessFolder(null)}
        />
      )}

      {/* Send back */}
      <Dialog open={sendBackOpen} onOpenChange={setSendBackOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Send back to draft</DialogTitle></DialogHeader>
          <Textarea
            placeholder="What needs changing? (shown to the author)"
            value={sendBackNote}
            onChange={(e) => setSendBackNote(e.target.value)}
            rows={4}
            data-testid="library-reject-note"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSendBackOpen(false)}>Cancel</Button>
            <Button
              onClick={() => { if (selectedDoc) review.mutate({ id: selectedDoc.id, action: "reject", note: sendBackNote }); setSendBackOpen(false); }}
              data-testid="library-reject-confirm"
            >
              Send back
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Version history */}
      <Dialog open={historyOpen} onOpenChange={(o) => { setHistoryOpen(o); if (!o) setViewVersion(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Version history{selectedDoc ? ` — ${selectedDoc.title}` : ""}</DialogTitle></DialogHeader>
          <div className="flex gap-4 min-h-[320px]">
            <div className="w-56 shrink-0 border-r pr-3 space-y-1" data-testid="library-versions">
              {versions.length === 0 && <p className="text-xs text-muted-foreground">Not approved yet. Each approval is kept here.</p>}
              {versions.map((v) => (
                <button
                  key={v.version}
                  onClick={() => setViewVersion(v.version)}
                  className={cn("w-full text-left rounded-md px-2 py-1.5 text-xs", viewVersion === v.version ? "bg-accent" : "hover-elevate")}
                  data-testid={`library-version-${v.version}`}
                >
                  <div className="font-medium">v{v.version}{v.version === selectedDoc?.currentVersion ? " · latest approved" : ""}</div>
                  <div className="text-muted-foreground">{format(new Date(v.approvedAt), "d MMM yyyy, h:mm a")}{v.approvedByName ? ` · ${v.approvedByName}` : ""}</div>
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto max-h-[60vh]">
              {viewVersion !== null && versionBody?.version === viewVersion ? (
                <>
                  <h3 className="text-xl font-bold mb-3">{versionBody.title}</h3>
                  <NotionEditor key={`v-${viewVersion}`} content={versionBody.contentHtml} editable={false} />
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Pick a version to read it.</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm deletes */}
      <AlertDialog open={!!confirmDeleteId} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>This deletes the document and its version history. Archive it instead to keep the record.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirmDeleteId) deleteDoc.mutate(confirmDeleteId); setConfirmDeleteId(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!confirmDeleteFolderId} onOpenChange={(o) => !o && setConfirmDeleteFolderId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder?</AlertDialogTitle>
            <AlertDialogDescription>The folder goes; the documents in it become unfiled.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirmDeleteFolderId) deleteFolder.mutate(confirmDeleteFolderId); setConfirmDeleteFolderId(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});
