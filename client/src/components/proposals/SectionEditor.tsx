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
import type { ProposalSection, Estimate } from "@shared/schema";

interface SectionEditorProps {
  section: ProposalSection | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (sectionId: string, updates: Partial<ProposalSection>) => void;
  isSaving?: boolean;
}

const SECTION_TYPE_LABELS: Record<string, string> = {
  cover_page: "Cover Page",
  cover_letter: "Cover Letter",
  estimate: "Estimate",
  summary: "Summary",
  allowances: "Allowances",
  closing_letter: "Closing Letter",
  attachments: "Attachments",
  terms_conditions: "Terms & Conditions",
  signature: "Signature",
  custom: "Custom Section",
};

export function SectionEditor({ section, isOpen, onClose, onSave, isSaving }: SectionEditorProps) {
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
              <Label htmlFor="letter-content">Letter Content</Label>
              <Textarea
                id="letter-content"
                value={content.letterText || ""}
                onChange={(e) => setContent({ ...content, letterText: e.target.value })}
                placeholder="Enter your cover letter text..."
                rows={8}
                data-testid="textarea-letter-content"
              />
            </div>
          )}

          {section.sectionType === "closing_letter" && (
            <div className="space-y-2">
              <Label htmlFor="closing-content">Closing Letter Content</Label>
              <Textarea
                id="closing-content"
                value={content.closingText || ""}
                onChange={(e) => setContent({ ...content, closingText: e.target.value })}
                placeholder="Enter your closing letter text..."
                rows={8}
                data-testid="textarea-closing-content"
              />
            </div>
          )}

          {section.sectionType === "summary" && (
            <div className="space-y-2">
              <Label htmlFor="summary-content">Summary Content</Label>
              <Textarea
                id="summary-content"
                value={content.summaryText || ""}
                onChange={(e) => setContent({ ...content, summaryText: e.target.value })}
                placeholder="Enter project summary..."
                rows={8}
                data-testid="textarea-summary-content"
              />
            </div>
          )}

          {section.sectionType === "terms_conditions" && (
            <div className="space-y-2">
              <Label htmlFor="terms-content">Terms & Conditions</Label>
              <Textarea
                id="terms-content"
                value={content.termsText || ""}
                onChange={(e) => setContent({ ...content, termsText: e.target.value })}
                placeholder="Enter terms and conditions..."
                rows={10}
                data-testid="textarea-terms-content"
              />
            </div>
          )}

          {section.sectionType === "custom" && (
            <div className="space-y-2">
              <Label htmlFor="custom-content">Content</Label>
              <Textarea
                id="custom-content"
                value={content.customText || ""}
                onChange={(e) => setContent({ ...content, customText: e.target.value })}
                placeholder="Enter section content..."
                rows={8}
                data-testid="textarea-custom-content"
              />
            </div>
          )}

          {section.sectionType === "estimate" && <EstimateEditor content={content} setContent={setContent} />}

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

interface EstimateEditorProps {
  content: Record<string, any>;
  setContent: (content: Record<string, any>) => void;
}

function EstimateEditor({ content, setContent }: EstimateEditorProps) {
  const { data: estimates } = useQuery<Estimate[]>({
    queryKey: ["/api/estimates"],
  });

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
    <div className="space-y-4">
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
