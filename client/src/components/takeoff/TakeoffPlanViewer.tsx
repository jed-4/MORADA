import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Document, Page, pdfjs } from "react-pdf";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Hand,
  MousePointer2,
  Square,
  Minus,
  Hash,
  Pencil,
  Ruler,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCw,
  Loader2,
} from "lucide-react";
import type {
  TakeoffPlan,
  TakeoffPlanPage,
  TakeoffMeasurement,
  TakeoffCategory,
} from "@shared/schema";
import TakeoffDrawingCanvas, {
  type DrawMode,
} from "./TakeoffDrawingCanvas";
import TakeoffScaleModal from "./TakeoffScaleModal";
import TakeoffCreateMeasurementModal, {
  type PendingMeasurement,
  type MeasurementType,
} from "./TakeoffCreateMeasurementModal";
import TakeoffMeasurementPanel from "./TakeoffMeasurementPanel";
import {
  computeQuantity,
  defaultUnitForType,
  pixelsToFractions,
  type Point,
} from "./useTakeoffGeometry";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

interface Props {
  plan: TakeoffPlan;
  initialPage: number;
  projectId: string;
  onClose: () => void;
}

const STANDARD_SCALES = [50, 75, 100, 200, 500, 1000];

export default function TakeoffPlanViewer({
  plan,
  initialPage,
  projectId,
  onClose,
}: Props) {
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfPageCount, setPdfPageCount] = useState(plan.pageCount || 1);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [pageDims, setPageDims] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [renderWidth, setRenderWidth] = useState(900);
  const [drawMode, setDrawMode] = useState<DrawMode>("select");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [pending, setPending] = useState<PendingMeasurement | null>(null);
  const [scaleModalOpen, setScaleModalOpen] = useState(false);
  const [calibrationPxLength, setCalibrationPxLength] = useState(0);
  const [statusMessage, setStatusMessage] = useState("Ready");
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const panState = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  const pagesKey = ["/api/projects", projectId, "takeoff/plans", plan.id, "pages"];
  const { data: pages = [] } = useQuery<TakeoffPlanPage[]>({ queryKey: pagesKey });
  const currentPageData = pages.find((p) => p.pageNumber === currentPage);

  const categoriesKey = ["/api/projects", projectId, "takeoff/categories"];
  const { data: categories = [] } = useQuery<TakeoffCategory[]>({ queryKey: categoriesKey });

  const pageMeasurementsKey = currentPageData
    ? ["/api/projects", projectId, "takeoff/pages", currentPageData.id, "measurements"]
    : null;
  const { data: pageMeasurements = [] } = useQuery<TakeoffMeasurement[]>({
    queryKey: pageMeasurementsKey ?? [],
    enabled: !!currentPageData,
  });

  const upsertPage = useMutation({
    mutationFn: async (data: Partial<TakeoffPlanPage> & { pageNumber: number }) => {
      return await apiRequest(
        `/api/projects/${projectId}/takeoff/plans/${plan.id}/pages`,
        "POST",
        data,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pagesKey });
    },
    onError: (err: any) => {
      toast({ title: "Failed to save scale", description: err?.message, variant: "destructive" });
    },
  });

  const createMeasurement = useMutation({
    mutationFn: async (data: Partial<TakeoffMeasurement>) => {
      return await apiRequest(
        `/api/projects/${projectId}/takeoff/measurements`,
        "POST",
        data,
      );
    },
    onSuccess: () => {
      if (pageMeasurementsKey) queryClient.invalidateQueries({ queryKey: pageMeasurementsKey });
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", projectId, "takeoff/measurements"],
      });
      toast({ title: "Measurement saved" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to save measurement", description: err?.message, variant: "destructive" });
    },
  });

  // Fit-to-container width for the rendered PDF page.
  useEffect(() => {
    const update = () => {
      if (!containerRef.current) return;
      const cw = containerRef.current.clientWidth - 24;
      setRenderWidth(Math.max(400, cw));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const isScaled = currentPageData?.isScaled === true;

  const finalRenderWidth = renderWidth * zoom;
  const finalRenderHeight = pageDims
    ? (pageDims.height / pageDims.width) * finalRenderWidth
    : 0;

  const ensurePageRow = async (): Promise<TakeoffPlanPage> => {
    if (currentPageData) return currentPageData;
    return await upsertPage.mutateAsync({
      pageNumber: currentPage,
      isScaled: false,
    });
  };

  const handleStandardScale = async (ratio: number) => {
    await upsertPage.mutateAsync({
      pageNumber: currentPage,
      isScaled: true,
      scaleRatio: ratio,
      calibrationPixelLength: null as any,
      calibrationRealDistance: null as any,
    });
    toast({ title: `Scale set to 1:${ratio}` });
  };

  const handleStartCalibration = async () => {
    await ensurePageRow();
    setDrawMode("calibrate");
    setStatusMessage("Click two points along a known dimension, then double-click to finish");
  };

  const handleCalibrateComplete = (a: Point, b: Point) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const px = Math.sqrt(dx * dx + dy * dy);
    setCalibrationPxLength(px);
    setScaleModalOpen(true);
    setDrawMode("select");
  };

  const handleSaveCalibration = async (data: {
    calibrationPixelLength: number;
    calibrationRealDistance: number;
    calibrationUnit: "mm" | "cm" | "m";
  }) => {
    // Store calibration as a fraction of current rendered width so it stays valid
    // regardless of zoom level when measurements are later drawn.
    const fractionOfWidth =
      finalRenderWidth > 0 ? data.calibrationPixelLength / finalRenderWidth : 0;
    await upsertPage.mutateAsync({
      pageNumber: currentPage,
      isScaled: true,
      scaleRatio: null as any,
      calibrationPixelLength: fractionOfWidth,
      calibrationRealDistance: data.calibrationRealDistance,
      calibrationUnit: data.calibrationUnit,
    });
    setScaleModalOpen(false);
    toast({ title: "Scale calibrated" });
  };

  const beginCreate = () => {
    if (!isScaled) {
      toast({
        title: "Set a scale first",
        description: "Choose a standard scale or calibrate from a known dimension.",
        variant: "destructive",
      });
      return;
    }
    setCreateOpen(true);
  };

  const handlePending = async (data: PendingMeasurement) => {
    setPending(data);
    setCreateOpen(false);
    if (data.measurementType === "manual") {
      // Save immediately as a manual measurement with no geometry.
      const page = await ensurePageRow();
      await createMeasurement.mutateAsync({
        planId: plan.id,
        pageId: page.id,
        categoryId: data.categoryId,
        name: data.name,
        measurementType: data.measurementType,
        color: data.color,
        geometry: [] as any,
        quantity: 0,
        unit: "",
        multiplier: data.multiplier,
        wastePercent: data.wastePercent,
      });
      setPending(null);
      return;
    }
    setDrawMode(data.measurementType as DrawMode);
    setStatusMessage(
      data.measurementType === "count"
        ? "Click to drop count markers — click another tool to finish"
        : "Click to add points — double-click to finish",
    );
  };

  const finishGeometry = async (geometryPx: Point[], type: MeasurementType) => {
    if (!pending) return;
    const page = await ensurePageRow();
    const geometryFractions = pixelsToFractions(
      geometryPx,
      finalRenderWidth,
      finalRenderHeight,
    );
    const { quantity, unit } = computeQuantity(
      geometryFractions,
      type,
      page,
      finalRenderWidth,
      finalRenderHeight,
    );
    await createMeasurement.mutateAsync({
      planId: plan.id,
      pageId: page.id,
      categoryId: pending.categoryId,
      name: pending.name,
      measurementType: type,
      color: pending.color,
      geometry: geometryFractions as any,
      quantity,
      unit: unit || defaultUnitForType(type),
      multiplier: pending.multiplier,
      wastePercent: pending.wastePercent,
    });
    if (type !== "count") {
      setPending(null);
      setDrawMode("select");
      setStatusMessage("Ready");
    }
  };

  const scaleChip = useMemo(() => {
    if (!isScaled || !currentPageData) return "Not scaled";
    if (currentPageData.scaleRatio) return `1:${currentPageData.scaleRatio}`;
    if (currentPageData.calibrationPixelLength && currentPageData.calibrationRealDistance) {
      return `Calibrated (${currentPageData.calibrationRealDistance} ${currentPageData.calibrationUnit})`;
    }
    return "Scaled";
  }, [isScaled, currentPageData]);

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Top nav */}
      <div className="h-12 flex items-center justify-between px-3 border-b border-border bg-background gap-3">
        <Button variant="ghost" size="sm" onClick={onClose} data-testid="button-close-viewer">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="text-sm font-medium truncate flex-1 text-center">{plan.name}</div>
        <Badge variant={isScaled ? "secondary" : "outline"} data-testid="badge-scale">
          <Ruler className="h-3 w-3 mr-1" /> {scaleChip}
        </Badge>
      </div>

      {/* Page strip */}
      {pdfPageCount > 1 && (
        <div className="h-9 flex items-center gap-1 px-3 border-b border-border overflow-x-auto bg-background">
          {Array.from({ length: pdfPageCount }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setCurrentPage(p)}
              className={`text-xs px-3 h-7 rounded-md ${
                currentPage === p
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover-elevate"
              }`}
              data-testid={`button-page-${p}`}
            >
              Page {p}
            </button>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="h-11 flex items-center gap-1 px-3 border-b border-border bg-background">
        <ToolBtn active={drawMode === "select"} onClick={() => setDrawMode("select")} label="Select" testId="tool-select">
          <MousePointer2 className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn active={drawMode === "pan"} onClick={() => setDrawMode("pan")} label="Pan" testId="tool-pan">
          <Hand className="h-4 w-4" />
        </ToolBtn>
        <Divider />
        <ToolBtn
          active={drawMode === "area"}
          onClick={() => beginCreate()}
          disabled={!isScaled}
          label="Area"
          testId="tool-area"
        >
          <Square className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn
          active={drawMode === "linear"}
          onClick={() => beginCreate()}
          disabled={!isScaled}
          label="Linear"
          testId="tool-linear"
        >
          <Minus className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn
          active={drawMode === "count"}
          onClick={() => beginCreate()}
          disabled={!isScaled}
          label="Count"
          testId="tool-count"
        >
          <Hash className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn onClick={() => beginCreate()} disabled={!isScaled} label="Manual" testId="tool-manual">
          <Pencil className="h-4 w-4" />
        </ToolBtn>
        <Divider />
        <Button variant="ghost" size="sm" onClick={handleStartCalibration} data-testid="tool-calibrate">
          <Ruler className="h-4 w-4 mr-1" /> Calibrate
        </Button>
        <div className="flex-1" />
        <Button size="icon" variant="ghost" onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))} data-testid="button-zoom-out">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="text-xs tabular-nums w-12 text-center">{Math.round(zoom * 100)}%</span>
        <Button size="icon" variant="ghost" onClick={() => setZoom((z) => Math.min(4, z + 0.25))} data-testid="button-zoom-in">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => setZoom(1)} data-testid="button-fit">
          <Maximize2 className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setRotation((r) => ((r + 90) % 360) as 0 | 90 | 180 | 270)}
          title={`Rotate (currently ${rotation}°)`}
          data-testid="button-rotate"
        >
          <RotateCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        <div
          ref={containerRef}
          className="flex-1 overflow-auto bg-muted/30 relative p-3"
          style={{ cursor: drawMode === "pan" ? (panState.current ? "grabbing" : "grab") : undefined }}
          onMouseDown={(e) => {
            if (drawMode !== "pan" || !containerRef.current) return;
            e.preventDefault();
            panState.current = {
              x: e.clientX,
              y: e.clientY,
              left: containerRef.current.scrollLeft,
              top: containerRef.current.scrollTop,
            };
          }}
          onMouseMove={(e) => {
            if (drawMode !== "pan" || !panState.current || !containerRef.current) return;
            const s = panState.current;
            containerRef.current.scrollLeft = s.left - (e.clientX - s.x);
            containerRef.current.scrollTop = s.top - (e.clientY - s.y);
          }}
          onMouseUp={() => { panState.current = null; }}
          onMouseLeave={() => { panState.current = null; }}
        >
          <div
            className="mx-auto bg-white shadow-sm relative"
            style={{
              width: finalRenderWidth,
              transform: `rotate(${rotation}deg)`,
              transformOrigin: "center center",
            }}
          >
            <Document
              file={{ url: plan.objectPath, withCredentials: true }}
              onLoadSuccess={({ numPages }) => setPdfPageCount(numPages)}
              loading={
                <div className="p-8 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading PDF…
                </div>
              }
              error={
                <div className="p-8 text-sm text-destructive">Failed to load PDF</div>
              }
            >
              <Page
                pageNumber={currentPage}
                width={finalRenderWidth}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                onRenderSuccess={(page: any) =>
                  setPageDims({ width: page.width, height: page.height })
                }
              />
            </Document>
            {pageDims && (
              <TakeoffDrawingCanvas
                width={finalRenderWidth}
                height={finalRenderHeight}
                drawMode={drawMode}
                selectedColor={pending?.color ?? "#A890D4"}
                measurements={pageMeasurements}
                highlightedId={highlightedId}
                onAreaComplete={(pts) => finishGeometry(pts, "area")}
                onLinearComplete={(pts) => finishGeometry(pts, "linear")}
                onCountClick={async (p) => {
                  if (!pending) return;
                  await finishGeometry([p], "count");
                }}
                onCalibrateComplete={handleCalibrateComplete}
              />
            )}
          </div>

          {/* Unscaled overlay */}
          {!isScaled && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-card border border-border rounded-md shadow-lg p-5 max-w-sm w-full pointer-events-auto">
                <div className="text-base font-semibold mb-1">Set scale before measuring</div>
                <div className="text-xs text-muted-foreground mb-3">
                  Pick a standard architect's scale, or calibrate against a known dimension on the plan.
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {STANDARD_SCALES.map((r) => (
                    <Button
                      key={r}
                      variant="outline"
                      size="sm"
                      onClick={() => handleStandardScale(r)}
                      data-testid={`button-scale-${r}`}
                    >
                      1:{r}
                    </Button>
                  ))}
                </div>
                <Button
                  variant="default"
                  size="sm"
                  className="w-full"
                  onClick={handleStartCalibration}
                  data-testid="button-calibrate-from-plan"
                >
                  <Ruler className="h-4 w-4 mr-1" /> Calibrate from a plan dimension
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="w-72 flex-shrink-0">
          <TakeoffMeasurementPanel
            projectId={projectId}
            plan={plan}
            measurements={pageMeasurements}
            categories={categories}
            highlightedId={highlightedId}
            onHighlight={setHighlightedId}
            onAddClick={beginCreate}
          />
        </div>
      </div>

      {/* Status bar */}
      <div className="h-8 flex items-center px-3 text-xs bg-[#3d3d3d] text-[#cccccc]">
        <span data-testid="status-message">{statusMessage}</span>
        {pending && (
          <span className="ml-3 opacity-80">
            Drawing: <span className="font-medium">{pending.name}</span> ({pending.measurementType})
          </span>
        )}
      </div>

      <TakeoffCreateMeasurementModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={projectId}
        categories={categories}
        onCreate={handlePending}
      />

      <TakeoffScaleModal
        open={scaleModalOpen}
        onOpenChange={setScaleModalOpen}
        pixelLength={calibrationPxLength}
        onSave={handleSaveCalibration}
      />
    </div>
  );
}

function ToolBtn({
  children,
  active,
  onClick,
  disabled,
  label,
  testId,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
  label: string;
  testId: string;
}) {
  return (
    <Button
      size="sm"
      variant={active ? "secondary" : "ghost"}
      onClick={onClick}
      disabled={disabled}
      title={label}
      data-testid={`button-${testId}`}
    >
      {children}
    </Button>
  );
}

function Divider() {
  return <span className="h-5 w-px bg-border mx-1" />;
}
