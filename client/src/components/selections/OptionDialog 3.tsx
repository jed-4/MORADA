/**
 * The Add/Edit Option dialog — one implementation, used by a project selection
 * and by a selection template.
 *
 * Last of the three pieces these two screens drew twice. SelectionDetail had a
 * 960px two-pane form on react-hook-form with a zod resolver; the template had
 * a 672px single column on a raw `useState` object with no validation at all,
 * so a template option could be saved with a blank name and a unit cost typed
 * as dollars into a field the rest of the app reads as cents.
 *
 * ── What this owns ──────────────────────────────────────────────────────────
 *
 * Everything that is dialog-local, which turned out to be most of it: the form
 * and its schema, the GST ex/inc pill, the cost x qty x markup arithmetic and
 * the three display strings that keep a half-typed "12." from being parsed,
 * the specifications editor, and the three collapsibles. None of that was ever
 * page state — it lived on the page only because the dialog was written inline.
 *
 * ── What the host owns ──────────────────────────────────────────────────────
 *
 * Persistence and media, because the two differ completely:
 *
 *   PROJECT   rows. Images are multipart uploads into option_attachments, and
 *             on a create they have to be staged until the option has an id.
 *   TEMPLATE  a JSON blob. Images are data-URL uploads whose returned URL is
 *             stored as a string in templateData.
 *
 * So the media column is a `mediaPane` slot the host fills, and saving is
 * `onSubmit(values, specifications)`. Trying to share those too is what would
 * put an `isTemplate` branch back in here.
 *
 * Money is CENTS in and out, matching selection_options.unit_cost — the
 * template blob stores cents as well. The display strings are dollars and are
 * converted at the field edge, never in the form value.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ChevronDown, ChevronRight, Loader2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The fields the dialog edits.
 *
 * Deliberately NOT `insertSelectionOptionSchema`: that carries selectionId and
 * sortOrder, which a template option has no concept of, and the host supplies
 * on save anyway. `name` is the only thing genuinely required — everything
 * else is optional on both sides, which is what the template's raw-useState
 * version never enforced.
 */
export const optionDialogSchema = z.object({
  name: z.string().trim().min(1, "An option needs a name"),
  brand: z.string().nullish(),
  sku: z.string().nullish(),
  description: z.string().nullish(),
  notes: z.string().nullish(),
  category: z.string().nullish(),
  subcategory: z.string().nullish(),
  url: z.string().nullish(),
  quantity: z.coerce.number().nonnegative().nullish(),
  unitType: z.string().nullish(),
  /** Cents. */
  unitCost: z.coerce.number().nullish(),
  /** Cents. */
  unitTax: z.coerce.number().nullish(),
  /** Cents. */
  totalCost: z.coerce.number().nullish(),
  markupPercent: z.coerce.number().nullish(),
  gstInclusive: z.boolean().nullish(),
  visibleToClient: z.boolean().nullish(),
});

export type OptionDialogValues = z.infer<typeof optionDialogSchema>;

const EMPTY: OptionDialogValues = {
  name: "",
  brand: "",
  sku: "",
  description: "",
  notes: "",
  category: "",
  subcategory: "",
  url: "",
  quantity: 1,
  unitType: "ea",
  unitCost: undefined,
  unitTax: undefined,
  totalCost: undefined,
  markupPercent: undefined,
  gstInclusive: false,
  visibleToClient: true,
};

export interface OptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit mode when set; the values to start from. */
  initialValues?: Partial<OptionDialogValues> | null;
  initialSpecifications?: Record<string, any> | null;
  mode: "create" | "edit";
  onSubmit: (values: OptionDialogValues, specifications: Record<string, any> | null) => void;
  isSaving?: boolean;
  /** The right-hand column: images, and documents where the host has them. */
  mediaPane?: ReactNode;
  /** Paste-an-image, which only the host knows how to stage. */
  onPaste?: (files: File[]) => void;
  /**
   * "Notes to trades" writes selection_options.notes. A template has no such
   * column and `buildOption` in shared/applyTemplate.ts does not carry notes
   * across, so offering the field on a template would be offering one whose
   * contents vanish the moment the template is applied. Off there.
   */
  showNotes?: boolean;
  /** Wording. A project calls an option a Product; a template calls it an Option. */
  nounSingular?: string;
}

