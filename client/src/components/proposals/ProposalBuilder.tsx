import { useState, useEffect, useRef } from 'react';
import { pdf, PDFDownloadLink } from '@react-pdf/renderer';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { GripVertical, Plus, Download, Eye, Loader2 } from 'lucide-react';
import type { Proposal, ProposalSection, Project } from '@shared/schema';
import { ProposalDocument } from './pdf/ProposalDocument';

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

interface SortableSectionItemProps {
  section: ProposalSection;
  onSectionUpdate: (sectionId: string, updates: Partial<ProposalSection>) => void;
  value: string;
}

function SortableSectionItem({ section, onSectionUpdate, value }: SortableSectionItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const [localName, setLocalName] = useState(section.name);
  const [localDescription, setLocalDescription] = useState(section.description || "");
  const [localContent, setLocalContent] = useState<Record<string, any>>(section.content || {});
  const [localIsEnabled, setLocalIsEnabled] = useState(section.isEnabled !== false);

  // Only reset local state when the section ID changes (switching to a different section)
  // This prevents infinite loops while still allowing updates from the server
  useEffect(() => {
    setLocalName(section.name);
    setLocalDescription(section.description || "");
    setLocalContent(section.content || {});
    setLocalIsEnabled(section.isEnabled !== false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section.id]);
  
  const handleToggleEnabled = (enabled: boolean) => {
    setLocalIsEnabled(enabled);
    // Auto-save the enabled state
    onSectionUpdate(section.id, { isEnabled: enabled });
  };

  const handleSave = () => {
    onSectionUpdate(section.id, {
      name: localName,
      description: localDescription,
      content: localContent,
    });
  };

  const sectionTypeLabel = SECTION_TYPE_LABELS[section.sectionType || "custom"] || "Section";

  return (
    <div ref={setNodeRef} style={style}>
      <AccordionItem value={value} className="border rounded-md mb-2 bg-background">
        <div className="flex items-center gap-2 px-3">
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing py-4">
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0 py-4">
            <p className="font-medium text-sm">{section.name}</p>
            <p className="text-xs text-muted-foreground">{sectionTypeLabel}</p>
          </div>
          <div className="flex items-center gap-3 py-4">
            <Switch 
              checked={localIsEnabled}
              onCheckedChange={handleToggleEnabled}
              onClick={(e) => e.stopPropagation()}
              data-testid={`switch-section-enabled-${section.id}`}
            />
            <AccordionTrigger className="hover:no-underline px-2">
            </AccordionTrigger>
          </div>
        </div>
        <AccordionContent className="px-4 pb-4">
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor={`section-name-${section.id}`}>Section Name</Label>
              <Input
                id={`section-name-${section.id}`}
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                placeholder="Enter section name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`section-description-${section.id}`}>Description</Label>
              <Textarea
                id={`section-description-${section.id}`}
                value={localDescription}
                onChange={(e) => setLocalDescription(e.target.value)}
                placeholder="Optional description"
                rows={3}
              />
            </div>

            {/* Section-specific content editors */}
            {section.sectionType === "cover_letter" && (
              <div className="space-y-2">
                <Label htmlFor={`letter-content-${section.id}`}>Letter Content</Label>
                <Textarea
                  id={`letter-content-${section.id}`}
                  value={localContent.letterText || ""}
                  onChange={(e) => setLocalContent({ ...localContent, letterText: e.target.value })}
                  placeholder="Enter your cover letter text..."
                  rows={8}
                />
              </div>
            )}

            {section.sectionType === "closing_letter" && (
              <div className="space-y-2">
                <Label htmlFor={`closing-content-${section.id}`}>Closing Letter Content</Label>
                <Textarea
                  id={`closing-content-${section.id}`}
                  value={localContent.closingText || ""}
                  onChange={(e) => setLocalContent({ ...localContent, closingText: e.target.value })}
                  placeholder="Enter your closing letter text..."
                  rows={8}
                />
              </div>
            )}

            {section.sectionType === "summary" && (
              <div className="space-y-2">
                <Label htmlFor={`summary-content-${section.id}`}>Summary Content</Label>
                <Textarea
                  id={`summary-content-${section.id}`}
                  value={localContent.summaryText || ""}
                  onChange={(e) => setLocalContent({ ...localContent, summaryText: e.target.value })}
                  placeholder="Enter project summary..."
                  rows={8}
                />
              </div>
            )}

            {section.sectionType === "terms_conditions" && (
              <div className="space-y-2">
                <Label htmlFor={`terms-content-${section.id}`}>Terms & Conditions</Label>
                <Textarea
                  id={`terms-content-${section.id}`}
                  value={localContent.termsText || ""}
                  onChange={(e) => setLocalContent({ ...localContent, termsText: e.target.value })}
                  placeholder="Enter terms and conditions..."
                  rows={10}
                />
              </div>
            )}

            {section.sectionType === "custom" && (
              <div className="space-y-2">
                <Label htmlFor={`custom-content-${section.id}`}>Content</Label>
                <Textarea
                  id={`custom-content-${section.id}`}
                  value={localContent.customText || ""}
                  onChange={(e) => setLocalContent({ ...localContent, customText: e.target.value })}
                  placeholder="Enter section content..."
                  rows={8}
                />
              </div>
            )}

            {section.sectionType === "cover_page" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor={`project-title-${section.id}`}>Project Title</Label>
                  <Input
                    id={`project-title-${section.id}`}
                    value={localContent.projectTitle || ""}
                    onChange={(e) => setLocalContent({ ...localContent, projectTitle: e.target.value })}
                    placeholder="Enter project title"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`client-name-${section.id}`}>Client Name</Label>
                  <Input
                    id={`client-name-${section.id}`}
                    value={localContent.clientName || ""}
                    onChange={(e) => setLocalContent({ ...localContent, clientName: e.target.value })}
                    placeholder="Enter client name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`subtitle-${section.id}`}>Subtitle</Label>
                  <Input
                    id={`subtitle-${section.id}`}
                    value={localContent.subtitle || ""}
                    onChange={(e) => setLocalContent({ ...localContent, subtitle: e.target.value })}
                    placeholder="Optional subtitle"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button onClick={handleSave} size="sm">
                Save Changes
              </Button>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </div>
  );
}

interface ProposalBuilderProps {
  proposal: Proposal;
  sections: ProposalSection[];
  project?: Project;
  onSectionsReorder: (sections: ProposalSection[]) => void;
  onSectionUpdate: (sectionId: string, updates: Partial<ProposalSection>) => void;
  onAddSection: () => void;
  companyLogo?: string;
  companyName?: string;
  primaryColor?: string;
}

export function ProposalBuilder({
  proposal,
  sections,
  project,
  onSectionsReorder,
  onSectionUpdate,
  onAddSection,
  companyLogo,
  companyName,
  primaryColor,
}: ProposalBuilderProps) {
  const [showPreview, setShowPreview] = useState(true);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const pdfUrlRef = useRef<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    let isCancelled = false;
    
    async function generatePdf() {
      if (!showPreview) {
        // Clear PDF when preview is hidden
        if (pdfUrlRef.current) {
          URL.revokeObjectURL(pdfUrlRef.current);
          pdfUrlRef.current = null;
        }
        setPdfUrl(null);
        return;
      }
      
      setIsGenerating(true);
      
      try {
        const blob = await pdf(
          <ProposalDocument
            proposal={proposal}
            sections={sections}
            project={project}
            companyLogo={companyLogo}
            companyName={companyName}
            primaryColor={primaryColor}
          />
        ).toBlob();
        
        if (!isCancelled) {
          // Revoke previous URL
          if (pdfUrlRef.current) {
            URL.revokeObjectURL(pdfUrlRef.current);
          }
          
          // Create and store new URL
          const url = URL.createObjectURL(blob);
          pdfUrlRef.current = url;
          setPdfUrl(url);
        }
      } catch (error) {
        console.error('Error generating PDF:', error);
      } finally {
        if (!isCancelled) {
          setIsGenerating(false);
        }
      }
    }
    
    generatePdf();
    
    return () => {
      isCancelled = true;
      // Cleanup: revoke the current URL on unmount
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
        pdfUrlRef.current = null;
      }
    };
  }, [proposal, sections, project, companyLogo, companyName, primaryColor, showPreview]);

  function handleDragEnd(event: any) {
    const { active, over } = event;

    if (active.id !== over.id) {
      const oldIndex = sections.findIndex((s) => s.id === active.id);
      const newIndex = sections.findIndex((s) => s.id === over.id);
      const reorderedSections = arrayMove(sections, oldIndex, newIndex).map((s, idx) => ({
        ...s,
        order: idx,
      }));
      onSectionsReorder(reorderedSections);
    }
  }

  return (
    <div className="flex h-full gap-4">
      {/* PDF Preview Panel - 60% */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Preview</h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPreview(!showPreview)}
              data-testid="button-toggle-preview"
            >
              <Eye className="w-4 h-4 mr-2" />
              {showPreview ? 'Hide' : 'Show'} Preview
            </Button>
            <PDFDownloadLink
              document={
                <ProposalDocument
                  proposal={proposal}
                  sections={sections}
                  project={project}
                  companyLogo={companyLogo}
                  companyName={companyName}
                  primaryColor={primaryColor}
                />
              }
              fileName={`${proposal.proposalNumber}.pdf`}
            >
              {({ loading }) => (
                <Button
                  variant="default"
                  size="sm"
                  disabled={loading}
                  data-testid="button-download-pdf"
                >
                  <Download className="w-4 h-4 mr-2" />
                  {loading ? 'Generating...' : 'Download PDF'}
                </Button>
              )}
            </PDFDownloadLink>
          </div>
        </div>

        {showPreview ? (
          <div className="flex-1 border rounded-lg overflow-hidden bg-gray-100 relative">
            {isGenerating ? (
              <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm text-muted-foreground">Generating PDF...</span>
                </div>
              </div>
            ) : null}
            {pdfUrl ? (
              <iframe
                key={pdfUrl}
                src={pdfUrl}
                className="w-full h-full border-0"
                sandbox="allow-same-origin"
                title="PDF Preview"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <p>Loading preview...</p>
              </div>
            )}
          </div>
        ) : (
          <Card className="flex-1 flex items-center justify-center text-muted-foreground">
            Preview hidden - Click "Show Preview" to view
          </Card>
        )}
      </div>

      {/* Section Sidebar - 40% */}
      <div className="w-96 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Sections</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={onAddSection}
            data-testid="button-add-section"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Section
          </Button>
        </div>

        <div className="flex-1 overflow-auto">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sections.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <Accordion type="single" collapsible className="w-full">
                {sections.map((section) => (
                  <SortableSectionItem
                    key={section.id}
                    section={section}
                    onSectionUpdate={onSectionUpdate}
                    value={section.id}
                  />
                ))}
              </Accordion>
            </SortableContext>
          </DndContext>

          {sections.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground">
              <p className="mb-2">No sections yet</p>
              <p className="text-sm">Click "Add Section" to get started</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
