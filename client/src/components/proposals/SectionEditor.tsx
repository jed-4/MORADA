import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { RichTextEditor } from "@/components/RichTextEditor";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PROPOSAL_PLACEHOLDER_TOKENS } from "./pdf/placeholders";
import type { ProposalSection, Estimate, Project, Contact } from "@shared/schema";
import {
  resolveSectionTextStyle,
  TEXT_ALIGN_OPTIONS,
  TEXT_SIZE_OPTIONS,
  TEXT_FONT_OPTIONS,
  type SectionTextStyle,
} from "./pdf/sectionTextStyle";

// Convert HTML -> plain text for the legacy description column. Mirrors the
// approach used by SortableSectionItem in ProposalBuilder.
function htmlToPlainText(html: string): string {
  if (!html) return "";
  if (typeof document === "undefined") return html.replace(/<[^>]+>/g, "").trim();
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || div.innerText || "").trim();
}

interface SectionEditorProps {
  section: ProposalSection | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (sectionId: string, updates: Partial<ProposalSection>) => void;
  isSaving?: boolean;
  projectId?: string;
  project?: Project;
  client?: Contact;
}

const SECTION_TYPE_LABELS: Record<string, string> = {
  cover_page: "Cover Page",
  cover_letter: "Cover Letter",
  scope: "Scope of Work",
  estimate: "Estimate",
  summary: "Summary",
  allowances: "Allowances",
  inclusions_exclusions: "Inclusions & Exclusions",
  payment_schedule: "Payment Schedule",
  closing: "Closing",
  closing_letter: "Closing Letter",
  attachments: "Attachments",
  terms_conditions: "Terms & Conditions",
  signature: "Signature",
  custom: "Custom Section",
};

