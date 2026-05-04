import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Document, Page, pdfjs } from "react-pdf";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ArrowLeft, Hand, MousePointer2, Ruler,
  ZoomIn, ZoomOut, Maximize2, RotateCw, Loader2,
  Type, Cloud, Brush, Trash2, X, Plus, AlertTriangle,
} from "lucide-react";
import type {
  TakeoffPlan, TakeoffPlanPage, TakeoffMeasurement, TakeoffCategory, TakeoffMarkup,
} from "@shared/schema";
import TakeoffDrawingCanvas, { type DrawMode } from "./TakeoffDrawingCanvas";
import TakeoffScaleModal from "./TakeoffScaleModal";
import TakeoffMeasurementFormModal, {
  type MeasurementFormData, type MeasurementType,
  type FillPattern, type LineType,
} from "./TakeoffMeasurementFormModal";
import TakeoffMeasurementPanel from "./TakeoffMeasurementPanel";
import TakeoffMarkupCanvas, { type MarkupMode } from "./TakeoffMarkupCanvas";
import TakeoffColorPicker, { MARKUP_COLORS } from "./TakeoffColorPicker";
import {
  computeQuantity, defaultUnitForType, pixelsToFractions,
  pointInPolygon, distanceToPolyline, normalizeShapes,
  type Point,
} from "./useTakeoffGeometry";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface Props {
  plan: TakeoffPlan;
  initialPage: number;
  projectId: string;
  onClose: () => void;
}

const STANDARD_SCALES = [50, 75, 100, 200, 500, 1000];

