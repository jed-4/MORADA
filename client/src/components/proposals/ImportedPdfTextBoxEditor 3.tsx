import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Page } from "react-pdf";
import { Loader2, Plus, Trash2, Type } from "lucide-react";
import { PdfDocument } from "@/components/PdfDocument";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ColorPickerPopover } from "@/components/ui/ColorPickerPopover";
import { PROPOSAL_PLACEHOLDER_TOKENS } from "@/components/proposals/pdf/placeholders";
import { MergeFieldEditor } from "@/components/proposals/MergeFieldEditor";
import { parseStampHtml, stampLineHeight, stampPlainText } from "@/components/proposals/pdf/stampRichText";
import {
  newTextBox,
  STAMP_FONT_CSS,
  STAMP_FONT_LABELS,
  type ImportedTextBox,
  type StampFontKey,
  type StampWeight,
} from "@/components/proposals/pdf/importedTextBoxes";

/** Per page. See addBox for why per page and why six. */
const MAX_BOXES_PER_PAGE = 6;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  objectPath: string;
  fileName?: string;
  pageCount: number;
  boxes: ImportedTextBox[];
  onChange: (boxes: ImportedTextBox[]) => void;
}

/**
 * Positions merge fields over an imported design.
 *
 * The page underneath is the real PDF, rendered by pdf.js at whatever width
 * the dialog has. Everything on top is plain CSS positioned in percentages,
 * which is the whole reason the stored coordinates are fractions of the page
 * rather than pixels or points — what is dragged here is literally the number
 * that gets saved, so there is no conversion to get wrong between the two
 * views. stampTextBoxes.ts performs the one conversion into PDF space.
 */
