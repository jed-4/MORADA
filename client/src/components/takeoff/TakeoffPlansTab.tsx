import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Document, Page, pdfjs } from "react-pdf";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useUpload } from "@/hooks/use-upload";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
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
import { Loader2, MoreVertical, Plus, Upload, FileText, Trash2 } from "lucide-react";
import type { TakeoffPlan } from "@shared/schema";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

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

      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Plans</h2>
          <p className="text-sm text-muted-foreground">
            Upload PDF plans to take measurements from
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
    </div>
  );
}

function PlanCard({
  plan,
  onOpen,
  onDelete,
}: {
  plan: TakeoffPlan;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [thumbError, setThumbError] = useState(false);

  return (
    <div
      className="group rounded-md border border-border bg-card overflow-hidden hover-elevate"
      data-testid={`card-plan-${plan.id}`}
    >
      <button
        onClick={onOpen}
        className="block w-full bg-muted/30 aspect-[3/4] flex items-center justify-center overflow-hidden"
      >
        {thumbError ? (
          <FileText className="h-12 w-12 text-muted-foreground" />
        ) : (
          <Document
            file={{ url: plan.objectPath, withCredentials: true }}
            onLoadError={() => setThumbError(true)}
            loading={<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
            error={<FileText className="h-12 w-12 text-muted-foreground" />}
          >
            <Page
              pageNumber={1}
              width={220}
              renderTextLayer={false}
              renderAnnotationLayer={false}
            />
          </Document>
        )}
      </button>
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border">
        <button
          onClick={onOpen}
          className="text-left flex-1 min-w-0"
          data-testid={`button-open-plan-${plan.id}`}
        >
          <div className="text-sm font-medium truncate">{plan.name}</div>
          <div className="text-xs text-muted-foreground">
            {plan.pageCount} page{plan.pageCount === 1 ? "" : "s"}
          </div>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              data-testid={`button-plan-menu-${plan.id}`}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
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
  );
}