export default function TakeoffPlanViewer({ plan, initialPage, projectId, onClose }: Props) {
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfPageCount, setPdfPageCount] = useState(plan.pageCount || 1);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [openPages, setOpenPages] = useState<number[]>([initialPage]);
  const [pagesPopoverOpen, setPagesPopoverOpen] = useState(false);
  const [scalePopoverOpen, setScalePopoverOpen] = useState(false);

  // If parent navigates to a different starting page (new click from grid),
  // adopt it as the active tab and ensure it's in the open list.
  useEffect(() => {
    setCurrentPage(initialPage);
    setOpenPages((prev) => (prev.includes(initialPage) ? prev : [...prev, initialPage]));
  }, [initialPage]);

  // Switching pages should exit any in-progress drawing.
  useEffect(() => {
    setActiveMeasurementId(null);
    setDrawMode("select");
  }, [currentPage]);

  const openPage = (p: number) => {
    setOpenPages((prev) => (prev.includes(p) ? prev : [...prev, p]));
    setCurrentPage(p);
  };

  const closePage = (p: number) => {
    setOpenPages((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((x) => x !== p);
      if (currentPage === p) {
        const idx = prev.indexOf(p);
        const fallback = next[Math.max(0, idx - 1)] ?? next[0];
        setCurrentPage(fallback);
      }
      return next;
    });
  };
  const [pageDims, setPageDims] = useState<{ width: number; height: number } | null>(null);
  const [pageWidthMm, setPageWidthMm] = useState<number>(420);
  const [zoom, setZoom] = useState(1);
  const [renderWidth, setRenderWidth] = useState(900);
  const [drawMode, setDrawMode] = useState<DrawMode>("select");
  const [markupMode, setMarkupMode] = useState<MarkupMode>(null);
  const [markupColor, setMarkupColor] = useState<string>(MARKUP_COLORS[0]);
  const [brushSize, setBrushSize] = useState<number>(4);
  const [brushOpacity, setBrushOpacity] = useState<number>(1);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingMeasurement, setEditingMeasurement] = useState<TakeoffMeasurement | null>(null);
  const [activeMeasurementId, setActiveMeasurementId] = useState<string | null>(null);
  const [scaleModalOpen, setScaleModalOpen] = useState(false);
  const [calibrationPxLength, setCalibrationPxLength] = useState(0);
  const [statusMessage, setStatusMessage] = useState("Ready");
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [selection, setSelection] = useState<{ id: string; x: number; y: number } | null>(null);
  const [selectedMarkupId, setSelectedMarkupId] = useState<string | null>(null);
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

  const markupsKey = ["/api/projects", projectId, "takeoff/plans", plan.id, "markups", currentPage];
  const { data: markups = [] } = useQuery<TakeoffMarkup[]>({
    queryKey: markupsKey,
    queryFn: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/takeoff/plans/${plan.id}/markups?page=${currentPage}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load markups");
      return res.json();
    },
  });

  const upsertPage = useMutation({
    mutationFn: async (data: Partial<TakeoffPlanPage> & { pageNumber: number }) =>
      apiRequest(`/api/projects/${projectId}/takeoff/plans/${plan.id}/pages`, "POST", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pagesKey }),
    onError: (err: any) =>
      toast({ title: "Failed to save scale", description: err?.message, variant: "destructive" }),
  });

  const createMeasurement = useMutation({
    mutationFn: async (data: Partial<TakeoffMeasurement>) =>
      apiRequest(`/api/projects/${projectId}/takeoff/measurements`, "POST", data),
    onSuccess: () => {
      if (pageMeasurementsKey) queryClient.invalidateQueries({ queryKey: pageMeasurementsKey });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "takeoff/measurements"] });
      toast({ title: "Measurement saved" });
    },
    onError: (err: any) =>
      toast({ title: "Failed to save measurement", description: err?.message, variant: "destructive" }),
  });

  const updateMeasurement = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TakeoffMeasurement> }) =>
      apiRequest(`/api/projects/${projectId}/takeoff/measurements/${id}`, "PATCH", data),
    onSuccess: () => {
      if (pageMeasurementsKey) queryClient.invalidateQueries({ queryKey: pageMeasurementsKey });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "takeoff/measurements"] });
    },
  });

  const deleteMeasurement = useMutation({
    mutationFn: async (id: string) =>
      apiRequest(`/api/projects/${projectId}/takeoff/measurements/${id}`, "DELETE"),
    onSuccess: () => {
      if (pageMeasurementsKey) queryClient.invalidateQueries({ queryKey: pageMeasurementsKey });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "takeoff/measurements"] });
      setSelection(null);
      toast({ title: "Deleted" });
    },
  });

  const createMarkup = useMutation({
    mutationFn: async (data: Partial<TakeoffMarkup>) =>
      apiRequest(`/api/projects/${projectId}/takeoff/plans/${plan.id}/markups`, "POST", {
        ...data,
        pageNumber: currentPage,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: markupsKey }),
  });

  const updateMarkup = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TakeoffMarkup> }) =>
      apiRequest(`/api/projects/${projectId}/takeoff/markups/${id}`, "PATCH", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: markupsKey }),
  });

  const deleteMarkup = useMutation({
    mutationFn: async (id: string) =>
      apiRequest(`/api/projects/${projectId}/takeoff/markups/${id}`, "DELETE"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: markupsKey }),
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
  const finalRenderHeight = pageDims ? (pageDims.height / pageDims.width) * finalRenderWidth : 0;

  const ensurePageRow = async (): Promise<TakeoffPlanPage> => {
    if (currentPageData) return currentPageData;
    return await upsertPage.mutateAsync({ pageNumber: currentPage, isScaled: false });
  };

  const handleStandardScale = async (ratio: number) => {
    await upsertPage.mutateAsync({
      pageNumber: currentPage, isScaled: true, scaleRatio: ratio,
      calibrationPixelLength: null as any, calibrationRealDistance: null as any,
    });
    toast({ title: `Scale set to 1:${ratio}` });
  };

  const handleStartCalibration = async () => {
    await ensurePageRow();
    setMarkupMode(null);
    setActiveMeasurementId(null);
    setDrawMode("calibrate");
    setStatusMessage("Click two points along a known dimension, then double-click to finish");
  };

  const handleCalibrateComplete = (a: Point, b: Point) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    setCalibrationPxLength(Math.sqrt(dx * dx + dy * dy));
    setScaleModalOpen(true);
    setActiveMeasurementId(null);
    setDrawMode("select");
  };

  const handleSaveCalibration = async (data: {
    calibrationPixelLength: number; calibrationRealDistance: number;
    calibrationUnit: "mm" | "cm" | "m";
  }) => {
    const fractionOfWidth =
      finalRenderWidth > 0 ? data.calibrationPixelLength / finalRenderWidth : 0;
    await upsertPage.mutateAsync({
      pageNumber: currentPage, isScaled: true, scaleRatio: null as any,
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
    setMarkupMode(null);
    setCreateOpen(true);
  };

  const activeMeasurement = activeMeasurementId
    ? pageMeasurements.find((m) => m.id === activeMeasurementId) ?? null
    : null;

  const handleFormSubmit = async (data: MeasurementFormData) => {
    if (editingMeasurement) {
      await updateMeasurement.mutateAsync({
        id: editingMeasurement.id,
        data: {
          name: data.name,
          categoryId: data.categoryId,
          color: data.color,
          multiplier: data.multiplier,
          wastePercent: data.wastePercent,
          unit: data.unit === "__blank__" ? "" : data.unit,
          fillPattern: data.fillPattern,
          lineType: data.lineType,
          lineSize: data.lineSize,
        } as any,
      });
      setEditingMeasurement(null);
      setCreateOpen(false);
      setStatusMessage(`Updated ${data.name}`);
      return;
    }

    setCreateOpen(false);
    const page = await ensurePageRow();
    const unitToSave =
      data.unit === "__blank__"
        ? ""
        : data.unit ||
          (data.measurementType === "manual" ? "" : defaultUnitForType(data.measurementType));
    const created = (await createMeasurement.mutateAsync({
      planId: plan.id, pageId: page.id, categoryId: data.categoryId,
      name: data.name, measurementType: data.measurementType, color: data.color,
      geometry: [] as any, quantity: 0,
      unit: unitToSave,
      multiplier: data.multiplier, wastePercent: data.wastePercent,
      fillPattern: data.fillPattern,
      lineType: data.lineType,
      lineSize: data.lineSize,
    } as any)) as TakeoffMeasurement;

    if (data.measurementType === "manual") {
      setStatusMessage("Saved");
      return;
    }
    setMarkupMode(null);
    setActiveMeasurementId(created.id);
    setDrawMode(data.measurementType as DrawMode);
    setStatusMessage(
      data.measurementType === "count"
        ? `Drawing ${data.name} — click to drop markers, click another row or tool to finish`
        : `Drawing ${data.name} — click to add points, double-click to finish`,
    );
  };

  const handleEditMeasurement = (m: TakeoffMeasurement) => {
    setEditingMeasurement(m);
    setCreateOpen(true);
  };

  const handleActivateMeasurement = (m: TakeoffMeasurement) => {
    if (m.measurementType === "manual") {
      toast({ title: "Manual measurements aren't drawn", description: "Edit the quantity directly on the row." });
      return;
    }
    if (activeMeasurementId === m.id) {
      setActiveMeasurementId(null);
      setDrawMode("select");
      setStatusMessage("Ready");
      return;
    }
    if (!isScaled) {
      toast({ title: "Set a scale first", variant: "destructive" });
      return;
    }
    setMarkupMode(null);
    setSelection(null);
    setActiveMeasurementId(m.id);
    setDrawMode(m.measurementType as DrawMode);
    setStatusMessage(
      m.measurementType === "count"
        ? `Drawing ${m.name} — click to drop markers, click another row or tool to finish`
        : `Drawing ${m.name} — click to add points, double-click to finish`,
    );
  };

  const finishGeometry = async (geometryPx: Point[], type: MeasurementType) => {
    const target = activeMeasurement;
    if (!target) return;
    const page = await ensurePageRow();
    const newShapeFractions = pixelsToFractions(geometryPx, finalRenderWidth, finalRenderHeight);

    let nextGeometry: any;
    if (type === "count") {
      // Count stays as a flat Point[] — append.
      const existing = (target.geometry as Point[] | null) ?? [];
      const flat = Array.isArray(existing) && existing.length > 0 ? existing : [];
      nextGeometry = [...flat, ...newShapeFractions];
    } else if (type === "area" || type === "linear") {
      // Area/linear use Point[][] so multiple sub-shapes can be added to one measurement.
      const existingShapes = normalizeShapes(target.geometry);
      nextGeometry = [...existingShapes, newShapeFractions];
    } else {
      nextGeometry = newShapeFractions;
    }

    const { quantity, unit } = computeQuantity(
      nextGeometry, type, page, finalRenderWidth, finalRenderHeight, pageWidthMm,
    );
    await updateMeasurement.mutateAsync({
      id: target.id,
      data: {
        geometry: nextGeometry,
        quantity,
        unit: unit || defaultUnitForType(type),
      } as any,
    });
    if (type === "count") {
      // Stay in count mode for more clicks.
      return;
    }
    // For area/linear: keep the row active so the user can immediately add another sub-shape.
    setStatusMessage(
      `Added shape to ${target.name} — keep drawing or click another row / tool to finish`,
    );
  };

  const formatDimensionLabel = (a: Point, b: Point): string => {
    const page = currentPageData;
    if (!page || !page.isScaled) {
      const px = Math.hypot(b.x - a.x, b.y - a.y);
      return `${Math.round(px)}px`;
    }
    const { quantity, unit } = computeQuantity(
      pixelsToFractions([a, b], finalRenderWidth, finalRenderHeight),
      "dimension", page, finalRenderWidth, finalRenderHeight, pageWidthMm,
    );
    if (!unit) return "—";
    if (unit === "lm") return `${quantity.toFixed(2)} m`;
    return `${quantity} ${unit}`;
  };

  // Hit-testing for the Select tool. Returns the topmost measurement under p (px).
  const hitTest = (p: Point): TakeoffMeasurement | null => {
    const tolerance = 8;
    for (let i = pageMeasurements.length - 1; i >= 0; i--) {
      const m = pageMeasurements[i];
      if (!m.isVisible) continue;
      if (m.measurementType === "count") {
        const geo = (m.geometry as Point[] | null) ?? [];
        if (!Array.isArray(geo) || geo.length === 0) continue;
        for (const pp of geo) {
          const px = { x: pp.x * finalRenderWidth, y: pp.y * finalRenderHeight };
          if (Math.hypot(px.x - p.x, px.y - p.y) <= 8) return m;
        }
        continue;
      }
      const shapes = normalizeShapes(m.geometry);
      for (const shape of shapes) {
        const pts = shape.map((pp) => ({ x: pp.x * finalRenderWidth, y: pp.y * finalRenderHeight }));
        if (m.measurementType === "area" && pts.length >= 3 && pointInPolygon(p, pts)) return m;
        if (m.measurementType === "linear" && pts.length >= 2 && distanceToPolyline(p, pts) <= tolerance) return m;
      }
    }
    return null;
  };

  const handleSelectClick = (e: React.MouseEvent) => {
    if (drawMode !== "select" || markupMode) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const hit = hitTest(p);
    if (hit) {
      setSelection({ id: hit.id, x: e.clientX, y: e.clientY });
      setHighlightedId(hit.id);
      setSelectedMarkupId(null);
    } else {
      setSelection(null);
      setSelectedMarkupId(null);
    }
  };

  const documentFile = useMemo(
    () => ({ url: plan.objectPath, withCredentials: true } as any),
    [plan.objectPath],
  );

  const scaleChip = useMemo(() => {
    if (!isScaled || !currentPageData) return "Not scaled";
    if (currentPageData.scaleRatio) return `1:${currentPageData.scaleRatio}`;
    if (currentPageData.calibrationPixelLength && currentPageData.calibrationRealDistance) {
      return `Calibrated (${currentPageData.calibrationRealDistance} ${currentPageData.calibrationUnit})`;
    }
    return "Scaled";
  }, [isScaled, currentPageData]);

  const selectedMeasurement = selection ? pageMeasurements.find((m) => m.id === selection.id) ?? null : null;

  const setMeasureMode = (mode: DrawMode) => {
    setMarkupMode(null);
    setDrawMode(mode);
    if (mode === "select" || mode === "pan") {
      setActiveMeasurementId(null);
      setStatusMessage("Ready");
    }
  };
  const setMarkup = (mode: MarkupMode) => {
    setDrawMode("select");
    setActiveMeasurementId(null);
    setMarkupMode(mode);
    setStatusMessage(
      mode === "text" ? "Click on the plan to drop a text label" :
      mode === "brush" ? "Click and drag to freehand draw" :
      mode === "cloud" ? "Click to add cloud points — double-click to close" :
      mode === "dimension" ? "Click two points for a dimension line — double-click to finish" :
      "Ready",
    );
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <div className="h-12 flex items-center justify-between px-3 border-b border-border bg-background gap-3">
        <Button variant="ghost" size="sm" onClick={onClose} data-testid="button-close-viewer">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="text-sm font-medium truncate flex-1 text-center">{plan.name}</div>
        <Badge variant={isScaled ? "secondary" : "outline"} data-testid="badge-scale">
          <Ruler className="h-3 w-3 mr-1" /> {scaleChip}
        </Badge>
      </div>

      <div className="h-9 flex items-center gap-1 px-3 border-b border-border overflow-x-auto bg-background">
        {openPages.map((p) => (
          <div
            key={p}
            className={`flex items-center text-xs h-7 rounded-md pl-3 pr-1 gap-1 ${
              currentPage === p
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover-elevate"
            }`}
            data-testid={`tab-page-${p}`}
          >
            <button
              onClick={() => setCurrentPage(p)}
              className="cursor-pointer"
              data-testid={`button-page-${p}`}
            >
              Page {p}
            </button>
            {openPages.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closePage(p);
                }}
                className="ml-1 p-0.5 rounded hover-elevate"
                aria-label={`Close page ${p}`}
                data-testid={`button-close-tab-${p}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        {pdfPageCount > 1 && (
          <Popover open={pagesPopoverOpen} onOpenChange={setPagesPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                data-testid="button-add-page-tab"
              >
                <Plus className="h-3 w-3 mr-1" /> Pages
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-[420px] max-h-[480px] overflow-auto p-3"
            >
              <div className="text-xs text-muted-foreground mb-2">
                Click any page to open it in a new tab
              </div>
              <Document file={documentFile} loading={null} error={null}>
                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: pdfPageCount }, (_, i) => i + 1).map((p) => {
                    const isOpen = openPages.includes(p);
                    return (
                      <button
                        key={p}
                        onClick={() => {
                          openPage(p);
                          setPagesPopoverOpen(false);
                        }}
                        className={`relative border rounded-md p-1 hover-elevate text-left ${
                          isOpen ? "border-primary" : "border-border"
                        }`}
                        data-testid={`thumb-page-${p}`}
                      >
                        <div className="overflow-hidden rounded bg-muted/30 flex items-center justify-center" style={{ height: 140 }}>
                          <Page
                            pageNumber={p}
                            width={120}
                            renderTextLayer={false}
                            renderAnnotationLayer={false}
                          />
                        </div>
                        <div className="text-[11px] mt-1 flex items-center justify-between">
                          <span>Page {p}</span>
                          {isOpen && <span className="text-primary">Open</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Document>
            </PopoverContent>
          </Popover>
        )}
      </div>

      <div className="h-11 flex items-center gap-1 px-3 border-b border-border bg-background">
        <ToolBtn active={drawMode === "select" && !markupMode} onClick={() => setMeasureMode("select")} label="Select" testId="tool-select">
          <MousePointer2 className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn active={drawMode === "pan"} onClick={() => setMeasureMode("pan")} label="Pan" testId="tool-pan">
          <Hand className="h-4 w-4" />
        </ToolBtn>
        <Divider />
        <ToolBtn active={markupMode === "dimension"} onClick={() => setMarkup("dimension")} label="Dimension" testId="tool-dim">
          <Ruler className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn active={markupMode === "cloud"} onClick={() => setMarkup("cloud")} label="Cloud" testId="tool-cloud">
          <Cloud className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn active={markupMode === "text"} onClick={() => setMarkup("text")} label="Text" testId="tool-text">
          <Type className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn active={markupMode === "brush"} onClick={() => setMarkup("brush")} label="Brush" testId="tool-brush">
          <Brush className="h-4 w-4" />
        </ToolBtn>
        <TakeoffColorPicker
          color={markupColor} onChange={setMarkupColor}
          palette={MARKUP_COLORS} testId="markup-color"
        />
        {markupMode === "brush" && (
          <>
            <Divider />
            <div className="flex items-center gap-1.5 text-xs" data-testid="brush-size-control">
              <span className="text-muted-foreground">Size</span>
              <input
                type="range"
                min={1}
                max={20}
                step={1}
                value={brushSize}
                onChange={(e) => setBrushSize(parseInt(e.target.value, 10))}
                className="w-20"
                aria-label="Brush size"
                data-testid="input-brush-size"
              />
              <span className="tabular-nums w-5 text-right">{brushSize}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs" data-testid="brush-opacity-control">
              <span className="text-muted-foreground">Opacity</span>
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                value={Math.round(brushOpacity * 100)}
                onChange={(e) => setBrushOpacity(parseInt(e.target.value, 10) / 100)}
                className="w-20"
                aria-label="Brush opacity"
                data-testid="input-brush-opacity"
              />
              <span className="tabular-nums w-9 text-right">{Math.round(brushOpacity * 100)}%</span>
            </div>
          </>
        )}
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
          size="icon" variant="ghost"
          onClick={() => setRotation((r) => ((r + 90) % 360) as 0 | 90 | 180 | 270)}
          title={`Rotate (currently ${rotation}°)`} data-testid="button-rotate"
        >
          <RotateCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div
          ref={containerRef}
          className="flex-1 overflow-auto bg-muted/30 relative p-3"
          style={{ cursor: drawMode === "pan" ? (panState.current ? "grabbing" : "grab") : undefined }}
          onMouseDown={(e) => {
            if (drawMode !== "pan" || !containerRef.current) return;
            e.preventDefault();
            panState.current = {
              x: e.clientX, y: e.clientY,
              left: containerRef.current.scrollLeft, top: containerRef.current.scrollTop,
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
          {!isScaled && (
            <div
              className="sticky top-0 z-50 -mx-3 -mt-3 mb-3 px-4 py-2 flex items-center gap-3 text-white"
              style={{ backgroundColor: "#DA988A" }}
              data-testid="banner-not-scaled"
            >
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm flex-1">
                This plan is not scaled — select a scale or calibrate before measuring
              </span>
              <Popover open={scalePopoverOpen} onOpenChange={setScalePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-white/15 border-white/40 text-white hover:bg-white/25"
                    data-testid="button-open-set-scale"
                  >
                    <Ruler className="h-4 w-4 mr-1" /> Set Scale
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 p-3">
                  <div className="text-sm font-semibold mb-1">Set scale</div>
                  <div className="text-xs text-muted-foreground mb-3">
                    Pick a standard architect's scale, or calibrate against a known dimension on the plan.
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {STANDARD_SCALES.map((r) => (
                      <Button
                        key={r}
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          await handleStandardScale(r);
                          setScalePopoverOpen(false);
                        }}
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
                    onClick={() => {
                      setScalePopoverOpen(false);
                      handleStartCalibration();
                    }}
                    data-testid="button-calibrate-from-plan"
                  >
                    <Ruler className="h-4 w-4 mr-1" /> Calibrate from a plan dimension
                  </Button>
                </PopoverContent>
              </Popover>
            </div>
          )}
          <div
            className="mx-auto bg-white shadow-sm relative"
            style={{
              width: finalRenderWidth,
              transform: `rotate(${rotation}deg)`,
              transformOrigin: "center center",
            }}
            onClick={handleSelectClick}
          >
            <Document
              file={documentFile}
              onLoadSuccess={({ numPages }) => setPdfPageCount(numPages)}
              loading={
                <div className="p-8 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading PDF…
                </div>
              }
              error={<div className="p-8 text-sm text-destructive">Failed to load PDF</div>}
            >
              <Page
                pageNumber={currentPage}
                width={finalRenderWidth}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                onLoadSuccess={(page: any) => {
                  // page.originalWidth is in PDF points and already accounts for
                  // the page's internal /Rotate so it matches the rendered width.
                  // page.view is the raw, unrotated mediabox; if we have to use
                  // it we must swap width/height for 90/270° rotated pages,
                  // otherwise scaled measurements come out short by sqrt(2)
                  // (e.g. an 18.055m dimension reads as 12.77m).
                  if (typeof page.originalWidth === "number" && page.originalWidth > 0) {
                    setPageWidthMm(page.originalWidth * (25.4 / 72));
                  } else if (Array.isArray(page.view) && page.view.length === 4) {
                    let widthPt = page.view[2] - page.view[0];
                    let heightPt = page.view[3] - page.view[1];
                    const rot = ((page.rotate ?? 0) % 360 + 360) % 360;
                    if (rot === 90 || rot === 270) {
                      const tmp = widthPt;
                      widthPt = heightPt;
                      heightPt = tmp;
                    }
                    setPageWidthMm(widthPt * (25.4 / 72));
                  }
                }}
                onRenderSuccess={(page: any) =>
                  setPageDims({ width: page.width, height: page.height })
                }
              />
            </Document>
            {pageDims && (
              <>
                <TakeoffDrawingCanvas
                  width={finalRenderWidth}
                  height={finalRenderHeight}
                  drawMode={markupMode ? "select" : drawMode}
                  selectedColor={activeMeasurement?.color ?? "#A890D4"}
                  selectedFillPattern={(activeMeasurement?.fillPattern as FillPattern) || "solid"}
                  selectedLineType={(activeMeasurement?.lineType as LineType) || "solid"}
                  selectedLineSize={activeMeasurement?.lineSize ?? 2}
                  measurements={pageMeasurements}
                  highlightedId={highlightedId}
                  onAreaComplete={(pts) => finishGeometry(pts, "area")}
                  onLinearComplete={(pts) => finishGeometry(pts, "linear")}
                  onCountClick={async (p) => {
                    if (!activeMeasurement) return;
                    await finishGeometry([p], "count");
                  }}
                  onCalibrateComplete={handleCalibrateComplete}
                />
                <TakeoffMarkupCanvas
                  width={finalRenderWidth}
                  height={finalRenderHeight}
                  markupMode={markupMode}
                  selectedColor={markupColor}
                  brushSize={brushSize}
                  brushOpacity={brushOpacity}
                  selectMode={drawMode === "select" && !markupMode}
                  selectedMarkupId={selectedMarkupId}
                  onSelectMarkup={setSelectedMarkupId}
                  markups={markups}
                  visible={true}
                  formatDimensionLabel={formatDimensionLabel}
                  onCreate={(d) => createMarkup.mutate(d as any)}
                  onUpdate={(id, data) => updateMarkup.mutate({ id, data })}
                  onDelete={(id) => deleteMarkup.mutate(id)}
                />
              </>
            )}
          </div>

          {selectedMeasurement && selection && (
            <SelectionToolbar
              key={selectedMeasurement.id}
              x={selection.x}
              y={selection.y}
              measurement={selectedMeasurement}
              onClose={() => setSelection(null)}
              onChange={(data) => updateMeasurement.mutate({ id: selectedMeasurement.id, data })}
              onDelete={() => deleteMeasurement.mutate(selectedMeasurement.id)}
            />
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
            onEditClick={handleEditMeasurement}
            activeDrawingId={activeMeasurementId}
            onActivateDrawing={handleActivateMeasurement}
          />
        </div>
      </div>

      <div className="h-8 flex items-center px-3 text-xs bg-[#3d3d3d] text-[#cccccc]">
        <span data-testid="status-message">{statusMessage}</span>
        {activeMeasurement && (
          <span className="ml-3 opacity-80">
            Drawing: <span className="font-medium">{activeMeasurement.name}</span> ({activeMeasurement.measurementType})
          </span>
        )}
        {markupMode && (
          <span className="ml-3 opacity-80">
            Markup: <span className="font-medium">{markupMode}</span>
          </span>
        )}
      </div>

      <TakeoffMeasurementFormModal
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) setEditingMeasurement(null);
        }}
        projectId={projectId}
        categories={categories}
        editing={editingMeasurement}
        onSubmit={handleFormSubmit}
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

function SelectionToolbar({
  x, y, measurement, onClose, onChange, onDelete,
}: {
  x: number; y: number;
  measurement: TakeoffMeasurement;
  onClose: () => void;
  onChange: (data: Partial<TakeoffMeasurement>) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(measurement.name);
  return (
    <div
      className="fixed z-50 bg-card border border-border rounded-md shadow-lg p-2 flex items-center gap-2"
      style={{ left: x + 10, top: y + 10 }}
      data-testid="selection-toolbar"
    >
      <TakeoffColorPicker
        color={measurement.color}
        onChange={(c) => onChange({ color: c } as any)}
        testId={`sel-color-${measurement.id}`}
      />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name !== measurement.name && onChange({ name } as any)}
        className="h-7 w-40 text-xs"
      />
      <span className="text-xs text-muted-foreground tabular-nums">
        {Math.round((measurement.quantity ?? 0) * 100) / 100} {measurement.unit}
      </span>
      <Button size="icon" variant="ghost" onClick={onDelete} aria-label="Delete">
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
      <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

function ToolBtn({
  children, active, onClick, disabled, label, testId,
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
