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
import { PROPOSAL_PLACEHOLDER_TOKENS } from "./pdf/placeholders";
import type { ProposalSection, Estimate, Project, Contact } from "@shared/schema";

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

          {section.sectionType === "estimate" && <EstimateEditor content={content} setContent={setContent} projectId={projectId} />}

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
  projectId?: string;
}

export function EstimateEditor({ content, setContent, projectId }: EstimateEditorProps) {
  const { data: allEstimates, isLoading } = useQuery<Estimate[]>({
    queryKey: ["/api/estimates"],
  });

  // Filter estimates by projectId if provided
  const estimates = projectId 
    ? allEstimates?.filter(est => est.projectId === projectId)
    : allEstimates;

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
  };

  const updateToggle = (key: string, value: boolean) => {
    setContent({
      ...content,
      columnToggles: { ...toggles, [key]: value },
    });
  };

  return (
    <div className="space-y-4" data-testid="estimate-editor">
      <div className="space-y-2">
        <Label htmlFor="estimate-id">Select Estimate</Label>
        <Select
          value={content.estimateId || ""}
          onValueChange={(value) => setContent({ ...content, estimateId: value })}
        >
          <SelectTrigger id="estimate-id" data-testid="select-estimate">
            <SelectValue placeholder="Select an estimate" />
          </SelectTrigger>
          <SelectContent>
            {estimates?.map((estimate) => (
              <SelectItem key={estimate.id} value={estimate.id}>
                {estimate.name} (v{estimate.version})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="estimate-description">Description</Label>
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
            <Label htmlFor="toggle-showSubtotals" className="cursor-pointer">Show subtotals</Label>
            <Switch
              id="toggle-showSubtotals"
              checked={toggles.showSubtotals}
              onCheckedChange={(checked) => updateToggle("showSubtotals", checked)}
              data-testid="toggle-showSubtotals"
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="toggle-showZeroLines" className="cursor-pointer">Show $0 lines</Label>
            <Switch
              id="toggle-showZeroLines"
              checked={toggles.showZeroLines}
              onCheckedChange={(checked) => updateToggle("showZeroLines", checked)}
              data-testid="toggle-showZeroLines"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
