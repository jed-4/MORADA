import { useEffect, useMemo, useRef, useState } from "react";
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
import type {
  TakeoffPlan,
  TakeoffPlanPage,
  TakeoffMeasurement,
  TakeoffMarkup,
} from "@shared/schema";

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
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const [pendingDelete, setPendingDelete] = useState<TakeoffPlan | null>(null);
  const [renaming, setRenaming] = useState<TakeoffPlan | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const plansKey = ["/api/projects", projectId, "takeoff/plans"];
  const { data: plans = [], isLoading } = useQuery<TakeoffPlan[]>({
    queryKey: plansKey,
  });

  const measurementsKey = ["/api/projects", projectId, "takeoff/measurements"];
  const { data: allMeasurements = [] } = useQuery<TakeoffMeasurement[]>({
    queryKey: measurementsKey,
  });

  const { uploadFile, isUploading } = useUpload();

  const createPlan = useMutation({
    mutationFn: async (data: { name: string; objectPath: string; pageCount: number }) => {
      return await apiRequest(`/api/projects/${projectId}/takeoff/plans`, "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: plansKey });
      toast({ title: "Plan uploaded" });
      // Scroll to bottom after the new plan renders.
      setTimeout(() => {
        scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 250);
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

      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Plans</h2>
          <p className="text-sm text-muted-foreground">
            All uploaded PDF plans appear here in one continuous view
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
        <div className="space-y-10 max-w-5xl mx-auto">
          {plans.map((plan) => (
            <PlanSection
              key={plan.id}
              plan={plan}
              projectId={projectId}
              measurements={allMeasurements.filter((m) => m.planId === plan.id)}
              onOpenPage={(page) => onOpenPlan(plan, page)}
              onDelete={() => setPendingDelete(plan)}
              onRename={() => {
                setRenaming(plan);
                setRenameValue(plan.name);
              }}
            />
          ))}
          <div ref={scrollEndRef} />
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

interface PlanSectionProps {
  plan: TakeoffPlan;
  projectId: string;
  measurements: TakeoffMeasurement[];
  onOpenPage: (pageNumber: number) => void;
  onDelete: () => void;
  onRename: () => void;
}

function PlanSection({
  plan,
  projectId,
  measurements,
  onOpenPage,
  onDelete,
  onRename,
}: PlanSectionProps) {
  const pagesKey = ["/api/projects", projectId, "takeoff/plans", plan.id, "pages"];
  const { data: pages = [] } = useQuery<TakeoffPlanPage[]>({ queryKey: pagesKey });

  const markupsKey = ["/api/projects", projectId, "takeoff/plans", plan.id, "markups", "all"];
  const { data: markups = [] } = useQuery<TakeoffMarkup[]>({
    queryKey: markupsKey,
    queryFn: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/takeoff/plans/${plan.id}/markups?page=all`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load markups");
      return res.json();
    },
  });

  const [pdfPageCount, setPdfPageCount] = useState<number>(plan.pageCount || 1);

  const pageNumbers = useMemo(
    () => Array.from({ length: pdfPageCount }, (_, i) => i + 1),
    [pdfPageCount],
  );

  return (
    <section
      className="space-y-3"
      data-testid={`section-plan-${plan.id}`}
    >
      <div className="flex items-center justify-between gap-2 sticky top-0 z-[2] bg-background/95 backdrop-blur py-2 border-b border-border">
        <div className="min-w-0">
          <div className="text-base font-semibold truncate" data-testid={`text-plan-name-${plan.id}`}>
            {plan.name}
          </div>
          <div className="text-xs text-muted-foreground">
            {pdfPageCount} page{pdfPageCount === 1 ? "" : "s"}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              data-testid={`button-plan-menu-${plan.id}`}
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

      <Document
        file={{ url: plan.objectPath, withCredentials: true } as any}
        onLoadSuccess={({ numPages }) => setPdfPageCount(numPages)}
        loading={
          <div className="p-8 text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading PDF…
          </div>
        }
        error={<div className="p-8 text-sm text-destructive">Failed to load PDF</div>}
      >
        <div className="space-y-4">
          {pageNumbers.map((pageNumber) => {
            const pageRow = pages.find((p) => p.pageNumber === pageNumber) ?? null;
            const pageMeasurements = pageRow
              ? measurements.filter((m) => m.pageId === pageRow.id)
              : [];
            const pageMarkups = markups.filter((m) => m.pageNumber === pageNumber);
            return (
              <LazyPlanPage
                key={pageNumber}
                planId={plan.id}
                pageNumber={pageNumber}
                totalPages={pdfPageCount}
                measurements={pageMeasurements}
                markups={pageMarkups}
                onOpen={() => onOpenPage(pageNumber)}
              />
            );
          })}
        </div>
      </Document>
    </section>
  );
}

interface LazyPlanPageProps {
  planId: string;
  pageNumber: number;
  totalPages: number;
  measurements: TakeoffMeasurement[];
  markups: TakeoffMarkup[];
  onOpen: () => void;
}

function LazyPlanPage({
  planId,
  pageNumber,
  totalPages,
  measurements,
  markups,
  onOpen,
}: LazyPlanPageProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [dims, setDims] = useState<{ width: number; height: number } | null>(null);
  const [renderWidth, setRenderWidth] = useState(900);

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
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    const update = () => {
      if (!wrapRef.current) return;
      const cw = wrapRef.current.clientWidth;
      setRenderWidth(Math.max(400, cw));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const aspectFallback = "aspect-[3/4]";
  const heightStyle = dims ? { height: (dims.height / dims.width) * renderWidth } : undefined;

  return (
    <div
      ref={wrapRef}
      data-testid={`page-${planId}-${pageNumber}`}
      className="relative bg-white border border-border rounded-md overflow-hidden cursor-pointer hover-elevate"
      style={heightStyle}
      onClick={onOpen}
    >
      <div className="absolute top-2 left-2 z-[1] text-[11px] px-2 py-0.5 rounded-sm bg-background/80 text-muted-foreground border border-border">
        Page {pageNumber} of {totalPages}
      </div>
      {visible ? (
        <div className="relative" style={{ width: renderWidth }}>
          <Page
            pageNumber={pageNumber}
            width={renderWidth}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            onRenderSuccess={(page: any) => setDims({ width: page.width, height: page.height })}
            loading={
              <div className={`w-full ${aspectFallback} flex items-center justify-center text-muted-foreground`}>
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            }
          />
          {dims && (
            <ReadOnlyOverlay
              width={renderWidth}
              height={(dims.height / dims.width) * renderWidth}
              measurements={measurements}
              markups={markups}
            />
          )}
        </div>
      ) : (
        <div className={`w-full ${aspectFallback} flex items-center justify-center text-muted-foreground`}>
          <FileText className="h-8 w-8 opacity-40" />
        </div>
      )}
    </div>
  );
}

function ReadOnlyOverlay({
  width,
  height,
  measurements,
  markups,
}: {
  width: number;
  height: number;
  measurements: TakeoffMeasurement[];
  markups: TakeoffMarkup[];
}) {
  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      {measurements.map((m) => {
        if (!m.isVisible) return null;
        const geo = (m.geometry as Array<{ x: number; y: number }> | null) ?? [];
        if (!Array.isArray(geo) || geo.length === 0) return null;
        const pts = geo.map((p) => ({ x: p.x * width, y: p.y * height }));
        const color = m.color || "#A890D4";
        if (m.measurementType === "area" && pts.length >= 3) {
          return (
            <polygon
              key={m.id}
              points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
              fill={color + "33"}
              stroke={color}
              strokeWidth={1.5}
            />
          );
        }
        if (m.measurementType === "linear" && pts.length >= 2) {
          return (
            <polyline
              key={m.id}
              points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={color}
              strokeWidth={2}
            />
          );
        }
        if (m.measurementType === "count") {
          return (
            <g key={m.id}>
              {pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={6} fill={color} fillOpacity={0.6} stroke={color} strokeWidth={1.5} />
              ))}
            </g>
          );
        }
        return null;
      })}

      {markups.map((m) => {
        const geo = (m.geometry as Array<{ x: number; y: number }> | null) ?? [];
        if (!Array.isArray(geo) || geo.length === 0) return null;
        const pts = geo.map((p) => ({ x: p.x * width, y: p.y * height }));
        const color = m.color || "#A890D4";
        const sw = m.strokeWidth ?? 2;

        if (m.markupType === "dimension" && pts.length >= 2) {
          const a = pts[0]; const b = pts[1];
          return (
            <line key={m.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={sw} />
          );
        }
        if (m.markupType === "cloud" && pts.length >= 3) {
          return (
            <polygon
              key={m.id}
              points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
              fill={color + "1A"}
              stroke={color}
              strokeWidth={sw}
            />
          );
        }
        if (m.markupType === "text" && pts.length >= 1) {
          const p = pts[0];
          return (
            <text
              key={m.id}
              x={p.x}
              y={p.y}
              fontSize={m.fontSize ?? 14}
              fill={color}
              style={{ paintOrder: "stroke" }}
              stroke="white"
              strokeWidth={3}
            >
              {m.label || "Text"}
            </text>
          );
        }
        if (m.markupType === "brush" && pts.length >= 2) {
          return (
            <polyline
              key={m.id}
              points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={color}
              strokeWidth={sw}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        }
        return null;
      })}
    </svg>
  );
}