/** GST at 10%, from a cents figure that either includes it or does not. */
function calculateGst(unitCost: number | undefined | null, inclusive: boolean): number {
  if (!unitCost || unitCost <= 0) return 0;
  const rate = 0.1;
  return inclusive ? Math.round((unitCost * rate) / (1 + rate)) : Math.round(unitCost * rate);
}

export function OptionDialog({
  open,
  onOpenChange,
  initialValues,
  initialSpecifications,
  mode,
  onSubmit,
  isSaving = false,
  mediaPane,
  onPaste,
  showNotes = true,
  nounSingular = "Product",
}: OptionDialogProps) {
  const form = useForm<OptionDialogValues>({
    resolver: zodResolver(optionDialogSchema),
    defaultValues: EMPTY,
  });

  const [specs, setSpecs] = useState<Record<string, any>>({});
  const [gstInclusive, setGstInclusive] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [specsOpen, setSpecsOpen] = useState(false);
  const [specPickerOpen, setSpecPickerOpen] = useState(false);

  // Dollars as typed. Kept as strings so a half-entered "12." is not parsed to
  // 12 and written back under the cursor.
  const [unitCostDisplayStr, setUnitCostDisplayStr] = useState("");
  const [totalCostDisplayStr, setTotalCostDisplayStr] = useState("");
  const [markupDisplayStr, setMarkupDisplayStr] = useState("");

  /** Fill the form when the dialog opens, and clear it when it closes. */
  useEffect(() => {
    if (!open) return;
    const v = { ...EMPTY, ...(initialValues ?? {}) };
    form.reset(v);
    setSpecs(initialSpecifications ?? {});
    setGstInclusive(!!v.gstInclusive);
    setUnitCostDisplayStr(v.unitCost != null ? (v.unitCost / 100).toFixed(2) : "");
    setTotalCostDisplayStr(v.totalCost != null ? (v.totalCost / 100).toFixed(2) : "");
    setMarkupDisplayStr(v.markupPercent != null ? String(v.markupPercent) : "");
    setSpecsOpen(!!initialSpecifications && Object.keys(initialSpecifications).length > 0);
    setDescOpen(!!v.description);
    setNotesOpen(!!v.notes);
    setSpecPickerOpen(false);
    // initialValues is a fresh object each render, so it is deliberately not a
    // dependency — only opening the dialog should reset the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const watchedUnitCost = form.watch("unitCost");
  const watchedQuantity = form.watch("quantity");
  const watchedMarkupPercent = form.watch("markupPercent");

  useEffect(() => {
    if (!watchedUnitCost) return;
    const total = Math.round(watchedUnitCost * (watchedQuantity || 1) * (1 + (watchedMarkupPercent || 0) / 100));
    form.setValue("totalCost", total, { shouldDirty: true });
    setTotalCostDisplayStr((total / 100).toFixed(2));
  }, [watchedUnitCost, watchedQuantity, watchedMarkupPercent]);

  const handleGstChange = (inclusive: boolean) => {
    setGstInclusive(inclusive);
    form.setValue("gstInclusive", inclusive);
    const currentUnitCost = form.getValues("unitCost");
    if (currentUnitCost) form.setValue("unitTax", calculateGst(currentUnitCost, inclusive));
  };

  const handleUnitCostChange = (value: number | undefined) => {
    if (value && gstInclusive) {
      form.setValue("unitTax", calculateGst(value, gstInclusive));
    } else if (!gstInclusive) {
      form.setValue("unitTax", value ? calculateGst(value, false) : undefined);
    }
  };

  const submit = (values: OptionDialogValues) => {
    onSubmit(values, Object.keys(specs).length > 0 ? specs : null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[960px] max-h-[95vh] flex flex-col"
        onPaste={(e) => {
          if (!onPaste) return;
          const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
          if (files.length > 0) {
            e.preventDefault();
            onPaste(files);
          }
        }}
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>
            {mode === "edit" ? `Edit ${nounSingular}` : `Add ${nounSingular}`}
          </DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? `Update the ${nounSingular.toLowerCase()} details below.`
              : `Add a new ${nounSingular.toLowerCase()} for clients to choose from.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(submit)} className="pr-2">
              <div className="md:grid md:grid-cols-[minmax(0,1fr)_300px] md:gap-x-6">
              {/* Fields pane — identity and price above the fold */}
              <div className="space-y-4 min-w-0">


              {/* Row 1: Name (full width) */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Option Name</FormLabel>
                    <FormControl>
                      <Input
                        className="h-9"
                        placeholder="e.g., Subway Tile White"
                        {...field}
                        data-testid="input-option-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Row 2: Brand | SKU */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="brand"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Brand</FormLabel>
                      <FormControl>
                        <Input
                          className="h-9"
                          placeholder="e.g., Concept Tile"
                          {...field}
                          value={field.value || ""}
                          data-testid="input-option-brand"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sku"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SKU</FormLabel>
                      <FormControl>
                        <Input
                          className="h-9"
                          placeholder="Product code"
                          {...field}
                          value={field.value || ""}
                          data-testid="input-option-sku"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Key details — the facts trades and clients scan for (stored in
                  specifications; colour/finish/dims promoted per site-team request) */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Key details</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Colour</Label>
                    <Input placeholder="e.g. Matte White"
                      value={specs.colour ?? ""}
                      onChange={(e) => setSpecs((sp) => ({ ...sp, colour: e.target.value || undefined }))}
                      data-testid="input-key-colour" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Finish</Label>
                    <Input placeholder="e.g. Brushed Nickel"
                      value={specs.finish ?? ""}
                      onChange={(e) => setSpecs((sp) => ({ ...sp, finish: e.target.value || undefined }))}
                      data-testid="input-key-finish" />
                  </div>
                  {([
                    ["length", "Length (mm)"],
                    ["width", "Width (mm)"],
                    ["height", "Height (mm)"],
                    ["depth", "Depth (mm)"],
                  ] as const).map(([key, label]) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-xs">{label}</Label>
                      <Input type="number" min="0" 
                        value={specs[key] ?? ""}
                        onChange={(e) => setSpecs((sp) => ({ ...sp, [key]: e.target.value ? parseFloat(e.target.value) : undefined }))}
                        data-testid={`input-key-${key}`} />
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Pricing section: Qty | Unit Type | Unit Cost */}
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Qty</FormLabel>
                      <FormControl>
                        <Input
                          className="h-9"
                          type="number"
                          min="1"
                          {...field}
                          value={field.value ?? 1}
                          onChange={(e) => {
                            field.onChange(parseInt(e.target.value) || 1);
                          }}
                          data-testid="input-option-quantity"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="unitType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "ea"}>
                        <FormControl>
                          <SelectTrigger className="h-9" data-testid="select-option-unit-type">
                            <SelectValue placeholder="Select unit" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="ea">ea</SelectItem>
                          <SelectItem value="m2">m²</SelectItem>
                          <SelectItem value="lm">lm</SelectItem>
                          <SelectItem value="m3">m³</SelectItem>
                          <SelectItem value="hr">hr</SelectItem>
                          <SelectItem value="day">day</SelectItem>
                          <SelectItem value="wk">wk</SelectItem>
                          <SelectItem value="lot">lot</SelectItem>
                          <SelectItem value="allow">allow</SelectItem>
                          <SelectItem value="t">t</SelectItem>
                          <SelectItem value="kg">kg</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="unitCost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-primary font-semibold">Unit Cost</FormLabel>
                      <FormControl>
                        <div className="flex rounded-md border border-primary/40 bg-primary/5 overflow-hidden focus-within:ring-1 focus-within:ring-primary/50">
                          <span className="flex items-center px-3 text-muted-foreground text-sm font-medium border-r border-primary/20 bg-primary/5 select-none">$</span>
                          <Input
                            type="number"
                            placeholder="0.00"
                            step="0.01"
                            min="0"
                            className="border-0 rounded-none bg-transparent text-right font-medium shadow-none focus-visible:ring-0 h-9"
                            value={unitCostDisplayStr}
                            onChange={(e) => {
                              setUnitCostDisplayStr(e.target.value);
                              const centValue = e.target.value !== "" ? Math.round(parseFloat(e.target.value) * 100) : undefined;
                              field.onChange(centValue);
                              handleUnitCostChange(centValue);
                            }}
                            data-testid="input-option-unit-cost"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* GST toggle + Markup + Total */}
              <div className="space-y-4">
                {/* GST pill toggle */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-medium">GST treatment</span>
                  <div className="flex rounded-md border border-border overflow-hidden text-xs">
                    <button
                      type="button"
                      onClick={() => handleGstChange(false)}
                      className={cn(
                        "px-3 py-1.5 font-medium transition-colors",
                        !gstInclusive ? "bg-foreground text-background" : "text-muted-foreground hover-elevate"
                      )}
                      data-testid="button-gst-ex"
                    >
                      Ex. GST
                    </button>
                    <button
                      type="button"
                      onClick={() => handleGstChange(true)}
                      className={cn(
                        "px-3 py-1.5 font-medium transition-colors border-l border-border",
                        gstInclusive ? "bg-foreground text-background" : "text-muted-foreground hover-elevate"
                      )}
                      data-testid="button-gst-inc"
                    >
                      Inc. GST
                    </button>
                  </div>
                </div>

                {/* Markup % */}
                <FormField
                  control={form.control}
                  name="markupPercent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Markup %</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type="number"
                            placeholder="0"
                            min="0"
                            className="pr-8 h-9"
                            value={markupDisplayStr}
                            onChange={(e) => {
                              setMarkupDisplayStr(e.target.value);
                              field.onChange(e.target.value !== "" ? parseInt(e.target.value) : undefined);
                            }}
                            data-testid="input-option-markup"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Total display card */}
                <FormField
                  control={form.control}
                  name="totalCost"
                  render={({ field }) => {
                    const totalCents = watchedUnitCost
                      ? Math.round(watchedUnitCost * (watchedQuantity || 1) * (1 + (watchedMarkupPercent || 0) / 100))
                      : null;
                    const totalIncGst = totalCents !== null
                      ? (gstInclusive ? totalCents : Math.round(totalCents * 1.1))
                      : null;
                    const totalExGst = totalCents !== null
                      ? (gstInclusive ? Math.round(totalCents / 1.1) : totalCents)
                      : null;
                    return (
                      <FormItem>
                        <input type="hidden" {...field} value={field.value ?? ""} />
                        <div
                          className="rounded-md bg-muted/50 border border-border px-4 py-3 space-y-1"
                          data-testid="display-option-total-cost"
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-xs text-muted-foreground uppercase tracking-wide">Total ex. GST</span>
                            <span className="text-sm text-muted-foreground tabular-nums">
                              {totalExGst !== null ? `$${(totalExGst / 100).toFixed(2)}` : "—"}
                            </span>
                          </div>
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total inc. GST</span>
                            <span className="text-lg font-semibold tabular-nums">
                              {totalIncGst !== null ? `$${(totalIncGst / 100).toFixed(2)}` : "—"}
                            </span>
                          </div>
                        </div>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              </div>

              <Separator />

              {/* URL */}
              <FormField
                control={form.control}
                name="url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product URL</FormLabel>
                    <FormControl>
                      <Input
                        className="h-9"
                        type="url"
                        placeholder="https://..."
                        {...field}
                        value={field.value || ""}
                        data-testid="input-option-url"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Visible to Client */}
              <FormField
                control={form.control}
                name="visibleToClient"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <FormLabel className="text-sm font-medium">Visible to client</FormLabel>
                      <p className="text-xs text-muted-foreground mt-0.5">Show this option in the client portal</p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={!!field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-option-visible"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* Description — collapsible; the why, below the facts */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <div className="border rounded-md overflow-hidden">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium hover-elevate bg-muted/40 text-left"
                      onClick={() => setDescOpen((o) => !o)}
                    >
                      <span className="flex items-center gap-2">
                        {descOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        Description
                        {field.value && <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary" />}
                      </span>
                    </button>
                    {descOpen && (
                      <div className="p-3 border-t">
                        <FormControl>
                          <Textarea
                            placeholder="Describe this option..."
                            rows={3}
                            {...field}
                            value={field.value || ""}
                            data-testid="input-option-description"
                          />
                        </FormControl>
                        <FormMessage />
                      </div>
                    )}
                  </div>
                )}
              />

              {/* Specifications */}
              {(() => {
                const FINISH_OPTS = ["Chrome", "Brushed Nickel", "Matte Black", "Brushed Gold", "Brushed Brass", "White", "Black", "Powder Coat", "Custom"];
                const MATERIAL_OPTS = ["Brass", "Stainless Steel", "Ceramic", "Porcelain", "Timber", "Glass", "Acrylic", "Custom"];
                const EXTRA_FIELDS = [
                  { key: "diameter", label: "Diameter (mm)", type: "number" },
                  { key: "weight", label: "Weight (kg)", type: "number" },
                  { key: "colour", label: "Colour", type: "text" },
                  { key: "colourCode", label: "Colour code", type: "text" },
                  { key: "flowRate", label: "Flow rate (L/min)", type: "number" },
                  { key: "spoutHeight", label: "Spout height (mm)", type: "number" },
                  { key: "spoutReach", label: "Spout reach (mm)", type: "number" },
                  { key: "mountingType", label: "Mounting type", type: "text" },
                  { key: "welsRating", label: "WELS rating (1–6)", type: "number" },
                  { key: "thickness", label: "Thickness (mm)", type: "number" },
                  { key: "slipRatingP", label: "Slip rating — Wet", type: "text" },
                  { key: "slipRatingR", label: "Slip rating — Oil", type: "text" },
                  { key: "wattage", label: "Wattage (W)", type: "number" },
                  { key: "lumens", label: "Lumens (lm)", type: "number" },
                  { key: "colourTemp", label: "Colour temperature (K)", type: "number" },
                  { key: "ipRating", label: "IP rating", type: "text" },
                  { key: "dimmable", label: "Dimmable", type: "boolean" },
                  { key: "energyRating", label: "Energy rating (1–10)", type: "number" },
                  { key: "warranty", label: "Warranty (years)", type: "number" },
                  { key: "leadTime", label: "Lead time (weeks)", type: "number" },
                  { key: "fireRating", label: "Fire rating", type: "text" },
                ];
                const setSpec = (key: string, value: any) => setSpecs(s => ({ ...s, [key]: value }));
                const removeSpec = (key: string) => setSpecs(s => { const n = { ...s }; delete n[key]; return n; });
                const activeCount = Object.keys(specs).filter(k => k !== 'custom' && specs[k] !== undefined && specs[k] !== "").length;
                return (
                  <div className="border rounded-md overflow-hidden">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium hover-elevate bg-muted/40 text-left"
                      onClick={() => setSpecsOpen(o => !o)}
                    >
                      <span className="flex items-center gap-2">
                        {specsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        Product Specifications
                        {activeCount > 0 && (
                          <Badge variant="secondary" className="h-4 text-[10px]">{activeCount} set</Badge>
                        )}
                      </span>
                    </button>
                    {specsOpen && (
                      <div className="p-3 space-y-3 border-t">
                        <div className="space-y-1">
                          <Label className="text-xs">Material</Label>
                          <Select value={specs.material ?? ""} onValueChange={v => setSpec("material", v || undefined)}>
                            <SelectTrigger ><SelectValue placeholder="Select..." /></SelectTrigger>
                            <SelectContent>{MATERIAL_OPTS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        {EXTRA_FIELDS.filter(f => {
                          const v = specs[f.key];
                          return v !== undefined && v !== "" && v !== null;
                        }).map(f => (
                          <div key={f.key} className="flex items-center gap-2">
                            <Label className="text-xs w-40 shrink-0">{f.label}</Label>
                            {f.type === "boolean" ? (
                              <Switch checked={!!specs[f.key]} onCheckedChange={checked => setSpec(f.key, checked)} />
                            ) : (
                              <div className="flex-1 flex items-center gap-1">
                                <Input type={f.type === "number" ? "number" : "text"} min="0" className="flex-1"
                                  value={specs[f.key] ?? ""}
                                  onChange={e => setSpec(f.key, f.type === "number" ? (e.target.value ? parseFloat(e.target.value) : undefined) : e.target.value || undefined)} />
                                <button type="button" className="p-1 text-muted-foreground hover:text-foreground" onClick={() => removeSpec(f.key)}>
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                        {((specs.custom || []) as { label: string; value: string }[]).map((c, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <Input className="w-28 shrink-0" placeholder="Label" value={c.label}
                              onChange={e => {
                                const custom = [...((specs.custom || []) as {label:string;value:string}[])];
                                custom[idx] = { ...custom[idx], label: e.target.value };
                                setSpec("custom", custom);
                              }} />
                            <Input className="flex-1" placeholder="Value" value={c.value}
                              onChange={e => {
                                const custom = [...((specs.custom || []) as {label:string;value:string}[])];
                                custom[idx] = { ...custom[idx], value: e.target.value };
                                setSpec("custom", custom);
                              }} />
                            <button type="button" className="p-1 text-muted-foreground hover:text-foreground shrink-0"
                              onClick={() => {
                                const custom = [...((specs.custom || []) as {label:string;value:string}[])];
                                custom.splice(idx, 1);
                                setSpec("custom", custom);
                              }}>
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                        <div className="relative">
                          <button type="button"
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-dashed rounded-md px-2 py-1"
                            onClick={() => setSpecPickerOpen(o => !o)}>
                            <Plus className="h-3 w-3" />
                            Add detail
                          </button>
                          {specPickerOpen && (
                            <div className="absolute bottom-full mb-1 left-0 z-50 bg-popover border rounded-md shadow-md p-2 min-w-52 max-h-64 overflow-y-auto">
                              {EXTRA_FIELDS.filter(f => {
                                const v = specs[f.key];
                                return v === undefined || v === "" || v === null;
                              }).map(f => (
                                <button key={f.key} type="button"
                                  className="w-full text-left text-xs px-2 py-1 rounded hover:bg-accent"
                                  onClick={() => {
                                    setSpec(f.key, f.type === "boolean" ? false : f.type === "number" ? undefined : "");
                                    setSpecPickerOpen(false);
                                  }}>
                                  {f.label}
                                </button>
                              ))}
                              <div className="border-t pt-1 mt-1">
                                <button type="button"
                                  className="w-full text-left text-xs px-2 py-1 rounded hover:bg-accent text-muted-foreground"
                                  onClick={() => {
                                    const custom = [...((specs.custom || []) as {label:string;value:string}[]), { label: "", value: "" }];
                                    setSpec("custom", custom);
                                    setSpecPickerOpen(false);
                                  }}>
                                  + Custom field
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Notes to trades — collapsible. Project only; see showNotes. */}
              {showNotes && (
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <div className="border rounded-md overflow-hidden">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium hover-elevate bg-muted/40 text-left"
                      onClick={() => setNotesOpen(o => !o)}
                    >
                      <span className="flex items-center gap-2">
                        {notesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        Notes to trades
                        {field.value && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber" />}
                      </span>
                    </button>
                    {notesOpen && (
                      <div className="p-3 space-y-2 border-t">
                        <FormControl>
                          <Textarea
                            placeholder="Instructions, warnings, or notes for your trades team…"
                            rows={3}
                            {...field}
                            value={field.value || ""}
                            data-testid="input-option-notes"
                          />
                        </FormControl>
                        {field.value && (
                          <p className="text-xs px-2 py-1 rounded-md bg-status-warning-bg text-status-warning border border-status-warning/30">
                            Visible to your internal team only — not the client.
                          </p>
                        )}
                        <FormMessage />
                      </div>
                    )}
                  </div>
                )}
              />
              )}
              </div>

              {/* Media pane — the host's, because how an image is stored
                  differs entirely between a row and a blob. */}
              <div className="space-y-4 mt-6 md:mt-0">
                {mediaPane}
              </div>
              </div>

              <div className="sticky bottom-0 bg-background flex items-center justify-end space-x-3 py-3 mt-6 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  data-testid="button-cancel-option"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSaving}
                  data-testid="button-save-option"
                >
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  {mode === "edit" ? `Update ${nounSingular}` : `Add ${nounSingular}`}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
