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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { GripVertical, Plus, Download, Eye, Loader2, Trash2 } from 'lucide-react';
import type { Proposal, ProposalSection, Project, ProposalPaymentMilestone } from '@shared/schema';
import { ProposalDocument } from './pdf/ProposalDocument';
import { PDFPreview } from './PDFPreview';
import { EstimateEditor } from './SectionEditor';
import { RichTextEditor } from '@/components/RichTextEditor';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';

const SECTION_TYPE_LABELS: Record<string, string> = {
  cover_page: "Cover Page",
  cover_letter: "Cover Letter",
  estimate: "Estimate",
  summary: "Summary",
  allowances: "Allowances",
  closing_letter: "Closing Letter",
  attachments: "Attachments",
  terms_conditions: "Terms & Conditions",
  payment_schedule: "Payment Schedule",
  signature: "Signature",
  custom: "Custom Section",
};

interface SortableSectionItemProps {
  section: ProposalSection;
  onSectionUpdate: (sectionId: string, updates: Partial<ProposalSection>) => void;
  value: string;
  projectId: string;
}

function SortableSectionItem({ section, onSectionUpdate, value, projectId }: SortableSectionItemProps) {
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
                <Label>Letter Content</Label>
                <RichTextEditor
                  content={localContent.letterText || ""}
                  onChange={(html) => setLocalContent({ ...localContent, letterText: html })}
                  placeholder="Enter your cover letter text..."
                />
              </div>
            )}

            {section.sectionType === "closing_letter" && (
              <div className="space-y-2">
                <Label>Closing Letter Content</Label>
                <RichTextEditor
                  content={localContent.closingText || ""}
                  onChange={(html) => setLocalContent({ ...localContent, closingText: html })}
                  placeholder="Enter your closing letter text..."
                />
              </div>
            )}

            {section.sectionType === "summary" && (
              <div className="space-y-2">
                <Label>Summary Content</Label>
                <RichTextEditor
                  content={localContent.summaryText || ""}
                  onChange={(html) => setLocalContent({ ...localContent, summaryText: html })}
                  placeholder="Enter project summary..."
                />
              </div>
            )}

            {section.sectionType === "terms_conditions" && (
              <div className="space-y-2">
                <Label>Terms &amp; Conditions</Label>
                <RichTextEditor
                  content={localContent.termsText || ""}
                  onChange={(html) => setLocalContent({ ...localContent, termsText: html })}
                  placeholder="Enter terms and conditions..."
                />
              </div>
            )}

            {section.sectionType === "custom" && (
              <div className="space-y-2">
                <Label>Content</Label>
                <RichTextEditor
                  content={localContent.customText || ""}
                  onChange={(html) => setLocalContent({ ...localContent, customText: html })}
                  placeholder="Enter section content..."
                />
              </div>
            )}

            {section.sectionType === "estimate" && (
              <EstimateEditor
                content={localContent}
                setContent={setLocalContent}
                projectId={projectId}
              />
            )}

            {section.sectionType === "payment_schedule" && (
              <PaymentScheduleEditor proposalId={section.proposalId} />
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
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const pdfUrlRef = useRef<string | null>(null);

  // Fetch payment milestones for PDF rendering
  const { data: milestones = [] } = useQuery<ProposalPaymentMilestone[]>({
    queryKey: ['/api/proposals', proposal.id, 'milestones'],
    enabled: !!proposal.id,
  });

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
        // Collect all estimate IDs from sections
        const estimateIds = sections
          .filter(s => s.sectionType === 'estimate' && (s.content as any)?.estimateId)
          .map(s => (s.content as any).estimateId);

        // Fetch all estimate data in parallel
        const estimatesDataMap: Record<string, any> = {};
        await Promise.all(
          estimateIds.map(async (estimateId) => {
            try {
              const response = await fetch(`/api/estimates/${estimateId}/full`);
              if (response.ok) {
                estimatesDataMap[estimateId] = await response.json();
              }
            } catch (error) {
              console.error(`Failed to fetch estimate ${estimateId}:`, error);
            }
          })
        );

        const blob = await pdf(
          <ProposalDocument
            proposal={proposal}
            sections={sections}
            project={project}
            companyLogo={companyLogo}
            companyName={companyName}
            primaryColor={primaryColor}
            estimatesData={estimatesDataMap}
            milestones={milestones}
          />
        ).toBlob();
        
        if (!isCancelled) {
          // Revoke previous URL
          if (pdfUrlRef.current) {
            URL.revokeObjectURL(pdfUrlRef.current);
          }
          
          // Create and store new URL for download
          const url = URL.createObjectURL(blob);
          pdfUrlRef.current = url;
          setPdfUrl(url);
          
          // Store blob directly for preview
          setPdfBlob(blob);
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
  }, [proposal, sections, project, companyLogo, companyName, primaryColor, showPreview, milestones]);

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
                  milestones={milestones}
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
          <div className="flex-1 border rounded-lg overflow-hidden bg-muted relative">
            {isGenerating ? (
              <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm text-muted-foreground">Generating PDF...</span>
                </div>
              </div>
            ) : null}
            {pdfBlob ? (
              <PDFPreview pdfBlob={pdfBlob} />
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

      {/* Sidebar - Sections / Layout - 40% */}
      <div className="w-96 flex flex-col">
        <Tabs defaultValue="sections" className="flex-1 flex flex-col">
          <TabsList className="w-full">
            <TabsTrigger value="sections" className="flex-1" data-testid="tab-sections">Sections</TabsTrigger>
            <TabsTrigger value="layout" className="flex-1" data-testid="tab-layout">Layout</TabsTrigger>
          </TabsList>
          <TabsContent value="sections" className="flex-1 flex flex-col mt-4">
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
                        projectId={proposal.projectId}
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
          </TabsContent>

          <TabsContent value="layout" className="flex-1 mt-4">
            <LayoutPanel proposal={proposal} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// --- Layout Panel ---
interface LayoutPanelProps {
  proposal: Proposal;
}

function LayoutPanel({ proposal }: LayoutPanelProps) {
  const settings = (proposal.layoutSettings as any) || {};
  const [primaryColor, setPrimaryColor] = useState<string>(settings.primaryColor || '#3B82F6');
  const [showPageNumbers, setShowPageNumbers] = useState<boolean>(settings.showPageNumbers ?? true);
  const [showFooter, setShowFooter] = useState<boolean>(settings.showFooter ?? true);
  const [pageSize, setPageSize] = useState<string>(settings.pageSize || 'A4');

  const saveLayoutMutation = useMutation({
    mutationFn: async (layoutSettings: Record<string, any>) => {
      return await apiRequest(`/api/proposals/${proposal.id}`, 'PATCH', { layoutSettings });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/proposals', proposal.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/proposals'] });
    },
  });

  const handleSave = () => {
    saveLayoutMutation.mutate({ primaryColor, showPageNumbers, showFooter, pageSize });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="layout-primary-color">Primary Color</Label>
        <Input
          id="layout-primary-color"
          type="color"
          value={primaryColor}
          onChange={(e) => setPrimaryColor(e.target.value)}
          data-testid="input-layout-primary-color"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="layout-page-size">Page Size</Label>
        <select
          id="layout-page-size"
          className="w-full border rounded-md px-3 py-2 text-sm bg-background"
          value={pageSize}
          onChange={(e) => setPageSize(e.target.value)}
          data-testid="select-layout-page-size"
        >
          <option value="A4">A4</option>
          <option value="LETTER">US Letter</option>
        </select>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="layout-page-numbers">Show page numbers</Label>
        <Switch
          id="layout-page-numbers"
          checked={showPageNumbers}
          onCheckedChange={setShowPageNumbers}
          data-testid="switch-layout-page-numbers"
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="layout-footer">Show footer</Label>
        <Switch
          id="layout-footer"
          checked={showFooter}
          onCheckedChange={setShowFooter}
          data-testid="switch-layout-footer"
        />
      </div>
      <Button onClick={handleSave} disabled={saveLayoutMutation.isPending} className="w-full" data-testid="button-save-layout">
        {saveLayoutMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Save Layout
      </Button>
    </div>
  );
}

// --- Payment Schedule Editor ---
interface PaymentScheduleEditorProps {
  proposalId: string;
}

function PaymentScheduleEditor({ proposalId }: PaymentScheduleEditorProps) {
  const { data: milestones = [] } = useQuery<ProposalPaymentMilestone[]>({
    queryKey: ['/api/proposals', proposalId, 'milestones'],
  });
  const [draft, setDraft] = useState<Array<Partial<ProposalPaymentMilestone>>>([]);

  useEffect(() => {
    setDraft(milestones.length > 0 ? milestones : []);
  }, [milestones]);

  const replaceMutation = useMutation({
    mutationFn: async (items: Array<Partial<ProposalPaymentMilestone>>) => {
      return await apiRequest(`/api/proposals/${proposalId}/milestones`, 'PUT', {
        milestones: items.map((m, i) => ({
          name: m.name || `Milestone ${i + 1}`,
          percentage: m.percentage ?? null,
          amountCents: m.amountCents ?? null,
          description: m.description || null,
          order: i,
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/proposals', proposalId, 'milestones'] });
    },
  });

  const addRow = () => setDraft([...draft, { name: '', percentage: 0 }]);
  const removeRow = (idx: number) => setDraft(draft.filter((_, i) => i !== idx));
  const updateRow = (idx: number, patch: Partial<ProposalPaymentMilestone>) =>
    setDraft(draft.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const totalPct = draft.reduce((s, m) => s + (Number(m.percentage) || 0), 0);

  return (
    <div className="space-y-3" data-testid="payment-schedule-editor">
      <div className="flex items-center justify-between">
        <Label>Payment Schedule</Label>
        <Button size="sm" variant="outline" onClick={addRow} data-testid="button-add-milestone">
          <Plus className="w-4 h-4 mr-1" /> Add
        </Button>
      </div>
      <div className="space-y-2">
        {draft.map((m, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Input
              placeholder="Name"
              value={m.name || ''}
              onChange={(e) => updateRow(idx, { name: e.target.value })}
              className="flex-1"
              data-testid={`input-milestone-name-${idx}`}
            />
            <Input
              placeholder="%"
              type="number"
              value={m.percentage ?? ''}
              onChange={(e) => updateRow(idx, { percentage: e.target.value === '' ? null : Number(e.target.value) })}
              className="w-20"
              data-testid={`input-milestone-pct-${idx}`}
            />
            <Button size="icon" variant="ghost" onClick={() => removeRow(idx)} data-testid={`button-remove-milestone-${idx}`}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
        {draft.length === 0 && (
          <p className="text-xs text-muted-foreground">No milestones — click Add to begin.</p>
        )}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Total: {totalPct.toFixed(2)}%</span>
        <Button size="sm" onClick={() => replaceMutation.mutate(draft)} disabled={replaceMutation.isPending} data-testid="button-save-milestones">
          {replaceMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
          Save Schedule
        </Button>
      </div>
    </div>
  );
}
