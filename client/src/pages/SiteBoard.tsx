import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ExternalLink,
  File as FileIcon,
  FileImage,
  FileText,
  Folder,
  FolderPlus,
  ListChecks,
  Loader2,
  Palette,
  MoreHorizontal,
  QrCode,
  Upload,
} from "lucide-react";
import type { ProjectFile } from "@shared/schema";
import { useProject } from "@/contexts/ProjectContext";
import { useUpload } from "@/hooks/use-upload";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SiteQrDialog } from "@/components/selections/SiteQrDialog";
import { SiteSelectionsPanel } from "@/components/siteBoard/SiteSelectionsPanel";
import { SiteSignDesignDialog } from "@/components/siteBoard/SiteSignDesignDialog";
import { cn } from "@/lib/utils";

const DEFAULT_FOLDER = "Plans";

const CHIP = "h-6 w-auto px-2 text-xs border rounded-md border-border/50 text-muted-foreground hover-elevate active-elevate-2 flex items-center gap-1";
const PRIMARY = "h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-1 disabled:opacity-60";

function fileSizeLabel(bytes: number | null | undefined) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileGlyph({ mimeType }: { mimeType: string | null }) {
  if (mimeType?.startsWith("image/")) return <FileImage className="w-4 h-4 text-muted-foreground" />;
  if (mimeType === "application/pdf") return <FileText className="w-4 h-4 text-[hsl(var(--coral))]" />;
  return <FileIcon className="w-4 h-4 text-muted-foreground" />;
}

/**
 * Site board: the project's files in Morada, and which of them the printed
 * site QR code shows. A file is only public once its "On site" switch is on.
 */
