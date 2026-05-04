import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { RichTextEditor } from "@/components/RichTextEditor";
import type { ProposalSection, Estimate } from "@shared/schema";

interface SectionEditorProps {
  section: ProposalSection | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (sectionId: string, updates: Partial<ProposalSection>) => void;
  isSaving?: boolean;
  projectId?: string;
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

export function SectionEditor({ section, isOpen, onClose, onSave, isSaving, projectId }: SectionEditorProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState<Record<string, any>>({});

  useEffect(() => {
    if (section) {
      setName(section.name);
      setDescription(section.description || "");
      setContent(section.content || {});
    } else {
      setName("");
      setDescription("");
      setContent({});
    }
  }, [section]);

  const handleSave = () => {
    if (!section) return;
    
    onSave(section.id, {
      name,
      description,
      content,
    });
  };

  if (!section) return null;

  const sectionTypeLabel = SECTION_TYPE_LABELS[section.sectionType || "custom"] || "Section";

  console.log('SectionEditor rendering:', { 
    sectionType: section.sectionType, 
    sectionName: section.name,
    content: content 
  });

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
            <Textarea
              id="section-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={3}
              data-testid="textarea-section-description"
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
                />
              </div>
              <div className="space-y-2">
                <Label>Exclusions</Label>
                <RichTextEditor
                  content={content.exclusionsText || ""}
                  onChange={(html) => setContent({ ...content, exclusionsText: html })}
                  placeholder="What is excluded..."
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
              />
            </div>
          )}

          {section.sectionType === "estimate" && <EstimateEditor content={content} setContent={setContent} projectId={projectId} />}

          {section.sectionType === "cover_page" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="project-title">Project Title</Label>
                <Input
                  id="project-title"
                  value={content.projectTitle || ""}
                  onChange={(e) => setContent({ ...content, projectTitle: e.target.value })}
                  placeholder="Enter project title"
                  data-testid="input-project-title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-name">Client Name</Label>
                <Input
                  id="client-name"
                  value={content.clientName || ""}
                  onChange={(e) => setContent({ ...content, clientName: e.target.value })}
                  placeholder="Enter client name"
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

  console.log('EstimateEditor rendering:', { content, estimates, isLoading, projectId });

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
        <Textarea
          id="estimate-description"
          value={content.estimateDescription || ""}
          onChange={(e) => setContent({ ...content, estimateDescription: e.target.value })}
          placeholder="Optional description to show above the estimate"
          rows={3}
          data-testid="textarea-estimate-description"
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
