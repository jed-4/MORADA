import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { ProposalSection } from "@shared/schema";

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
