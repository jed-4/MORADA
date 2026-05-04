import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Document, Page, pdfjs } from "react-pdf";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useUpload } from "@/hooks/use-upload";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2, MoreVertical, Plus, Upload, FileText, Trash2, Pencil,
  ChevronRight, ChevronDown,
} from "lucide-react";
import type { TakeoffPlan, TakeoffPlanPage } from "@shared/schema";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface Props {
  projectId: string;
  onOpenPlan: (plan: TakeoffPlan, page: number) => void;
}

async function getPdfPageCount(file: File): Promise<number> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const count = pdf.numPages;
  await pdf.destroy();
  return count;
}

export default function TakeoffPlansTab({ projectId, onOpenPlan }: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingDelete, setPendingDelete] = useState<TakeoffPlan | null>(null);
  const [renaming, setRenaming] = useState<TakeoffPlan | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const plansKey = ["/api/projects", projectId, "takeoff/plans"];
  const { data: plans = [], isLoading } = useQuery<TakeoffPlan[]>({
    queryKey: plansKey,
  });

  const { uploadFile, isUploading } = useUpload();

  const createPlan = useMutation({
    mutationFn: async (data: { name: string; objectPath: string; pageCount: number }) => {
      return await apiRequest(`/api/projects/${projectId}/takeoff/plans`, "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: plansKey });
      toast({ title: "Plan uploaded" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to save plan", description: err?.message, variant: "destructive" });
    },
  });

  const deletePlan = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/projects/${projectId}/takeoff/plans/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: plansKey });
      toast({ title: "Plan deleted" });
      setPendingDelete(null);
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete plan", description: err?.message, variant: "destructive" });
    },
  });

  const renamePlan = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      return await apiRequest(`/api/projects/${projectId}/takeoff/plans/${id}`, "PATCH", { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: plansKey });
      toast({ title: "Plan renamed" });
      setRenaming(null);
    },
    onError: (err: any) => {
      toast({ title: "Failed to rename plan", description: err?.message, variant: "destructive" });
    },
  });

  const handleFile = async (file: File) => {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast({ title: "PDF files only", variant: "destructive" });
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast({ title: "Maximum file size is 50 MB", variant: "destructive" });
      return;
    }
    setIsProcessing(true);
    try {
      const pageCount = await getPdfPageCount(file).catch(() => 1);
      const result = await uploadFile(file);
      if (!result) {
        toast({ title: "Upload failed", variant: "destructive" });
        return;
      }
      await createPlan.mutateAsync({
        name: file.name.replace(/\.pdf$/i, ""),
        objectPath: result.objectPath,
        pageCount,
      });
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const triggerUpload = () => fileInputRef.current?.click();
  const busy = isUploading || isProcessing || createPlan.isPending;

  return (
    <div className="p-6 space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
        data-testid="input-takeoff-pdf"
      />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">Plans</h2>
          <p className="text-sm text-muted-foreground">
            Click any page to open it in the take-off viewer
          </p>
        </div>
        <Button onClick={triggerUpload} disabled={busy} data-testid="button-upload-plan">
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          Upload PDF
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading plans…
        </div>
      ) : plans.length === 0 ? (
        <button
          onClick={triggerUpload}
          disabled={busy}
          data-testid="button-upload-empty-state"
          className="w-full border-2 border-dashed border-border rounded-md py-16 flex flex-col items-center justify-center gap-3 hover-elevate"
        >
          {busy ? (
            <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
          ) : (
            <Upload className="h-8 w-8 text-muted-foreground" />
          )}
          <div className="text-base font-medium">Upload your first plan</div>
          <div className="text-sm text-muted-foreground">PDF, up to 50 MB</div>
        </button>
      ) : (
        <div className="space-y-6 divide-y divide-border">
          {plans.map((plan) => (
            <div key={plan.id} className="pt-6 first:pt-0">
              <PlanGroup
                plan={plan}
                projectId={projectId}
                collapsed={!!collapsed[plan.id]}
                onToggleCollapsed={() =>
                  setCollapsed((prev) => ({ ...prev, [plan.id]: !prev[plan.id] }))
                }
                onOpenPage={(pageNumber) => onOpenPlan(plan, pageNumber)}
                onDelete={() => setPendingDelete(plan)}
                onRename={() => {
                  setRenaming(plan);
                  setRenameValue(plan.name);
                }}
              />
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this plan?</AlertDialogTitle>
            <AlertDialogDescription>
              All measurements and pages on “{pendingDelete?.name}” will be removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && deletePlan.mutate(pendingDelete.id)}
              data-testid="button-confirm-delete-plan"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename plan</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="Plan name"
            data-testid="input-rename-plan"
            onKeyDown={(e) => {
              if (e.key === "Enter" && renaming && renameValue.trim()) {
                renamePlan.mutate({ id: renaming.id, name: renameValue.trim() });
              }
            }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button>
            <Button
              onClick={() =>
                renaming && renameValue.trim() &&
                renamePlan.mutate({ id: renaming.id, name: renameValue.trim() })
              }
              disabled={!renameValue.trim() || renamePlan.isPending}
              data-testid="button-confirm-rename-plan"
            >
              {renamePlan.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface PlanGroupProps {
  plan: TakeoffPlan;
  projectId: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onOpenPage: (pageNumber: number) => void;
  onDelete: () => void;
  onRename: () => void;
}

const THUMB_WIDTH = 160;

function PlanGroup({
  plan,
  projectId,
  collapsed,
  onToggleCollapsed,
  onOpenPage,
  onDelete,
  onRename,
}: PlanGroupProps) {
  const pagesKey = ["/api/projects", projectId, "takeoff/plans", plan.id, "pages"];
  const { data: pages = [] } = useQuery<TakeoffPlanPage[]>({ queryKey: pagesKey });
  const [pdfPageCount, setPdfPageCount] = useState<number>(plan.pageCount || 1);

  const renamePage = useMutation({
    mutationFn: async ({ pageNumber, name }: { pageNumber: number; name: string }) => {
      return await apiRequest(
        `/api/projects/${projectId}/takeoff/plans/${plan.id}/pages`,
        "POST",
        { pageNumber, name },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pagesKey });
    },
  });

  const pageNumbers = Array.from(
    { length: Math.max(plan.pageCount || 1, pdfPageCount) },
    (_, i) => i + 1,
  );

  const documentFile = useMemo(
    () => ({ url: plan.objectPath, withCredentials: true } as any),
    [plan.objectPath],
  );

  return (
    <section data-testid={`section-plan-${plan.id}`} className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          size="icon"
          variant="ghost"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand plan" : "Collapse plan"}
          data-testid={`button-toggle-plan-${plan.id}`}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
        <button
          onClick={onToggleCollapsed}
          className="flex-1 min-w-0 text-left"
          data-testid={`button-plan-header-${plan.id}`}
        >
          <div
            className="text-base font-semibold truncate"
            title={plan.name}
            data-testid={`text-plan-name-${plan.id}`}
          >
            {plan.name}
          </div>
          <div className="text-xs text-muted-foreground">
            {pageNumbers.length} page{pageNumbers.length === 1 ? "" : "s"}
          </div>
        </button>
        <Button
          size="icon"
          variant="ghost"
          onClick={onDelete}
          aria-label="Delete plan"
          data-testid={`button-delete-plan-${plan.id}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Plan options"
              data-testid={`button-plan-menu-${plan.id}`}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onRename} data-testid={`menu-rename-plan-${plan.id}`}>
              <Pencil className="h-4 w-4 mr-2" /> Rename plan
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive"
              data-testid={`menu-delete-plan-${plan.id}`}
            >
              <Trash2 className="h-4 w-4 mr-2" /> Delete plan
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {!collapsed && (
        <div className="pl-10">
          <Document
            file={documentFile}
            onLoadSuccess={({ numPages }) => setPdfPageCount(numPages)}
            loading={
              <div className="p-8 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading pages…
              </div>
            }
            error={
              <div className="p-8 text-sm text-destructive">Failed to load PDF</div>
            }
          >
            <div
              className="grid gap-4"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(${THUMB_WIDTH}px, 1fr))`,
              }}
            >
              {pageNumbers.map((pageNumber) => {
                const pageRow = pages.find((p) => p.pageNumber === pageNumber);
                return (
                  <PageThumb
                    key={pageNumber}
                    planId={plan.id}
                    pageNumber={pageNumber}
                    pageRow={pageRow}
                    onOpen={() => onOpenPage(pageNumber)}
                    onRename={(name) => renamePage.mutate({ pageNumber, name })}
                  />
                );
              })}
            </div>
          </Document>
        </div>
      )}
    </section>
  );
}

interface PageThumbProps {
  planId: string;
  pageNumber: number;
  pageRow?: TakeoffPlanPage;
  onOpen: () => void;
  onRename: (name: string) => void;
}

class PageRenderBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch() {
    // react-pdf throws on cancelled renders / worker hiccups — these are benign
    // and recover on the next interaction. Swallow silently.
  }
  componentDidUpdate(prev: { children: ReactNode }) {
    if (prev.children !== this.props.children && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function PageThumb({ planId, pageNumber, pageRow, onOpen, onRename }: PageThumbProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");

  useEffect(() => {
    if (!wrapRef.current || visible) return;
    const el = wrapRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  const displayName = pageRow?.name?.trim() || `Page ${pageNumber}`;
  const scaleLabel = pageRow?.isScaled
    ? pageRow.scaleRatio
      ? `1:${pageRow.scaleRatio}`
      : "Calibrated"
    : "Not scaled";

  const startEdit = () => {
    setDraftName(displayName);
    setEditing(true);
  };

  const commit = () => {
    const next = draftName.trim();
    setEditing(false);
    if (!next || next === displayName) return;
    onRename(next);
  };

  return (
    <div
      ref={wrapRef}
      data-testid={`card-page-${planId}-${pageNumber}`}
      className="group relative rounded-md border border-border bg-card hover-elevate cursor-pointer flex flex-col"
      onClick={() => {
        if (!editing) onOpen();
      }}
    >
      <div
        className="relative bg-muted flex items-center justify-center overflow-hidden rounded-t-md"
        style={{ width: "100%", aspectRatio: "3 / 4" }}
      >
        {visible ? (
          <PageRenderBoundary
            fallback={
              <div className="text-xs text-muted-foreground p-2 text-center">
                Preview unavailable
              </div>
            }
          >
            <Page
              pageNumber={pageNumber}
              width={THUMB_WIDTH}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              loading={
                <div className="flex items-center justify-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              }
              error={
                <div className="text-xs text-muted-foreground p-2 text-center">
                  Preview unavailable
                </div>
              }
            />
          </PageRenderBoundary>
        ) : (
          <FileText className="h-6 w-6 text-muted-foreground opacity-40" />
        )}
        <div className="absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0.5 rounded-sm bg-background/80 text-muted-foreground border border-border">
          {pageNumber}
        </div>
      </div>

      <div className="p-2 flex flex-col gap-1.5">
        {editing ? (
          <Input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setEditing(false);
              }
            }}
            className="h-7 text-xs"
            data-testid={`input-page-name-${planId}-${pageNumber}`}
          />
        ) : (
          <div
            className="text-xs font-medium truncate"
            title={`${displayName} — double-click to rename`}
            onDoubleClick={(e) => {
              e.stopPropagation();
              startEdit();
            }}
            data-testid={`text-page-name-${planId}-${pageNumber}`}
          >
            {displayName}
          </div>
        )}
        <Badge
          variant={pageRow?.isScaled ? "secondary" : "outline"}
          className="self-start text-[10px] px-1.5 py-0"
          data-testid={`badge-page-scale-${planId}-${pageNumber}`}
        >
          {scaleLabel}
        </Badge>
      </div>
    </div>
  );
}