export function ImportedPdfTextBoxEditor({
  open,
  onOpenChange,
  objectPath,
  fileName,
  pageCount,
  boxes,
  onChange,
}: Props) {
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);
  const [frameWidth, setFrameWidth] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  /* Measured on attach by a callback ref, not in an effect keyed on `open`.
     The dialog's content is portalled, so an effect racing its mount saw a
     null ref, left the width at 0, and the page silently fell back to a fixed
     600px that no longer matched the overlay it sat under. A callback ref
     cannot be early: React calls it with the node itself. */
  const frameRef = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;
    setFrameWidth(node.clientWidth);
    const observer = new ResizeObserver(() => setFrameWidth(node.clientWidth));
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  // A page removed from under the editor (a shorter PDF swapped in) must not
  // leave it pointing at a page that no longer exists.
  useEffect(() => {
    if (pageIndex > pageCount - 1) setPageIndex(Math.max(0, pageCount - 1));
  }, [pageCount, pageIndex]);

  const selected = boxes.find((b) => b.id === selectedId) ?? null;
  const onThisPage = boxes.filter((b) => b.page === pageIndex);

  const update = useCallback(
    (id: string, patch: Partial<ImportedTextBox>) => {
      onChange(boxes.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    },
    [boxes, onChange],
  );

  /* The whole sheet has to be visible at once — dragging a box onto a page you
     have to scroll is guesswork — so the page is fitted to the dialog's height
     as well as its width. Until pdf.js reports the real size, A4 portrait is
     the first guess; it corrects on the next render. */
  const aspect = pageSize ? pageSize.height / pageSize.width : Math.SQRT2;
  const canvasWidth = Math.max(120, Math.min(frameWidth || 600, MAX_PAGE_HEIGHT / aspect));
  const canvasHeight = canvasWidth * aspect;
  const scale = pageSize ? canvasWidth / pageSize.width : 1;

  /* One pointer gesture, two jobs. Pointer capture means the drag keeps
     tracking when the cursor leaves the small box — without it, a fast drag
     drops the element the moment the pointer outruns it. */
  const drag = useRef<{
    id: string;
    mode: "move" | "resize";
    startX: number;
    startY: number;
    box: ImportedTextBox;
  } | null>(null);

  const onPointerDown = (e: React.PointerEvent, box: ImportedTextBox, mode: "move" | "resize") => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { id: box.id, mode, startX: e.clientX, startY: e.clientY, box };
    setSelectedId(box.id);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !canvasWidth || !canvasHeight) return;
    const dx = (e.clientX - d.startX) / canvasWidth;
    const dy = (e.clientY - d.startY) / canvasHeight;
    if (d.mode === "move") {
      update(d.id, {
        x: clamp(d.box.x + dx, 0, 0.98),
        y: clamp(d.box.y + dy, 0, 0.98),
      });
    } else {
      update(d.id, { width: clamp(d.box.width + dx, 0.03, 1 - d.box.x) });
    }
  };

  const endDrag = (e: React.PointerEvent) => {
    if (drag.current) (e.target as Element).releasePointerCapture?.(e.pointerId);
    drag.current = null;
  };

  /**
   * A ceiling per page, not per document, because a box belongs to a page and
   * that is the surface you can actually judge as full. Six is enough for what
   * these pages are for — a name, an address, a date, a reference, a contact,
   * and one spare — and a three-page intro still gets eighteen.
   *
   * The limit is here to keep a cover legible, so it is enforced where you feel
   * it: the button goes quiet and says why, rather than letting you add a
   * seventh box that then has to be found and deleted.
   */
  const atPageLimit = onThisPage.length >= MAX_BOXES_PER_PAGE;

  /* The brand colours, as one-click swatches beside the full picker.
     A merge field almost always wants one of two colours — the company's, or
     something that reads on the artwork behind it — and finding a brand hex in
     a palette grid every time is work the app already knows the answer to.
     Read from Settings → Brand Colour, the field a builder can actually find;
     see the note in ProposalBuilder about the column that defaulted to blue. */
  const { data: companySettings } = useQuery<{
    brandColor?: string;
    brandSecondaryColor?: string;
  } | null>({ queryKey: ["/api/company-settings"] });

  const quickColors: Array<{ hex: string; label: string }> = [
    ...(companySettings?.brandColor
      ? [{ hex: companySettings.brandColor, label: "Company primary" }]
      : []),
    ...(companySettings?.brandSecondaryColor
      ? [{ hex: companySettings.brandSecondaryColor, label: "Company secondary" }]
      : []),
    // Artwork is as often dark as light, and neither is in the brand palette.
    { hex: "#FFFFFF", label: "White" },
    { hex: "#000000", label: "Black" },
  ];

  const addBox = () => {
    if (atPageLimit) return;
    const box = newTextBox(pageIndex);
    onChange([...boxes, box]);
    setSelectedId(box.id);
  };

  const removeBox = (id: string) => {
    onChange(boxes.filter((b) => b.id !== id));
    setSelectedId(null);
  };

  /* The field picker inserts at the editor's cursor, so a second field lands
     beside the first rather than at the start. The editor hands us the
     function; the picker is rendered here because it belongs with the box's
     other properties, not inside the toolbar. */
  const insertRef = useRef<((token: string) => void) | null>(null);
  const insertToken = (token: string) => {
    insertRef.current?.(token);
  };

  /* Dragging is fine for placing something roughly; a cover page usually wants
     it aligned to a millimetre. Arrow keys nudge by a tenth of a percent. */
  const onKeyDown = (e: React.KeyboardEvent, box: ImportedTextBox) => {
    const step = e.shiftKey ? 0.01 : 0.001;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      update(box.id, { x: clamp(box.x + move[0], 0, 0.98), y: clamp(box.y + move[1], 0, 0.98) });
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      removeBox(box.id);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl" data-testid="dialog-imported-text-boxes">
        <DialogHeader>
          <DialogTitle>Merge fields on {fileName || "the imported page"}</DialogTitle>
          <DialogDescription>
            Drop a box where the design leaves a gap. Whatever it holds is printed on top of the
            page each time the proposal is built, so one export serves every project.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[1fr_260px]">
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={addBox}
                disabled={atPageLimit}
                title={atPageLimit ? `${MAX_BOXES_PER_PAGE} text boxes per page is the limit` : undefined}
                data-testid="button-add-text-box"
              >
                <Plus className="w-3 h-3 mr-1" /> Add text
              </Button>
              {atPageLimit && (
                <span className="text-xs text-muted-foreground" data-testid="text-box-limit">
                  {MAX_BOXES_PER_PAGE} per page — delete one to add another
                </span>
              )}
              {pageCount > 1 && (
                <div className="flex items-center gap-1 ml-auto">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    disabled={pageIndex === 0}
                    onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                    data-testid="button-text-box-prev-page"
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {pageIndex + 1} of {pageCount}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    disabled={pageIndex >= pageCount - 1}
                    onClick={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
                    data-testid="button-text-box-next-page"
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>

            <div ref={frameRef} className="relative w-full flex justify-center bg-muted/40 rounded-md overflow-hidden">
              <PdfDocument
                file={objectPath}
                loading={
                  <div className="flex items-center justify-center h-64 text-xs text-muted-foreground">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading the page…
                  </div>
                }
                error={
                  <div className="flex items-center justify-center h-64 text-xs text-destructive">
                    That PDF could not be opened.
                  </div>
                }
              >
                <div className="relative" style={{ width: canvasWidth, height: canvasHeight }}>
                  <Page
                    pageNumber={pageIndex + 1}
                    width={canvasWidth}
                    renderAnnotationLayer={false}
                    renderTextLayer={false}
                    onLoadSuccess={(page) => {
                      // getViewport applies /Rotate, so this is the page as the
                      // reader sees it — the same frame the fractions are in.
                      const view = page.getViewport({ scale: 1 });
                      setPageSize({ width: view.width, height: view.height });
                    }}
                  />

                  {/* The overlay only exists once the page's real size is
                      known; drawing boxes before that would place them against
                      a guessed aspect ratio and then jump. */}
                  {pageSize && (
                    <div className="absolute inset-0" onPointerUp={endDrag} onPointerMove={onPointerMove}>
                      {onThisPage.map((box) => {
                        const isSelected = box.id === selectedId;
                        return (
                          <div
                            key={box.id}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => onKeyDown(e, box)}
                            onPointerDown={(e) => onPointerDown(e, box, "move")}
                            onPointerMove={onPointerMove}
                            onPointerUp={endDrag}
                            className={`absolute cursor-move outline-none ${
                              isSelected ? "ring-2 ring-primary" : "ring-1 ring-primary/40 hover:ring-primary/70"
                            }`}
                            style={{
                              left: `${box.x * 100}%`,
                              top: `${box.y * 100}%`,
                              width: `${box.width * 100}%`,
                              lineHeight: box.lineHeight,
                              color: box.color,
                              textAlign: box.align,
                              // Newlines are honoured on both sides: the
                              // textarea keeps them and wrapText splits on them.
                              whiteSpace: "pre-wrap",
                              overflowWrap: "break-word",
                            }}
                            data-testid={`text-box-${box.id}`}
                          >
                            {/* Rendered from the SAME parse the stamper uses,
                                not from the HTML directly. The overlay's only
                                job is to promise that what you drag is what
                                prints, and two renderers reading the markup
                                their own way is how that promise breaks. */}
                            {renderRuns(box, scale)}
                            {isSelected && (
                              <span
                                onPointerDown={(e) => onPointerDown(e, box, "resize")}
                                onPointerMove={onPointerMove}
                                onPointerUp={endDrag}
                                className="absolute -right-1 top-0 h-full w-2 cursor-ew-resize bg-primary/20"
                                data-testid={`text-box-resize-${box.id}`}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </PdfDocument>
            </div>
          </div>

          <div className="space-y-3">
            {/* The page's boxes, listed.
                They used to be reachable only by clicking them on the page, so
                a PDF that failed to render — a moved object, a dead path, a
                slow network — left you told there were six merge fields with no
                way to reach any of them. The list does not depend on the page
                drawing, and it also makes the six-per-page ceiling something
                you can see rather than only bump into. */}
            {onThisPage.length > 0 && (
              <div className="rounded-md border divide-y" data-testid="text-box-list">
                {onThisPage.map((box, i) => (
                  <button
                    key={box.id}
                    type="button"
                    onClick={() => setSelectedId(box.id)}
                    className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover-elevate ${
                      box.id === selectedId ? "bg-primary/10 text-foreground" : "text-muted-foreground"
                    }`}
                    data-testid={`button-select-text-box-${i}`}
                  >
                    <Type className="w-3 h-3 flex-shrink-0 opacity-60" />
                    <span className="truncate">
                      {stampPlainText(box.html ?? box.text).trim() || "Empty box"}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {!selected ? (
              /* Says what to do, not just what is missing.
                 A box is edited by selecting it, and nothing on screen said so
                 — you had to guess that the thing on the page was clickable. */
              <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground space-y-2">
                <Type className="w-4 h-4 mx-auto opacity-60" />
                {onThisPage.length === 0 ? (
                  <ol className="space-y-1 list-decimal pl-4 text-left">
                    <li><span className="font-medium text-foreground">Add text</span> drops a box on the page.</li>
                    <li>Drag it over the gap in your design, or nudge it with the arrow keys.</li>
                    <li>Click it — here or on the page — to write in it and set its font, size and colour.</li>
                    <li>Use <span className="font-medium text-foreground">Insert a field</span> for anything that changes per proposal, like the client&apos;s name.</li>
                  </ol>
                ) : (
                  <p className="text-center">
                    Click a box — in the list above or on the page — to write in it and set its style.
                  </p>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Text</Label>
                  <MergeFieldEditor
                    key={selected.id}
                    html={selected.html ?? escapeToHtml(selected.text)}
                    boxFont={selected.font}
                    boxSize={selected.fontSize}
                    registerInsert={(fn) => { insertRef.current = fn; }}
                    onChange={(html) =>
                      /* Both are stored: `html` is what prints, `text` is the
                         plain mirror everything else reads to decide whether
                         the box is empty. Letting them drift means a box that
                         looks blank still reserves space on the page. */
                      update(selected.id, { html, text: stampPlainText(html) })
                    }
                  />
                  <Select value="" onValueChange={insertToken}>
                    <SelectTrigger className="h-7 text-xs" data-testid="select-text-box-field">
                      <SelectValue placeholder="Insert a field…" />
                    </SelectTrigger>
                    <SelectContent>
                      {PROPOSAL_PLACEHOLDER_TOKENS.map((t) => (
                        <SelectItem key={t.token} value={t.token} className="text-xs">
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Font</Label>
                    <Select
                      value={selected.font}
                      onValueChange={(v) => update(selected.id, { font: v as StampFontKey })}
                    >
                      <SelectTrigger className="h-8 text-xs" data-testid="select-text-box-font">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(STAMP_FONT_LABELS) as StampFontKey[]).map((key) => (
                          <SelectItem key={key} value={key} className="text-xs">
                            {STAMP_FONT_LABELS[key]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Size</Label>
                    <Input
                      type="number"
                      min={4}
                      max={200}
                      value={selected.fontSize}
                      onChange={(e) => update(selected.id, { fontSize: Number(e.target.value) || 12 })}
                      className="h-8 text-xs"
                      data-testid="input-text-box-size"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Weight</Label>
                    <Select
                      value={String(selected.weight)}
                      onValueChange={(v) => update(selected.id, { weight: Number(v) as StampWeight })}
                    >
                      <SelectTrigger className="h-8 text-xs" data-testid="select-text-box-weight">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="400" className="text-xs">Regular</SelectItem>
                        <SelectItem value="600" className="text-xs">Medium</SelectItem>
                        <SelectItem value="700" className="text-xs">Bold</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Colour</Label>
                    <div className="flex items-center gap-1">
                      {quickColors.map((c) => (
                        <button
                          key={c.hex}
                          type="button"
                          title={`${c.label} — ${c.hex.toUpperCase()}`}
                          aria-label={c.label}
                          onClick={() => update(selected.id, { color: c.hex })}
                          className={`h-5 w-5 rounded-full border hover-elevate active-elevate-2 ${
                            (selected.color || "").toUpperCase() === c.hex.toUpperCase()
                              ? "ring-2 ring-primary ring-offset-1 border-transparent"
                              // A white swatch on a light panel needs a
                              // border you can actually see.
                              : "border-black/25"
                          }`}
                          style={{ backgroundColor: c.hex }}
                          data-testid={`button-quick-color-${c.hex.replace("#", "")}`}
                        />
                      ))}
                    </div>
                    <ColorPickerPopover
                      value={selected.color}
                      onChange={(hex) => update(selected.id, { color: hex })}
                      data-testid="button-text-box-color"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Alignment</Label>
                  <ToggleGroup
                    type="single"
                    size="sm"
                    value={selected.align}
                    onValueChange={(v) => v && update(selected.id, { align: v as ImportedTextBox["align"] })}
                    className="justify-start"
                  >
                    <ToggleGroupItem value="left" className="h-7 px-2 text-xs">Left</ToggleGroupItem>
                    <ToggleGroupItem value="center" className="h-7 px-2 text-xs">Centre</ToggleGroupItem>
                    <ToggleGroupItem value="right" className="h-7 px-2 text-xs">Right</ToggleGroupItem>
                  </ToggleGroup>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={selected.italic ? "default" : "outline"}
                    className="h-7 text-xs italic"
                    onClick={() => update(selected.id, { italic: !selected.italic })}
                    data-testid="button-text-box-italic"
                  >
                    Italic
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-destructive ml-auto"
                    onClick={() => removeBox(selected.id)}
                    data-testid="button-delete-text-box"
                  >
                    <Trash2 className="w-3 h-3 mr-1" /> Delete
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  Drag to move, or use the arrow keys for a finer nudge — hold Shift for bigger steps.
                </p>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Tallest the page may render, leaving the dialog's chrome its own room. */
const MAX_PAGE_HEIGHT = 520;

/**
 * The box's runs, for the overlay.
 *
 * Sizes are multiplied by the page's render scale so the on-screen text is the
 * same proportion of the page that it will be in the PDF. A run with no size
 * of its own inherits the box's, exactly as layoutRichBox resolves it.
 */
function renderRuns(box: ImportedTextBox, scale: number) {
  const lines = parseStampHtml(box.html && box.html.trim() ? box.html : box.text);
  if (lines.length === 0) return <span className="opacity-50">Empty</span>;
  return lines.map((line, i) => (
    <div
      key={i}
      style={{
        /* The SAME rule the stamper uses, scaled to the rendered page — see
           stampLineHeight. Sizing these by the box rather than by the line's
           own runs is what made the editor and the PDF disagree. */
        height: stampLineHeight(line, box.fontSize, box.lineHeight) * scale,
        lineHeight: `${stampLineHeight(line, box.fontSize, box.lineHeight) * scale}px`,
      }}
    >
      {line.map((run, j) => (
        <span
          key={j}
          style={{
            fontFamily: STAMP_FONT_CSS[run.font ?? box.font],
            fontSize: (run.size ?? box.fontSize) * scale,
            fontWeight: run.bold ? 700 : box.weight,
            fontStyle: (run.italic ?? box.italic) ? "italic" : "normal",
            textDecoration: run.underline ? "underline" : "none",
          }}
        >
          {run.text}
        </span>
      ))}
    </div>
  ));
}

/**
 * A pre-rich-text box, as HTML.
 *
 * Boxes authored before this existed hold plain text with real newlines. Handed
 * to the editor raw, the newlines would collapse and a three-line address would
 * come back as one. Escaped so a stray "<" in an address is text, not markup.
 */
function escapeToHtml(text: string): string {
  if (!text) return '';
  return text
    .split(/\r?\n/)
    .map((line) => `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
    .join('');
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