export default function SiteBoard({ projectId: projectIdProp }: { projectId?: string } = {}) {
  const { currentProject } = useProject();
  const projectId = projectIdProp ?? currentProject?.id;
  const { toast } = useToast();
  const filesKey = [`/api/projects/${projectId}/site-files`];

  const { data: files = [], isLoading } = useQuery<ProjectFile[]>({ queryKey: filesKey, enabled: !!projectId });

  const [extraFolders, setExtraFolders] = useState<string[]>([]);
  const [activeFolder, setActiveFolder] = useState(DEFAULT_FOLDER);
  const [showQr, setShowQr] = useState(false);
  const [showDesign, setShowDesign] = useState(false);
  // The left column picks a file folder or the Selections settings.
  const [view, setView] = useState<"files" | "selections">("files");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renaming, setRenaming] = useState<ProjectFile | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleting, setDeleting] = useState<ProjectFile | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { uploadFile } = useUpload();
  const [uploadingCount, setUploadingCount] = useState(0);

  const folders = useMemo(() => {
    const set = new Set<string>([DEFAULT_FOLDER, ...extraFolders, ...files.map((f) => f.folder)]);
    return Array.from(set).sort((a, b) =>
      a === DEFAULT_FOLDER ? -1 : b === DEFAULT_FOLDER ? 1 : a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  }, [files, extraFolders]);
  const inFolder = files.filter((f) => f.folder === activeFolder);
  const onSiteCount = files.filter((f) => f.onSite).length;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: filesKey });
  const update = useMutation({
    mutationFn: ({ id, ...patch }: { id: string; name?: string; folder?: string; onSite?: boolean }) =>
      apiRequest(`/api/projects/${projectId}/site-files/${id}`, "PATCH", patch),
    onMutate: async ({ id, ...patch }) => {
      await queryClient.cancelQueries({ queryKey: filesKey });
      const prev = queryClient.getQueryData<ProjectFile[]>(filesKey);
      queryClient.setQueryData<ProjectFile[]>(filesKey, (rows = []) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(filesKey, ctx.prev);
      toast({ title: "Couldn't save that change", variant: "destructive" });
    },
    onSettled: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/projects/${projectId}/site-files/${id}`, "DELETE"),
    onSuccess: invalidate,
    onError: () => toast({ title: "Couldn't delete the file", variant: "destructive" }),
  });

  const uploadAll = async (list: FileList | File[]) => {
    const picked = Array.from(list);
    if (!picked.length || !projectId) return;
    setUploadingCount((n) => n + picked.length);
    let failed = 0;
    for (const file of picked) {
      try {
        const uploaded = await uploadFile(file);
        if (!uploaded) throw new Error("upload failed");
        await apiRequest(`/api/projects/${projectId}/site-files`, "POST", {
          name: file.name,
          objectPath: uploaded.objectPath,
          uploadGrant: uploaded.uploadGrant,
          folder: activeFolder,
          mimeType: file.type || null,
          fileSize: file.size,
        });
      } catch {
        failed += 1;
      } finally {
        setUploadingCount((n) => n - 1);
      }
    }
    invalidate();
    if (failed) toast({ title: `${failed} file${failed === 1 ? "" : "s"} didn't upload`, variant: "destructive" });
  };

  const addFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    setExtraFolders((f) => (f.includes(name) ? f : [...f, name]));
    setActiveFolder(name);
    setNewFolderName("");
    setNewFolderOpen(false);
  };

  if (!projectId) {
    return <div className="p-8 text-sm text-muted-foreground">Open the site board from inside a project.</div>;
  }

  return (
    <div className="flex h-full flex-col" data-testid="site-board">
      <div className="border border-border rounded-t-lg bg-card flex-shrink-0">
        <div className="h-9 flex items-center justify-between px-3 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium">Site board</span>
            <span className="text-xs text-muted-foreground truncate" data-testid="text-on-site-count">
              {onSiteCount === 0 ? "No files on the site QR yet" : `${onSiteCount} file${onSiteCount === 1 ? "" : "s"} on the site QR`}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" className={CHIP} onClick={() => setShowDesign(true)} data-testid="button-sign-design">
              <Palette className="w-3.5 h-3.5" />Sign design
            </button>
            <button type="button" className={CHIP} onClick={() => setShowQr(true)} data-testid="button-site-qr">
              <QrCode className="w-3.5 h-3.5" />Site QR code
            </button>
            <button
              type="button"
              className={PRIMARY}
              onClick={() => fileInput.current?.click()}
              disabled={uploadingCount > 0}
              data-testid="button-upload-site-file"
            >
              {uploadingCount > 0 ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {uploadingCount > 0 ? `Uploading ${uploadingCount}…` : "Upload"}
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => { if (e.target.files) void uploadAll(e.target.files); e.target.value = ""; }}
              data-testid="input-site-file"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex border-x border-b border-border rounded-b-lg bg-card">
        {/* folders */}
        <div className="w-48 flex-shrink-0 border-r border-border p-2 flex flex-col gap-0.5 overflow-auto">
          {folders.map((name) => {
            const count = files.filter((f) => f.folder === name).length;
            const live = files.filter((f) => f.folder === name && f.onSite).length;
            return (
              <button
                key={name}
                type="button"
                onClick={() => { setActiveFolder(name); setView("files"); }}
                className={cn(
                  "h-7 px-2 rounded-md text-xs flex items-center gap-2 text-left hover-elevate",
                  view === "files" && activeFolder === name ? "bg-primary/10 text-primary" : "text-foreground",
                )}
                data-testid={`folder-${name}`}
              >
                <Folder className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate flex-1">{name}</span>
                {count > 0 && (
                  <span className="text-[10px] text-muted-foreground" title={`${live} on site`}>{live > 0 ? `${live}/${count}` : count}</span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            className="h-7 px-2 rounded-md text-xs flex items-center gap-2 text-muted-foreground hover-elevate mt-1"
            onClick={() => setNewFolderOpen(true)}
            data-testid="button-new-folder"
          >
            <FolderPlus className="w-3.5 h-3.5" />New folder
          </button>

          <div className="mt-3 pt-3 border-t border-border">
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Also on the QR</p>
            <button
              type="button"
              onClick={() => setView("selections")}
              className={cn(
                "w-full h-7 px-2 rounded-md text-xs flex items-center gap-2 text-left hover-elevate",
                view === "selections" ? "bg-primary/10 text-primary" : "text-foreground",
              )}
              data-testid="button-site-selections"
            >
              <ListChecks className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate flex-1">Selections</span>
            </button>
          </div>
        </div>

        {view === "selections" ? (
          <div className="flex-1 min-w-0 overflow-auto"><SiteSelectionsPanel projectId={projectId} /></div>
        ) : (
        /* files */
        <div
          className={cn("flex-1 min-w-0 overflow-auto relative", dragOver && "bg-primary/5")}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) void uploadAll(e.dataTransfer.files); }}
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : inFolder.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center gap-2 py-16 px-6">
              <Upload className="w-6 h-6 text-muted-foreground" />
              <p className="text-sm font-medium">Nothing in {activeFolder} yet</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                Drop files here or use Upload. Switch a file to <span className="font-medium">On site</span> and
                anyone who scans the site QR code can open it.
              </p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="text-muted-foreground border-b border-border">
                  <th className="text-left font-normal px-3 h-8">Name</th>
                  <th className="text-left font-normal px-3 h-8 w-24">Size</th>
                  <th className="text-left font-normal px-3 h-8 w-28">Added</th>
                  <th className="text-left font-normal px-3 h-8 w-24">On site</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {inFolder.map((f) => (
                  <tr key={f.id} className="border-b border-border/60 hover:bg-muted/40" data-testid={`row-site-file-${f.id}`}>
                    <td className="px-3 h-9">
                      <a
                        href={f.objectPath}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 min-w-0 hover:underline"
                      >
                        <FileGlyph mimeType={f.mimeType} />
                        <span className="truncate">{f.name}</span>
                      </a>
                    </td>
                    <td className="px-3 text-muted-foreground">{fileSizeLabel(f.fileSize)}</td>
                    <td className="px-3 text-muted-foreground">
                      {new Date(f.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-3">
                      <Switch
                        checked={f.onSite}
                        onCheckedChange={(onSite) => update.mutate({ id: f.id, onSite })}
                        aria-label={`Show ${f.name} on the site QR`}
                        data-testid={`switch-on-site-${f.id}`}
                      />
                    </td>
                    <td className="px-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" className="h-6 w-6 rounded-md flex items-center justify-center hover-elevate" data-testid={`menu-site-file-${f.id}`}>
                            <MoreHorizontal className="w-3.5 h-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <a href={f.objectPath} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="w-3.5 h-3.5 mr-2" />Open
                            </a>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setRenaming(f); setRenameValue(f.name); }}>Rename</DropdownMenuItem>
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>Move to folder</DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                              {folders.filter((n) => n !== f.folder).map((n) => (
                                <DropdownMenuItem key={n} onClick={() => update.mutate({ id: f.id, folder: n })}>{n}</DropdownMenuItem>
                              ))}
                              {folders.length < 2 && <DropdownMenuItem disabled>Make another folder first</DropdownMenuItem>}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => setDeleting(f)}>Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        )}
      </div>

      <SiteSignDesignDialog open={showDesign} onOpenChange={setShowDesign} projectId={projectId} />
      <SiteQrDialog projectId={projectId} projectName={currentProject?.name} open={showQr} onOpenChange={setShowQr} />

      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New folder</DialogTitle></DialogHeader>
          <Input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addFolder(); }}
            placeholder="e.g. Engineering"
            maxLength={80}
            data-testid="input-new-folder"
          />
          <p className="text-xs text-muted-foreground">The folder is saved once a file is in it.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderOpen(false)}>Cancel</Button>
            <Button onClick={addFolder} disabled={!newFolderName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renaming} onOpenChange={(o) => { if (!o) setRenaming(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Rename file</DialogTitle></DialogHeader>
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            maxLength={255}
            onKeyDown={(e) => {
              if (e.key === "Enter" && renaming && renameValue.trim()) {
                update.mutate({ id: renaming.id, name: renameValue.trim() });
                setRenaming(null);
              }
            }}
            data-testid="input-rename-file"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}>Cancel</Button>
            <Button
              disabled={!renameValue.trim()}
              onClick={() => { if (renaming) update.mutate({ id: renaming.id, name: renameValue.trim() }); setRenaming(null); }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => { if (!o) setDeleting(null); }}
        title="Delete this file?"
        description={deleting?.onSite ? "It's on the site QR — people on site won't be able to open it any more." : "It will be removed from the project."}
        confirmLabel="Delete"
        destructive
        onConfirm={() => { if (deleting) remove.mutate(deleting.id); setDeleting(null); }}
      />
    </div>
  );
}