export function SectionEditor({ section, isOpen, onClose, onSave, isSaving, projectId, project, client }: SectionEditorProps) {
  const [name, setName] = useState("");
  const [descriptionHtml, setDescriptionHtml] = useState("");
  const [content, setContent] = useState<Record<string, any>>({});

  useEffect(() => {
    if (section) {
      setName(section.name);
      // Prefer the rich-text descriptionHtml when present; fall back to the
      // plain description for legacy sections.
      const html = (section as ProposalSection & { descriptionHtml?: string | null }).descriptionHtml;
      setDescriptionHtml(html || section.description || "");
      setContent(section.content || {});
    } else {
      setName("");
      setDescriptionHtml("");
      setContent({});
    }
  }, [section]);

  const handleSave = () => {
    if (!section) return;
    onSave(section.id, {
      name,
      description: htmlToPlainText(descriptionHtml),
      descriptionHtml,
      content,
    } as Partial<ProposalSection>);
  };

  if (!section) return null;

  const sectionTypeLabel = SECTION_TYPE_LABELS[section.sectionType || "custom"] || "Section";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {sectionTypeLabel}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="section-name">Section Name</Label>
            <Input
              id="section-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter section name"
              data-testid="input-section-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="section-description">Description</Label>
            <RichTextEditor
              content={descriptionHtml}
              onChange={(html) => setDescriptionHtml(html)}
              placeholder="Optional description"
              placeholders={PROPOSAL_PLACEHOLDER_TOKENS}
            />
          </div>

          {/* Section-specific content editors */}
          {section.sectionType === "cover_letter" && (
            <div className="space-y-2">
              <Label>Letter Content</Label>
              <RichTextEditor
                content={content.letterText || ""}
                onChange={(html) => setContent({ ...content, letterText: html })}
                placeholder="Enter your cover letter text..."
                placeholders={PROPOSAL_PLACEHOLDER_TOKENS}
              />
            </div>
          )}

          {section.sectionType === "scope" && (
            <div className="space-y-2">
              <Label>Scope of Work</Label>
              <RichTextEditor
                content={content.scopeText || ""}
                onChange={(html) => setContent({ ...content, scopeText: html })}
                placeholder="Describe the scope of work..."
                placeholders={PROPOSAL_PLACEHOLDER_TOKENS}
              />
            </div>
          )}

          {(section.sectionType === "closing_letter" || section.sectionType === "closing") && (
            <div className="space-y-2">
              <Label>Closing Content</Label>
              <RichTextEditor
                content={content.closingText || ""}
                onChange={(html) => setContent({ ...content, closingText: html })}
                placeholder="Enter your closing text..."
                placeholders={PROPOSAL_PLACEHOLDER_TOKENS}
              />
            </div>
          )}

          {section.sectionType === "summary" && (
            <div className="space-y-2">
              <Label>Summary Content</Label>
              <RichTextEditor
                content={content.summaryText || ""}
                onChange={(html) => setContent({ ...content, summaryText: html })}
                placeholder="Enter project summary..."
                placeholders={PROPOSAL_PLACEHOLDER_TOKENS}
              />
            </div>
          )}

          {section.sectionType === "inclusions_exclusions" && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Inclusions</Label>
                <RichTextEditor
                  content={content.inclusionsText || ""}
                  onChange={(html) => setContent({ ...content, inclusionsText: html })}
                  placeholder="What is included..."
                  placeholders={PROPOSAL_PLACEHOLDER_TOKENS}
                />
              </div>
              <div className="space-y-2">
                <Label>Exclusions</Label>
                <RichTextEditor
                  content={content.exclusionsText || ""}
                  onChange={(html) => setContent({ ...content, exclusionsText: html })}
                  placeholder="What is excluded..."
                  placeholders={PROPOSAL_PLACEHOLDER_TOKENS}
                />
              </div>
            </div>
          )}

          {section.sectionType === "terms_conditions" && (
            <div className="space-y-2">
              <Label>Terms &amp; Conditions</Label>
              <RichTextEditor
                content={content.termsText || ""}
                onChange={(html) => setContent({ ...content, termsText: html })}
                placeholder="Enter terms and conditions..."
                placeholders={PROPOSAL_PLACEHOLDER_TOKENS}
              />
            </div>
          )}

          {section.sectionType === "custom" && (
            <div className="space-y-2">
              <Label>Content</Label>
              <RichTextEditor
                content={content.customText || ""}
                onChange={(html) => setContent({ ...content, customText: html })}
                placeholder="Enter section content..."
                placeholders={PROPOSAL_PLACEHOLDER_TOKENS}
              />
            </div>
          )}

          {section.sectionType === "estimate" && <EstimateEditor content={content} setContent={setContent} />}

          {section.sectionType === "attachments" && (
            <AttachmentsEditor content={content} setContent={setContent} />
          )}

          {section.sectionType === "cover_page" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="project-title">Project Title</Label>
                <Input
                  id="project-title"
                  value={content.projectTitle || ""}
                  onChange={(e) => setContent({ ...content, projectTitle: e.target.value })}
                  placeholder={project?.name || "Enter project title"}
                  data-testid="input-project-title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-name">Client Name</Label>
                <Input
                  id="client-name"
                  value={content.clientName || ""}
                  onChange={(e) => setContent({ ...content, clientName: e.target.value })}
                  placeholder={client?.name || "Enter client name"}
                  data-testid="input-client-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subtitle">Subtitle</Label>
                <Input
                  id="subtitle"
                  value={content.subtitle || ""}
                  onChange={(e) => setContent({ ...content, subtitle: e.target.value })}
                  placeholder="Optional subtitle"
                  data-testid="input-subtitle"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
            data-testid="button-cancel-section"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            data-testid="button-save-section"
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface AttachmentRow {
  name?: string;
  url?: string;
  type?: string;
}

interface AttachmentsEditorProps {
  content: Record<string, any>;
  setContent: (content: Record<string, any>) => void;
}

function AttachmentsEditor({ content, setContent }: AttachmentsEditorProps) {
  const rows: AttachmentRow[] = Array.isArray(content.attachments) ? content.attachments : [];
  const updateRow = (idx: number, patch: Partial<AttachmentRow>) => {
    const next = rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    setContent({ ...content, attachments: next });
  };
  const addRow = () => setContent({ ...content, attachments: [...rows, { name: "", url: "", type: "" }] });
  const removeRow = (idx: number) => setContent({ ...content, attachments: rows.filter((_, i) => i !== idx) });

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Intro Text</Label>
        <RichTextEditor
          content={content.attachmentsText || ""}
          onChange={(html) => setContent({ ...content, attachmentsText: html })}
          placeholder="Optional text shown above the attachment list..."
          placeholders={PROPOSAL_PLACEHOLDER_TOKENS}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>Attachment Links</Label>
          <Button size="sm" variant="outline" onClick={addRow} data-testid="button-add-attachment">
            <Plus className="w-3 h-3 mr-1" /> Add
          </Button>
        </div>
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No attachments. Add a link to a file (e.g. plan, spec, brochure).</p>
        ) : (
          <div className="space-y-2">
            {rows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-start" data-testid={`row-attachment-${idx}`}>
                <Input
                  className="col-span-4"
                  placeholder="Name"
                  value={row.name || ""}
                  onChange={(e) => updateRow(idx, { name: e.target.value })}
                  data-testid={`input-attachment-name-${idx}`}
                />
                <Input
                  className="col-span-2"
                  placeholder="Type (PDF, JPG…)"
                  value={row.type || ""}
                  onChange={(e) => updateRow(idx, { type: e.target.value })}
                  data-testid={`input-attachment-type-${idx}`}
                />
                <Input
                  className="col-span-5"
                  placeholder="https://…"
                  value={row.url || ""}
                  onChange={(e) => updateRow(idx, { url: e.target.value })}
                  data-testid={`input-attachment-url-${idx}`}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removeRow(idx)}
                  className="col-span-1"
                  data-testid={`button-remove-attachment-${idx}`}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export interface EstimateEditorProps {
  content: Record<string, any>;
  setContent: (content: Record<string, any>) => void;
}

export function EstimateEditor({ content, setContent }: EstimateEditorProps) {
  const toggles = content.columnToggles || {
    description: true,
    quantity: false,
    unitCostExTax: false,
    unitCostIncTax: false,
    markup: false,
    amountExTax: false,
    amountIncTax: false,
    showSubtotals: true,
    showZeroLines: false,
    showColumnHeader: true,
    showAllowanceType: true,
  };

  /**
   * Column visibility has two storage shapes: `visibleColumns`, an array, and
   * `columnToggles`, an object — and EstimateSection reads the array in
   * PREFERENCE to the object. A proposal that had ever been through the Layout
   * tab's old column checkboxes carried an array, so these switches wrote the
   * object and the PDF ignored them. Writing both keeps the two in step
   * whichever one a given proposal happens to hold.
   */
  const COLUMN_KEYS = [
    'description', 'quantity', 'unit', 'unitCostExTax',
    'unitCostIncTax', 'markup', 'amountExTax', 'amountIncTax',
  ];

  const updateToggle = (key: string, value: boolean) => {
    const nextToggles = { ...toggles, [key]: value };
    const next: Record<string, any> = { ...content, columnToggles: nextToggles };
    if (COLUMN_KEYS.includes(key) || Array.isArray(content.visibleColumns)) {
      next.visibleColumns = COLUMN_KEYS.filter((k) => nextToggles[k]);
    }
    setContent(next);
  };

  return (
    <div className="space-y-4" data-testid="estimate-editor">
      {/* The estimate is chosen once, in the proposal's Details card, and
          cascaded to every estimate section. A second picker here could point
          a section at a different revision from the one the proposal is
          linked to, so the printed table and the proposal total disagreed. */}
      <div className="space-y-2">
        {/* The only prose on this section. It used to sit below a generic
            "Intro text" field that rendered a few millimetres higher on the
            same page — two editors, two formats, one paragraph's worth of
            purpose. The generic one is hidden for this type now. */}
        <Label htmlFor="estimate-description">Text above the estimate table</Label>
        <RichTextEditor
          content={content.estimateDescriptionHtml || content.estimateDescription || ""}
          onChange={(html) =>
            setContent({
              ...content,
              estimateDescriptionHtml: html,
              estimateDescription: htmlToPlainText(html),
            })
          }
          placeholder="Optional description to show above the estimate"
          placeholders={PROPOSAL_PLACEHOLDER_TOKENS}
        />
      </div>

      <div className="space-y-3 border rounded-md p-4">
        <h4 className="font-semibold text-sm">Column Visibility</h4>
        
        <div className="flex items-center justify-between">
          <Label htmlFor="toggle-description" className="cursor-pointer">Description</Label>
          <Switch
            id="toggle-description"
            checked={toggles.description}
            onCheckedChange={(checked) => updateToggle("description", checked)}
            data-testid="toggle-description"
          />
        </div>

        {toggles.description && (
          <div className="flex items-center justify-between pl-4">
            <div className="space-y-0.5">
              <Label htmlFor="toggle-descriptionUnderName" className="cursor-pointer text-xs">
                Under the item name
              </Label>
              <p className="text-xs text-muted-foreground">Off puts it in its own column</p>
            </div>
            <Switch
              id="toggle-descriptionUnderName"
              checked={toggles.descriptionUnderName !== false}
              onCheckedChange={(checked) => updateToggle("descriptionUnderName", checked)}
              data-testid="toggle-descriptionUnderName"
            />
          </div>
        )}

        <div className="flex items-center justify-between">
          <Label htmlFor="toggle-quantity" className="cursor-pointer">Quantity</Label>
          <Switch
            id="toggle-quantity"
            checked={toggles.quantity}
            onCheckedChange={(checked) => updateToggle("quantity", checked)}
            data-testid="toggle-quantity"
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="toggle-unitCostExTax" className="cursor-pointer">Unit Cost (ex. tax)</Label>
          <Switch
            id="toggle-unitCostExTax"
            checked={toggles.unitCostExTax}
            onCheckedChange={(checked) => updateToggle("unitCostExTax", checked)}
            data-testid="toggle-unitCostExTax"
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="toggle-unitCostIncTax" className="cursor-pointer">Unit Cost (inc. tax)</Label>
          <Switch
            id="toggle-unitCostIncTax"
            checked={toggles.unitCostIncTax}
            onCheckedChange={(checked) => updateToggle("unitCostIncTax", checked)}
            data-testid="toggle-unitCostIncTax"
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="toggle-markup" className="cursor-pointer">Markup %</Label>
          <Switch
            id="toggle-markup"
            checked={toggles.markup}
            onCheckedChange={(checked) => updateToggle("markup", checked)}
            data-testid="toggle-markup"
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="toggle-amountExTax" className="cursor-pointer">Amount (ex. tax)</Label>
          <Switch
            id="toggle-amountExTax"
            checked={toggles.amountExTax}
            onCheckedChange={(checked) => updateToggle("amountExTax", checked)}
            data-testid="toggle-amountExTax"
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="toggle-amountIncTax" className="cursor-pointer">Amount (inc. tax)</Label>
          <Switch
            id="toggle-amountIncTax"
            checked={toggles.amountIncTax}
            onCheckedChange={(checked) => updateToggle("amountIncTax", checked)}
            data-testid="toggle-amountIncTax"
          />
        </div>

        <div className="border-t pt-3 mt-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="toggle-showSubtotals" className="cursor-pointer">Show subtotals</Label>
              <p className="text-xs text-muted-foreground">One per top-level group, covering everything in it</p>
            </div>
            <Switch
              id="toggle-showSubtotals"
              checked={toggles.showSubtotals}
              onCheckedChange={(checked) => updateToggle("showSubtotals", checked)}
              data-testid="toggle-showSubtotals"
            />
          </div>

          {/* Which figure the subtotal shows used to be inferred from the
              amount columns, so turning those off still printed an inc-tax
              subtotal under lines with no prices on them. */}
          {toggles.showSubtotals !== false && (
            <div className="space-y-1.5">
              <Label htmlFor="select-subtotal-basis" className="text-xs">Subtotal shows</Label>
              <Select
                value={content.subtotalBasis || "inc"}
                onValueChange={(v) => setContent({ ...content, subtotalBasis: v })}
              >
                <SelectTrigger id="select-subtotal-basis" className="h-7 text-xs" data-testid="select-subtotal-basis">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inc" className="text-xs">Inc GST</SelectItem>
                  <SelectItem value="ex" className="text-xs">Ex GST</SelectItem>
                  <SelectItem value="both" className="text-xs">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label htmlFor="toggle-showZeroLines" className="cursor-pointer">Show $0 lines</Label>
            <Switch
              id="toggle-showZeroLines"
              checked={toggles.showZeroLines}
              onCheckedChange={(checked) => updateToggle("showZeroLines", checked)}
              data-testid="toggle-showZeroLines"
            />
          </div>

          {/* With only a name column on, the Item/Description header is a
              caption for something obvious, repeated above every group. */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="toggle-showColumnHeader" className="cursor-pointer">Column header row</Label>
              <p className="text-xs text-muted-foreground">Repeats above each group</p>
            </div>
            <Switch
              id="toggle-showColumnHeader"
              checked={toggles.showColumnHeader !== false}
              onCheckedChange={(checked) => updateToggle("showColumnHeader", checked)}
              data-testid="toggle-showColumnHeader"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="toggle-showAllowanceType" className="cursor-pointer">Mark PC / PS lines</Label>
              <p className="text-xs text-muted-foreground">
                Tags prime cost and provisional sum lines, with a key below the table
              </p>
            </div>
            <Switch
              id="toggle-showAllowanceType"
              checked={toggles.showAllowanceType !== false}
              onCheckedChange={(checked) => updateToggle("showAllowanceType", checked)}
              data-testid="toggle-showAllowanceType"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Allowances ───────────────────────────────────────────────────────────
 *
 * The same column switches the estimate has, over the allowance table's own
 * columns. Allowances are an estimate table in miniature — the reason to hide
 * unit costs on one is the reason to hide them on the other — so the control
 * should not be a different shape here.
 */

const ALLOWANCE_COLUMNS: Array<{ key: string; label: string; hint?: string }> = [
  { key: 'allowanceType', label: 'Prime Cost / Provisional Sum chip' },
  { key: 'quantity', label: 'Qty' },
  { key: 'unit', label: 'Unit' },
  { key: 'unitCostExTax', label: 'Unit cost (ex GST)' },
  { key: 'unitCostIncTax', label: 'Unit cost (inc GST)' },
  { key: 'amountExTax', label: 'Amount (ex GST)' },
  { key: 'amountIncTax', label: 'Amount (inc GST)' },
  /* The toggle KEY stays `notes` — it is already stored in saved sections and
     templates, and renaming it would silently orphan every toggle a user has
     set. Only the label changes, to say what the row actually prints. */
  {
    key: 'notes',
    label: 'Description',
    hint: "The estimate line's description. Printed under the item, and only when there is one",
  },
];

const ALLOWANCE_DEFAULTS: Record<string, boolean> = {
  allowanceType: true,
  quantity: true,
  unit: true,
  unitCostExTax: true,
  unitCostIncTax: true,
  amountExTax: false,
  amountIncTax: false,
  notes: true,
};

export function AllowanceColumnsEditor({
  content,
  setContent,
}: {
  content: Record<string, any>;
  setContent: (content: Record<string, any>) => void;
}) {
  const toggles: Record<string, boolean> = { ...ALLOWANCE_DEFAULTS, ...(content.columnToggles ?? {}) };

  return (
    <div className="space-y-2" data-testid="allowance-columns-editor">
      <Label>Columns</Label>
      <div className="space-y-1.5">
        {ALLOWANCE_COLUMNS.map((col) => (
          <div key={col.key} className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs">{col.label}</p>
              {col.hint && <p className="text-xs text-muted-foreground">{col.hint}</p>}
            </div>
            <Switch
              checked={toggles[col.key] !== false}
              onCheckedChange={(v) =>
                setContent({ ...content, columnToggles: { ...toggles, [col.key]: v } })
              }
              data-testid={`switch-allowance-${col.key}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Text style ───────────────────────────────────────────────────────── */

/**
 * Alignment, size and typeface for one section's prose.
 *
 * Every section drew its text at a size and alignment chosen in the component
 * and unreachable from the app — the closing section was 14pt centred, which is
 * how it ended up centred in templates nobody could straighten. This writes
 * `content.textStyle`, which is ordinary section content, so it saves with the
 * section and travels into and out of a template with no migration.
 *
 * Headings, bullets and the intro text all scale off the body size, so one
 * control moves the whole section coherently instead of leaving a 16pt heading
 * above 20pt paragraphs.
 */
export function TextStyleEditor({
  content,
  setContent,
}: {
  content: Record<string, any>;
  setContent: (content: Record<string, any>) => void;
}) {
  const style = resolveSectionTextStyle(content);
  const set = (patch: Partial<SectionTextStyle>) =>
    setContent({ ...content, textStyle: { ...style, ...patch } });

  return (
    <div className="space-y-2" data-testid="text-style-editor">
      <Label>Text style</Label>
      <div className="grid grid-cols-3 gap-2">
        <Select value={style.align} onValueChange={(v) => set({ align: v as SectionTextStyle["align"] })}>
          <SelectTrigger className="h-8 text-xs" data-testid="select-text-align">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TEXT_ALIGN_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={String(style.fontSize)} onValueChange={(v) => set({ fontSize: Number(v) })}>
          <SelectTrigger className="h-8 text-xs" data-testid="select-text-size">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TEXT_SIZE_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)} className="text-xs">{n}pt</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={style.fontFamily} onValueChange={(v) => set({ fontFamily: v })}>
          <SelectTrigger className="h-8 text-xs" data-testid="select-text-font">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TEXT_FONT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">
        Applies to this section&apos;s intro and body text. Headings and bullets scale with the size.
      </p>
    </div>
  );
}

/* ── Terms & Conditions ───────────────────────────────────────────────── */

export function TermsTemplatePicker({
  onPick,
  hasContent,
}: {
  onPick: (text: string) => void;
  hasContent: boolean;
}) {
  const { data: companySettings } = useQuery<{
    termsTemplates?: Array<{ id: string; name: string; content: string }>;
  } | null>({ queryKey: ['/api/company-settings'] });

  const templates = companySettings?.termsTemplates ?? [];
  const [pending, setPending] = useState<{ id: string; name: string; content: string } | null>(null);

  if (templates.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Save your standard terms under Settings → Terms Templates and you can load them here.
      </p>
    );
  }

  return (
    <>
      <Select
        value=""
        onValueChange={(id) => {
          const tpl = templates.find((t) => t.id === id);
          if (!tpl) return;
          // Replacing wording a builder has already edited is not something to
          // do quietly, so it asks — but only when there is something to lose.
          if (hasContent) setPending(tpl);
          else onPick(tpl.content);
        }}
      >
        <SelectTrigger className="h-7 text-xs" data-testid="select-terms-template">
          <SelectValue placeholder="Load your saved terms…" />
        </SelectTrigger>
        <SelectContent>
          {templates.map((t) => (
            <SelectItem key={t.id} value={t.id} className="text-xs">
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => { if (!o) setPending(null); }}
        title={`Replace these terms with "${pending?.name ?? ''}"?`}
        description="What is written here now is overwritten. Your saved template is not changed."
        confirmLabel="Replace"
        destructive
        onConfirm={() => { if (pending) onPick(pending.content); setPending(null); }}
      />
    </>
  );
}
