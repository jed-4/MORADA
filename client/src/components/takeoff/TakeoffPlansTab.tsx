import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Document, Page, pdfjs } from "react-pdf";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useUpload } from "@/hooks/use-upload";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Loader2, MoreVertical, Plus, Upload, FileText, Trash2, Pencil } from "lucide-react";
import type { TakeoffPlan } from "@shared/schema";

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
            Click any plan to open it in the take-off viewer
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
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              onOpen={() => onOpenPlan(plan, 1)}
              onDelete={() => setPendingDelete(plan)}
              onRename={() => {
                setRenaming(plan);
                setRenameValue(plan.name);
              }}
            />
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

interface PlanCardProps {
  plan: TakeoffPlan;
  onOpen: () => void;
  onDelete: () => void;
  onRename: () => void;
}

function PlanCard({ plan, onOpen, onDelete, onRename }: PlanCardProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [thumbWidth, setThumbWidth] = useState(280);
  const [pageCount, setPageCount] = useState<number>(plan.pageCount || 1);

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

  useEffect(() => {
    const update = () => {
      if (!wrapRef.current) return;
      setThumbWidth(Math.max(200, wrapRef.current.clientWidth));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return (
    <div
      ref={wrapRef}
      data-testid={`card-plan-${plan.id}`}
      className="group relative rounded-md border border-border bg-card overflow-hidden hover-elevate cursor-pointer flex flex-col"
      onClick={onOpen}
    >
      <div className="relative aspect-[3/4] bg-muted overflow-hidden flex items-center justify-center">
        {visible ? (
          <Document
            file={{ url: plan.objectPath, withCredentials: true } as any}
            onLoadSuccess={({ numPages }) => setPageCount(numPages)}
            loading={
              <div className="flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            }
            error={
              <div className="flex items-center justify-center text-muted-foreground p-2 text-xs">
                Preview unavailable
              </div>
            }
          >
            <Page
              pageNumber={1}
              width={thumbWidth}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              loading={
                <div className="flex items-center justify-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              }
            />
          </Document>
        ) : (
          <FileText className="h-10 w-10 text-muted-foreground opacity-40" />
        )}
      </div>

      <div className="flex items-center justify-between gap-2 p-3 border-t border-border">
        <div className="min-w-0 flex-1">
          <div
            className="text-sm font-medium truncate"
            data-testid={`text-plan-name-${plan.id}`}
            title={plan.name}
          >
            {plan.name}
          </div>
          <div className="text-xs text-muted-foreground">
            {pageCount} page{pageCount === 1 ? "" : "s"}
          </div>
        </div>
        <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={onDelete}
            data-testid={`button-delete-plan-${plan.id}`}
            aria-label="Delete plan"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                data-testid={`button-plan-menu-${plan.id}`}
                aria-label="Plan options"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onRename} data-testid={`menu-rename-plan-${plan.id}`}>
                <Pencil className="h-4 w-4 mr-2" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive"
                data-testid={`menu-delete-plan-${plan.id}`}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
