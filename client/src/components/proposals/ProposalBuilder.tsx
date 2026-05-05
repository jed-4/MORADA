import { useState, useEffect, useRef } from 'react';
import { pdf, PDFDownloadLink } from '@react-pdf/renderer';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { GripVertical, Plus, Download, Eye, Loader2, Trash2, Copy, History, FileText, ArrowRight, Send, CheckCircle, XCircle, FileCheck } from 'lucide-react';
import { useLocation } from 'wouter';
import { format as formatDate } from 'date-fns';
import type { Proposal, ProposalSection, Project, ProposalPaymentMilestone, ProposalAcceptance, Contact, Estimate } from '@shared/schema';
import { ProposalDocument } from './pdf/ProposalDocument';
import { PDFPreview } from './PDFPreview';
import { EstimateEditor } from './SectionEditor';
import { RichTextEditor } from '@/components/RichTextEditor';
import { PROPOSAL_PLACEHOLDER_TOKENS } from './pdf/placeholders';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';

const PROPOSAL_PLACEHOLDERS = PROPOSAL_PLACEHOLDER_TOKENS;

function revisionLabel(version: number | null | undefined): string {
  const v = Math.max(1, Number(version || 1));
  if (v <= 26) return `Rev ${String.fromCharCode(64 + v)}`;
  return `Rev ${v}`;
}

const SECTION_TYPE_LABELS: Record<string, string> = {
  cover_page: "Cover Page",
  cover_letter: "Cover Letter",
  scope: "Scope of Work",
  estimate: "Estimate",
  summary: "Summary",
  allowances: "Allowances",
  inclusions_exclusions: "Inclusions & Exclusions",
  closing: "Closing",
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
  project?: Project;
  client?: Contact;
}

function SortableSectionItem({ section, onSectionUpdate, value, projectId, project, client }: SortableSectionItemProps) {
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
  const sectionDescriptionHtml = (section as ProposalSection & { descriptionHtml?: string | null }).descriptionHtml;
  const [localDescriptionHtml, setLocalDescriptionHtml] = useState<string>(
    sectionDescriptionHtml || section.description || "",
  );
  const [localDescriptionText, setLocalDescriptionText] = useState<string>(section.description || "");
  const [localContent, setLocalContent] = useState<Record<string, any>>(section.content || {});
  const [localIsEnabled, setLocalIsEnabled] = useState(section.isEnabled !== false);

  // Only reset local state when the section ID changes (switching to a different section)
  // This prevents infinite loops while still allowing updates from the server
  useEffect(() => {
    const html = (section as ProposalSection & { descriptionHtml?: string | null }).descriptionHtml;
    setLocalName(section.name);
    setLocalDescriptionHtml(html || section.description || "");
    setLocalDescriptionText(section.description || "");
    setLocalContent(section.content || {});
    setLocalIsEnabled(section.isEnabled !== false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section.id]);

  const handleToggleEnabled = (enabled: boolean) => {
    setLocalIsEnabled(enabled);
    onSectionUpdate(section.id, { isEnabled: enabled });
  };

  const handleSave = () => {
    onSectionUpdate(section.id, {
      name: localName,
      description: localDescriptionText,
      descriptionHtml: localDescriptionHtml,
      content: localContent,
    } as Partial<ProposalSection>);
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
              <RichTextEditor
                content={localDescriptionHtml}
                onChange={(html, text) => {
                  setLocalDescriptionHtml(html);
                  setLocalDescriptionText(text);
                }}
                placeholder="Optional description"
                placeholders={PROPOSAL_PLACEHOLDERS}
                data-testid={`richtext-section-description-${section.id}`}
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
                  placeholders={PROPOSAL_PLACEHOLDERS}
                />
              </div>
            )}

            {section.sectionType === "scope" && (
              <div className="space-y-2">
                <Label>Scope of Work</Label>
                <RichTextEditor
                  content={localContent.scopeText || ""}
                  onChange={(html) => setLocalContent({ ...localContent, scopeText: html })}
                  placeholder="Describe the scope of work..."
                  placeholders={PROPOSAL_PLACEHOLDERS}
                />
              </div>
            )}

            {(section.sectionType === "closing_letter" || section.sectionType === "closing") && (
              <div className="space-y-2">
                <Label>Closing Content</Label>
                <RichTextEditor
                  content={localContent.closingText || ""}
                  onChange={(html) => setLocalContent({ ...localContent, closingText: html })}
                  placeholder="Enter your closing text..."
                  placeholders={PROPOSAL_PLACEHOLDERS}
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
                  placeholders={PROPOSAL_PLACEHOLDERS}
                />
              </div>
            )}

            {section.sectionType === "allowances" && (
              <div className="space-y-2">
                <Label>Allowances Notes</Label>
                <RichTextEditor
                  content={localContent.allowancesText || ""}
                  onChange={(html) => setLocalContent({ ...localContent, allowancesText: html })}
                  placeholder="Optional notes on allowances..."
                  placeholders={PROPOSAL_PLACEHOLDERS}
                />
              </div>
            )}

            {section.sectionType === "inclusions_exclusions" && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Inclusions</Label>
                  <RichTextEditor
                    content={localContent.inclusionsText || ""}
                    onChange={(html) => setLocalContent({ ...localContent, inclusionsText: html })}
                    placeholder="What is included..."
                    placeholders={PROPOSAL_PLACEHOLDERS}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Exclusions</Label>
                  <RichTextEditor
                    content={localContent.exclusionsText || ""}
                    onChange={(html) => setLocalContent({ ...localContent, exclusionsText: html })}
                    placeholder="What is excluded..."
                    placeholders={PROPOSAL_PLACEHOLDERS}
                  />
                </div>
              </div>
            )}

            {section.sectionType === "terms_conditions" && (
              <div className="space-y-2">
                <Label>Terms &amp; Conditions</Label>
                <RichTextEditor
                  content={localContent.termsText || ""}
                  onChange={(html) => setLocalContent({ ...localContent, termsText: html })}
                  placeholder="Enter terms and conditions..."
                  placeholders={PROPOSAL_PLACEHOLDERS}
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
                  placeholders={PROPOSAL_PLACEHOLDERS}
                />
              </div>
            )}

            {section.sectionType === "estimate" && (
              <div className="space-y-3">
                <EstimateRevisionSelector
                  proposalId={section.proposalId}
                  currentEstimateId={(localContent.estimateId as string | undefined) || null}
                  projectId={projectId}
                  onPick={(id) => {
                    // Authoritative: update local state AND immediately
                    // persist the section content patch so the live preview
                    // refetches against the new revision without waiting
                    // for the user to press Save Changes.
                    const next = { ...localContent, estimateId: id };
                    setLocalContent(next);
                    onSectionUpdate(section.id, { content: next });
                  }}
                />
                <EstimateEditor
                  content={localContent}
                  setContent={setLocalContent}
                  projectId={projectId}
                />
              </div>
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
                    placeholder={project?.name || "Enter project title"}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`client-name-${section.id}`}>Client Name</Label>
                  <Input
                    id={`client-name-${section.id}`}
                    value={localContent.clientName || ""}
                    onChange={(e) => setLocalContent({ ...localContent, clientName: e.target.value })}
                    placeholder={client?.name || "Enter client name"}
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

// --- Proposal Template (full proposal) ---
type ProposalTemplate = {
  id: string;
  name: string;
  sections: Array<{ sectionType: string; name: string; order: number; content?: any }>;
  layoutSettings?: Record<string, any>;
};

interface ProposalTemplateBarProps {
  proposal: Proposal;
  sections: ProposalSection[];
}

function ProposalTemplateBar({ proposal, sections }: ProposalTemplateBarProps) {
  const { toast } = useToast();
  const [templateName, setTemplateName] = useState('');
  const [showSave, setShowSave] = useState(false);

  const { data: companySettings } = useQuery<{
    proposalTemplates?: ProposalTemplate[];
  } | null>({
    queryKey: ['/api/company-settings'],
  });

  const templates = companySettings?.proposalTemplates ?? [];

  const applyMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const tpl = templates.find((t) => t.id === templateId);
      if (!tpl) throw new Error('Template not found');

      // Remove existing sections
      await Promise.all(
        sections.map((s) =>
          apiRequest(`/api/proposal-sections/${s.id}`, 'DELETE'),
        ),
      );

      // Insert template sections
      for (const ts of tpl.sections) {
        await apiRequest(`/api/proposals/${proposal.id}/sections`, 'POST', {
          sectionType: ts.sectionType,
          name: ts.name,
          order: ts.order,
          content: ts.content ?? {},
          isEnabled: true,
        });
      }

      // Apply layout settings
      if (tpl.layoutSettings) {
        await apiRequest(`/api/proposals/${proposal.id}`, 'PATCH', {
          layoutSettings: tpl.layoutSettings,
        });
      }
      return tpl;
    },
    onSuccess: (tpl) => {
      queryClient.invalidateQueries({ queryKey: ['/api/proposals', proposal.id, 'sections'] });
      queryClient.invalidateQueries({ queryKey: ['/api/proposals', proposal.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/proposals'] });
      toast({ title: 'Template applied', description: `Loaded "${tpl.name}".` });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : 'Could not apply template';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (name: string) => {
      const newTpl: ProposalTemplate = {
        id: `ptpl-${Date.now()}`,
        name,
        sections: sections
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((s, i) => ({
            sectionType: s.sectionType,
            name: s.name,
            order: i,
            content: s.content ?? {},
          })),
        layoutSettings: (proposal.layoutSettings as Record<string, any>) || undefined,
      };
      const next = [...templates, newTpl];
      return await apiRequest('/api/company-settings', 'PATCH', { proposalTemplates: next });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company-settings'] });
      toast({ title: 'Template saved' });
      setTemplateName('');
      setShowSave(false);
    },
    onError: () => {
      toast({ title: 'Could not save template', variant: 'destructive' });
    },
  });

  return (
    <div className="space-y-2 mb-3" data-testid="proposal-template-bar">
      <div className="flex items-center gap-2 flex-wrap">
        {templates.length > 0 && (
          <Select
            onValueChange={(id) => {
              if (!id) return;
              const tpl = templates.find((t) => t.id === id);
              if (!tpl) return;
              const ok =
                sections.length === 0 ||
                window.confirm(
                  `Apply template "${tpl.name}"? This will replace all ${sections.length} current section(s).`,
                );
              if (ok) applyMutation.mutate(id);
            }}
            disabled={applyMutation.isPending}
          >
            <SelectTrigger className="h-8 flex-1 text-xs" data-testid="select-apply-proposal-template">
              <SelectValue
                placeholder={
                  applyMutation.isPending ? 'Applying…' : 'Apply template'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id} className="text-xs">
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowSave((v) => !v)}
          disabled={sections.length === 0}
          data-testid="button-toggle-save-proposal-template"
        >
          Save as template
        </Button>
      </div>
      {showSave && (
        <div className="flex gap-2">
          <Input
            placeholder="Template name"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            className="h-8 text-xs"
            data-testid="input-proposal-template-name"
          />
          <Button
            size="sm"
            disabled={!templateName.trim() || saveMutation.isPending}
            onClick={() => saveMutation.mutate(templateName.trim())}
            data-testid="button-save-proposal-template"
          >
            {saveMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
            Save
          </Button>
        </div>
      )}
    </div>
  );
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

  // Fetch the project's client contact so cover-page placeholders + PDF can
  // auto-fill the client name when the user leaves it blank.
  const { data: client } = useQuery<Contact>({
    queryKey: ['/api/contacts', project?.clientId],
    enabled: !!project?.clientId,
  });

  // Fetch latest accepted/rejected acceptance for embedding signature into PDF
  const { data: latestAcceptance = null } = useQuery<ProposalAcceptance | null>({
    queryKey: ['/api/proposals', proposal.id, 'latest-acceptance'],
    enabled: !!proposal.id,
  });

  // Fetch company settings for the {{builder.phone}} placeholder context.
  const { data: companySettingsForPdf } = useQuery<{
    phone?: string;
    companyPhone?: string;
  } | null>({
    queryKey: ['/api/company-settings'],
  });
  const companyPhone = companySettingsForPdf?.phone || companySettingsForPdf?.companyPhone || '';

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
        // Collect all estimate IDs from sections, falling back to the
        // proposal-level estimateId when the section hasn't picked an
        // explicit revision yet. This keeps the live preview in sync after
        // changing the linked estimate from the Revisions panel.
        const sectionEstimateIds = sections
          .filter((s) => s.sectionType === 'estimate')
          .map((s) => {
            const c = (s.content as Record<string, unknown> | null) ?? {};
            return typeof c.estimateId === 'string' && c.estimateId
              ? (c.estimateId as string)
              : (proposal.estimateId || null);
          })
          .filter((id): id is string => !!id);
        const estimateIds = Array.from(new Set(sectionEstimateIds));

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
            client={client}
            companyLogo={companyLogo}
            companyName={companyName}
            companyPhone={companyPhone}
            primaryColor={primaryColor}
            estimatesData={estimatesDataMap}
            milestones={milestones}
            acceptance={latestAcceptance}
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
  }, [proposal, sections, project, client, companyLogo, companyName, companyPhone, primaryColor, showPreview, milestones, latestAcceptance]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sections.findIndex((s) => s.id === active.id);
    const newIndex = sections.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reorderedSections = arrayMove(sections, oldIndex, newIndex).map((s, idx) => ({
      ...s,
      order: idx,
    }));
    onSectionsReorder(reorderedSections);
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
                  client={client}
                  companyLogo={companyLogo}
                  companyName={companyName}
                  companyPhone={companyPhone}
                  primaryColor={primaryColor}
                  milestones={milestones}
                  acceptance={latestAcceptance}
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
      <div className="w-96 flex flex-col min-h-0">
        <Tabs defaultValue="sections" className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full">
            <TabsTrigger value="sections" className="flex-1" data-testid="tab-sections">Sections</TabsTrigger>
            <TabsTrigger value="layout" className="flex-1" data-testid="tab-layout">Layout</TabsTrigger>
          </TabsList>
          <TabsContent value="sections" className="flex-1 flex flex-col min-h-0 mt-4">
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

            <ProposalTemplateBar proposal={proposal} sections={sections} />

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
                        project={project}
                        client={client}
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

          <TabsContent value="layout" className="flex-1 min-h-0 mt-4 overflow-auto">
            <LayoutPanel proposal={proposal} sections={sections} onSectionUpdate={onSectionUpdate} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// --- Layout Panel ---
interface LayoutPanelProps {
  proposal: Proposal;
  sections: ProposalSection[];
  onSectionUpdate: (sectionId: string, updates: Partial<ProposalSection>) => void;
}

type PricingMode = 'lump_sum' | 'section_totals' | 'itemised';
type PresetKey = 'lump_sum_quote' | 'itemised_quote' | 'standard_residential';

type LayoutSettings = {
  primaryColor?: string;
  showPageNumbers?: boolean;
  showFooter?: boolean;
  pageSize?: string;
  pricingMode?: PricingMode;
  showGst?: boolean;
  showLogo?: boolean;
  preset?: PresetKey;
};

// Section types that each preset should enable. Anything not listed is
// disabled when the preset is applied. Aligned with the BuildPro spec.
const PRESET_ENABLED_SECTION_TYPES: Record<PresetKey, Set<string>> = {
  lump_sum_quote: new Set([
    'cover_page', 'scope', 'estimate', 'payment_schedule', 'terms_conditions', 'signature',
  ]),
  itemised_quote: new Set([
    'cover_page', 'scope', 'estimate', 'allowances', 'inclusions_exclusions',
    'payment_schedule', 'terms_conditions', 'signature',
  ]),
  standard_residential: new Set([
    'cover_page', 'cover_letter', 'scope', 'estimate', 'summary', 'allowances',
    'inclusions_exclusions', 'payment_schedule', 'closing', 'attachments',
    'terms_conditions', 'signature',
  ]),
};

// Presets aligned to BuildPro spec: Lump Sum / Itemised / Standard Residential
const LAYOUT_PRESETS: Record<PresetKey, Partial<LayoutSettings>> = {
  lump_sum_quote: {
    pageSize: 'A4',
    showFooter: true,
    showPageNumbers: true,
    showLogo: true,
    pricingMode: 'lump_sum',
    showGst: true,
  },
  itemised_quote: {
    pageSize: 'A4',
    showFooter: true,
    showPageNumbers: true,
    showLogo: true,
    pricingMode: 'itemised',
    showGst: true,
  },
  standard_residential: {
    pageSize: 'A4',
    showFooter: true,
    showPageNumbers: true,
    showLogo: true,
    pricingMode: 'section_totals',
    showGst: true,
  },
};

const PRICING_MODE_OPTIONS: Array<{ value: PricingMode; label: string }> = [
  { value: 'lump_sum', label: 'Lump Sum' },
  { value: 'section_totals', label: 'Section Totals' },
  { value: 'itemised', label: 'Itemised' },
];

// Canonical estimate columns per BuildPro spec: Description, Quantity, Unit,
// Unit Price, Total. Keys are kept in sync with EstimateSection toggle keys
// so the bridge in pdf/sections/EstimateSection.tsx renders the right cells.
const ESTIMATE_COLUMNS: Array<{ key: string; label: string }> = [
  { key: 'description', label: 'Description' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'unit', label: 'Unit' },
  { key: 'unitCostIncTax', label: 'Unit Price' },
  { key: 'amountIncTax', label: 'Total' },
];

function LayoutPanel({ proposal, sections, onSectionUpdate }: LayoutPanelProps) {
  const { toast } = useToast();
  const settings = (proposal.layoutSettings as LayoutSettings) || {};

  // Pull company-wide defaults: brand color + logo policy.
  const { data: companySettings } = useQuery<{
    proposalPrimaryColor?: string;
    proposalShowLogo?: boolean;
    logoUrl?: string;
  } | null>({
    queryKey: ['/api/company-settings'],
  });

  const companyColor = companySettings?.proposalPrimaryColor || '#3B82F6';
  const companyShowLogo = companySettings?.proposalShowLogo;
  const companyLogoUrl = companySettings?.logoUrl || '';

  // Best-effort permission probe: assume any authenticated user with company
  // settings access can write defaults; if PATCH 403s the toast surfaces it.
  // Expose a simple "edit defaults" toggle so non-admins see read-only values.
  const [editCompanyDefaults, setEditCompanyDefaults] = useState(false);

  const [primaryColor, setPrimaryColor] = useState<string>(settings.primaryColor || companyColor);
  const [showPageNumbers, setShowPageNumbers] = useState<boolean>(settings.showPageNumbers ?? true);
  const [showFooter, setShowFooter] = useState<boolean>(settings.showFooter ?? true);
  const [pageSize, setPageSize] = useState<string>(settings.pageSize || 'A4');
  const [pricingMode, setPricingMode] = useState<PricingMode>(settings.pricingMode || 'itemised');
  const [showGst, setShowGst] = useState<boolean>(settings.showGst ?? true);
  const [showLogo, setShowLogo] = useState<boolean>(
    settings.showLogo ?? (companyShowLogo ?? !!companyLogoUrl),
  );
  const [preset, setPreset] = useState<string>(settings.preset || '');

  // Re-sync when settings or company defaults arrive
  useEffect(() => {
    if (!settings.primaryColor && companyColor) setPrimaryColor(companyColor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyColor]);

  // Mirror primaryColor's resync for showLogo so the switch reflects the
  // company default once /api/company-settings resolves. Proposal-level
  // override (settings.showLogo) always wins; otherwise prefer
  // companySettings.proposalShowLogo, falling back to logoUrl presence only
  // when the company has no explicit policy.
  useEffect(() => {
    if (settings.showLogo !== undefined) return;
    setShowLogo(companyShowLogo ?? !!companyLogoUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyShowLogo, companyLogoUrl]);

  const saveLayoutMutation = useMutation({
    mutationFn: async (layoutSettings: LayoutSettings) => {
      return await apiRequest(`/api/proposals/${proposal.id}`, 'PATCH', { layoutSettings });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/proposals', proposal.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/proposals'] });
      toast({ title: 'Layout saved' });
    },
  });

  const saveCompanyColorMutation = useMutation({
    mutationFn: async (proposalPrimaryColor: string) => {
      return await apiRequest('/api/company-settings', 'PATCH', { proposalPrimaryColor });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company-settings'] });
      toast({ title: 'Company default saved' });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : 'You may not have permission to edit company defaults';
      toast({ title: 'Could not save default', description: msg, variant: 'destructive' });
    },
  });

  const saveCompanyShowLogoMutation = useMutation({
    mutationFn: async (proposalShowLogo: boolean) => {
      return await apiRequest('/api/company-settings', 'PATCH', { proposalShowLogo });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company-settings'] });
      toast({ title: 'Company default saved' });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : 'You may not have permission to edit company defaults';
      toast({ title: 'Could not save default', description: msg, variant: 'destructive' });
    },
  });

  const handleSave = () => {
    saveLayoutMutation.mutate({
      primaryColor,
      showPageNumbers,
      showFooter,
      pageSize,
      pricingMode,
      showGst,
      showLogo,
      preset: (preset || undefined) as LayoutSettings['preset'],
    });
  };

  const applyPreset = (name: string) => {
    setPreset(name);
    const p = LAYOUT_PRESETS[name as PresetKey];
    if (!p) return;
    if (p.pageSize) setPageSize(p.pageSize);
    if (p.showFooter !== undefined) setShowFooter(!!p.showFooter);
    if (p.showPageNumbers !== undefined) setShowPageNumbers(!!p.showPageNumbers);
    if (p.showLogo !== undefined) setShowLogo(!!p.showLogo);
    if (p.showGst !== undefined) setShowGst(!!p.showGst);
    if (p.pricingMode) setPricingMode(p.pricingMode);

    // Bundle section enable/disable toggles per preset. Each preset names the
    // section types that should be enabled; everything else is disabled. We
    // call onSectionUpdate per affected section so the existing autosave
    // pipeline persists the change.
    const enabledTypes = PRESET_ENABLED_SECTION_TYPES[name as PresetKey];
    if (enabledTypes) {
      for (const s of sections) {
        const shouldEnable = enabledTypes.has(s.sectionType || 'custom');
        if ((s.isEnabled !== false) !== shouldEnable) {
          onSectionUpdate(s.id, { isEnabled: shouldEnable });
        }
      }
    }
  };

  // Estimate sections — column visibility per section
  const estimateSections = sections.filter((s) => s.sectionType === 'estimate');

  // Renderer defaults for legacy estimate sections that have neither
  // `visibleColumns` nor explicit `columnToggles` saved. Mirrors the
  // canonical 5-column spec so the checkbox UI matches what the PDF shows.
  const DEFAULT_VISIBLE_COLUMN_KEYS = new Set([
    'description', 'quantity', 'unit', 'unitCostIncTax', 'amountIncTax',
  ]);

  const updateVisibleColumns = (section: ProposalSection, columnKey: string, on: boolean) => {
    const content = (section.content as Record<string, any>) || {};
    let current: string[];
    if (Array.isArray(content.visibleColumns)) {
      current = content.visibleColumns;
    } else if (content.columnToggles && typeof content.columnToggles === 'object') {
      const t = content.columnToggles as Record<string, boolean>;
      current = ESTIMATE_COLUMNS.filter((c) => t[c.key] === true).map((c) => c.key);
    } else {
      // Legacy section with no saved visibility config — start from the same
      // renderer defaults the checkbox UI shows so the first toggle only
      // changes the one column the user clicked.
      current = ESTIMATE_COLUMNS.filter((c) => DEFAULT_VISIBLE_COLUMN_KEYS.has(c.key)).map((c) => c.key);
    }
    const next = on ? Array.from(new Set([...current, columnKey])) : current.filter((k) => k !== columnKey);
    onSectionUpdate(section.id, {
      content: { ...content, visibleColumns: next },
    } as Partial<ProposalSection>);
  };

  const isColumnVisible = (section: ProposalSection, columnKey: string): boolean => {
    const content = (section.content as Record<string, any>) || {};
    if (Array.isArray(content.visibleColumns)) {
      return content.visibleColumns.includes(columnKey);
    }
    if (content.columnToggles && typeof content.columnToggles === 'object') {
      return (content.columnToggles as Record<string, boolean>)[columnKey] === true;
    }
    return DEFAULT_VISIBLE_COLUMN_KEYS.has(columnKey);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Quick-setup preset</Label>
        <Select value={preset} onValueChange={applyPreset}>
          <SelectTrigger data-testid="select-layout-preset">
            <SelectValue placeholder="Choose a preset" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="lump_sum_quote">Lump Sum Quote</SelectItem>
            <SelectItem value="itemised_quote">Itemised Quote</SelectItem>
            <SelectItem value="standard_residential">Standard Residential</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label htmlFor="layout-primary-color">
          Primary colour <span className="text-xs text-muted-foreground">(company default)</span>
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id="layout-primary-color"
            type="color"
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
            disabled={!editCompanyDefaults && primaryColor === companyColor}
            data-testid="input-layout-primary-color"
            className="w-16 h-9 p-1"
          />
          <Input
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
            disabled={!editCompanyDefaults && primaryColor === companyColor}
            className="flex-1"
            data-testid="input-layout-primary-color-text"
          />
        </div>
        <div className="flex items-center justify-between gap-2 text-xs">
          <button
            type="button"
            className="text-primary underline-offset-2 hover:underline"
            onClick={() => setEditCompanyDefaults((v) => !v)}
            data-testid="button-toggle-edit-company-defaults"
          >
            {editCompanyDefaults ? 'Lock company defaults' : 'Edit company defaults'}
          </button>
          {editCompanyDefaults && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => saveCompanyColorMutation.mutate(primaryColor)}
              disabled={saveCompanyColorMutation.isPending}
              data-testid="button-save-company-color"
            >
              {saveCompanyColorMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
              Save as company default
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="layout-page-size">Page size</Label>
        <Select value={pageSize} onValueChange={setPageSize}>
          <SelectTrigger id="layout-page-size" data-testid="select-layout-page-size">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="A4">A4</SelectItem>
            <SelectItem value="LETTER">US Letter</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Pricing display</Label>
        <div
          className="grid grid-cols-3 gap-1 p-1 bg-muted rounded-md"
          role="radiogroup"
          data-testid="segmented-pricing-display"
        >
          {PRICING_MODE_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              size="sm"
              variant={pricingMode === opt.value ? 'default' : 'ghost'}
              onClick={() => setPricingMode(opt.value)}
              data-testid={`button-pricing-${opt.value}`}
            >
              {opt.label}
            </Button>
          ))}
        </div>
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
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="layout-logo">
            Show company logo <span className="text-xs text-muted-foreground">(company default)</span>
          </Label>
          <Switch
            id="layout-logo"
            checked={showLogo}
            disabled={!editCompanyDefaults && companyShowLogo !== undefined && showLogo === companyShowLogo}
            onCheckedChange={setShowLogo}
            data-testid="switch-layout-logo"
          />
        </div>
        {editCompanyDefaults && (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => saveCompanyShowLogoMutation.mutate(showLogo)}
              disabled={saveCompanyShowLogoMutation.isPending}
              data-testid="button-save-company-show-logo"
            >
              {saveCompanyShowLogoMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
              Save logo policy as company default
            </Button>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="layout-gst">Show GST</Label>
        <Switch
          id="layout-gst"
          checked={showGst}
          onCheckedChange={setShowGst}
          data-testid="switch-layout-gst"
        />
      </div>

      {estimateSections.length > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <Label>Estimate columns visible in PDF</Label>
            {estimateSections.map((s) => (
              <div key={s.id} className="border rounded-md p-3 space-y-2" data-testid={`layout-estimate-${s.id}`}>
                <p className="text-xs font-medium">{s.name}</p>
                <div className="grid grid-cols-2 gap-2">
                  {ESTIMATE_COLUMNS.map((col) => {
                    const checked = isColumnVisible(s, col.key);
                    return (
                      <label
                        key={col.key}
                        className="flex items-center gap-2 text-xs cursor-pointer"
                        data-testid={`checkbox-col-${s.id}-${col.key}`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => updateVisibleColumns(s, col.key, !!v)}
                        />
                        <span>{col.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Button onClick={handleSave} disabled={saveLayoutMutation.isPending} className="w-full" data-testid="button-save-layout">
        {saveLayoutMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Save Layout
      </Button>
    </div>
  );
}

// --- Estimate Revision Selector (sibling estimates) ---
interface EstimateRevisionSelectorProps {
  proposalId: string;
  currentEstimateId: string | null;
  projectId: string;
  onPick: (id: string) => void;
}

function EstimateRevisionSelector({ proposalId, currentEstimateId, projectId, onPick }: EstimateRevisionSelectorProps) {
  const { toast } = useToast();
  const { data: allEstimates = [] } = useQuery<Estimate[]>({
    queryKey: ['/api/estimates'],
  });
  // Also read the proposal so we can anchor revision lineage to the
  // proposal-level estimateId when no section-specific pick is set yet.
  const { data: proposal } = useQuery<Proposal>({
    queryKey: ['/api/proposals', proposalId],
  });
  const projectEstimates = allEstimates.filter((e) => e.projectId === projectId);
  const anchorId = currentEstimateId || proposal?.estimateId || null;
  const current = projectEstimates.find((e) => e.id === anchorId) || null;
  const parentId = (current?.parentEstimateId as string | null | undefined) || current?.id || null;

  // Sibling revisions = same parent (or itself)
  const siblings = parentId
    ? projectEstimates.filter((e) => e.id === parentId || e.parentEstimateId === parentId)
    : projectEstimates;
  const ordered = [...siblings].sort((a, b) => (a.version || 1) - (b.version || 1));

  const persistMutation = useMutation({
    mutationFn: async (estimateId: string) => {
      // Persist the chosen revision both on the proposal (proposals.estimateId)
      // and on the local section content.
      return await apiRequest(`/api/proposals/${proposalId}`, 'PATCH', { estimateId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/proposals', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['/api/proposals'] });
    },
    onError: () => {
      toast({ title: 'Could not link estimate revision', variant: 'destructive' });
    },
  });

  if (ordered.length === 0) return null;

  return (
    <div className="space-y-1">
      <Label className="text-xs">Estimate revision</Label>
      <Select
        value={currentEstimateId || ''}
        onValueChange={(v) => {
          if (!v) return;
          onPick(v);
          persistMutation.mutate(v);
        }}
      >
        <SelectTrigger className="h-8 text-xs" data-testid="select-estimate-revision">
          <SelectValue placeholder="Choose a revision…" />
        </SelectTrigger>
        <SelectContent>
          {ordered.map((e) => (
            <SelectItem key={e.id} value={e.id} className="text-xs">
              {revisionLabel(e.version)} — {e.name}
              {e.status ? ` (${e.status})` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// --- Payment Schedule Editor ---
interface PaymentScheduleEditorProps {
  proposalId: string;
}

interface DraftMilestone {
  name: string;
  percentage: number | null;
  amountCents: number | null;
  description: string | null;
  order: number;
  mode: '%' | '$';
}

// Default milestone seed for residential builds (% must total 100).
// Spec: Deposit 10, Slab 10, Frame 15, Lock-up 15, Fit-off 20, Practical Completion 30.
const DEFAULT_MILESTONE_SEED: DraftMilestone[] = [
  { name: 'Deposit', percentage: 10, amountCents: null, description: 'On signing', order: 0, mode: '%' },
  { name: 'Slab', percentage: 10, amountCents: null, description: 'On completion of slab', order: 1, mode: '%' },
  { name: 'Frame', percentage: 15, amountCents: null, description: 'On completion of structural frame', order: 2, mode: '%' },
  { name: 'Lock-up', percentage: 15, amountCents: null, description: 'On building lock-up', order: 3, mode: '%' },
  { name: 'Fit-off', percentage: 20, amountCents: null, description: 'On completion of fit-off', order: 4, mode: '%' },
  { name: 'Practical Completion', percentage: 30, amountCents: null, description: 'On handover', order: 5, mode: '%' },
];

interface SortableMilestoneProps {
  id: string;
  milestone: DraftMilestone;
  index: number;
  onUpdate: (idx: number, patch: Partial<DraftMilestone>) => void;
  onRemove: (idx: number) => void;
}

function SortableMilestone({ id, milestone, index, onUpdate, onRemove }: SortableMilestoneProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} className="border rounded-md p-2 space-y-2 bg-background">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
          data-testid={`drag-milestone-${index}`}
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </button>
        <Input
          placeholder="Milestone name"
          value={milestone.name}
          onChange={(e) => onUpdate(index, { name: e.target.value })}
          className="flex-1"
          data-testid={`input-milestone-name-${index}`}
        />
        <div className="flex items-center rounded-md border p-0.5" role="radiogroup" data-testid={`mode-toggle-${index}`}>
          <Button
            size="sm"
            variant={milestone.mode === '%' ? 'default' : 'ghost'}
            onClick={() => onUpdate(index, { mode: '%' })}
            className="h-7 px-2 text-xs"
            data-testid={`button-mode-pct-${index}`}
          >
            %
          </Button>
          <Button
            size="sm"
            variant={milestone.mode === '$' ? 'default' : 'ghost'}
            onClick={() => onUpdate(index, { mode: '$' })}
            className="h-7 px-2 text-xs"
            data-testid={`button-mode-amt-${index}`}
          >
            $
          </Button>
        </div>
        {milestone.mode === '%' ? (
          <Input
            placeholder="%"
            type="number"
            value={milestone.percentage ?? ''}
            onChange={(e) =>
              onUpdate(index, {
                percentage: e.target.value === '' ? null : Number(e.target.value),
                amountCents: null,
              })
            }
            className="w-20"
            data-testid={`input-milestone-pct-${index}`}
          />
        ) : (
          <Input
            placeholder="$"
            type="number"
            value={milestone.amountCents != null ? milestone.amountCents / 100 : ''}
            onChange={(e) =>
              onUpdate(index, {
                amountCents: e.target.value === '' ? null : Math.round(Number(e.target.value) * 100),
                percentage: null,
              })
            }
            className="w-24"
            data-testid={`input-milestone-amt-${index}`}
          />
        )}
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onRemove(index)}
          data-testid={`button-remove-milestone-${index}`}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
      <Input
        placeholder="Description (optional)"
        value={milestone.description ?? ''}
        onChange={(e) => onUpdate(index, { description: e.target.value })}
        className="text-xs"
        data-testid={`input-milestone-desc-${index}`}
      />
    </div>
  );
}

function PaymentScheduleEditor({ proposalId }: PaymentScheduleEditorProps) {
  const { toast } = useToast();
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const { data: milestones = [], isFetched: milestonesFetched } = useQuery<ProposalPaymentMilestone[]>({
    queryKey: ['/api/proposals', proposalId, 'milestones'],
  });
  const { data: companySettings } = useQuery<{ paymentScheduleTemplates?: Array<{ id: string; name: string; milestones: DraftMilestone[] }> } | null>({
    queryKey: ['/api/company-settings'],
  });

  const [draft, setDraft] = useState<DraftMilestone[]>([]);
  const [templateName, setTemplateName] = useState('');
  const hasAutoSeededRef = useRef(false);
  // Hash of the last payload we either received from the server or sent to
  // it. Used to break the "save → invalidate → refetch → setDraft → save"
  // ping-pong loop: if the draft serialises to the same value, autosave
  // becomes a no-op.
  const lastSyncedHashRef = useRef<string>('');

  const draftToPayload = (items: DraftMilestone[]) =>
    items.map((m, i) => ({
      name: m.name || `Milestone ${i + 1}`,
      percentage: m.mode === '%' ? m.percentage : null,
      amountCents: m.mode === '$' ? m.amountCents : null,
      description: m.description || null,
      order: i,
    }));

  useEffect(() => {
    const hydrated = milestones.map((m, i) => ({
      name: m.name,
      percentage: m.percentage != null ? Number(m.percentage) : null,
      amountCents: m.amountCents != null ? Number(m.amountCents) : null,
      description: m.description ?? null,
      order: i,
      mode: (m.amountCents != null && m.percentage == null ? '$' : '%') as '%' | '$',
    }));
    setDraft(hydrated);
    // Mark this payload as already in sync with the server so the
    // subsequent autosave effect tick treats it as a no-op.
    lastSyncedHashRef.current = JSON.stringify(draftToPayload(hydrated));
  }, [milestones]);

  const replaceMutation = useMutation({
    mutationFn: async (items: DraftMilestone[]) => {
      const payload = draftToPayload(items);
      const result = await apiRequest(`/api/proposals/${proposalId}/milestones`, 'PUT', {
        milestones: payload,
      });
      // Record the hash *before* invalidating so the refetch's setDraft
      // doesn't trigger another autosave.
      lastSyncedHashRef.current = JSON.stringify(payload);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/proposals', proposalId, 'milestones'] });
    },
    onError: () => {
      toast({ title: 'Could not save schedule', variant: 'destructive' });
    },
  });

  // Optimistic auto-save: persist any change to the milestone draft after a
  // short debounce. Skips saves when the draft already matches the last
  // server payload to avoid the invalidate/refetch/save loop.
  useEffect(() => {
    if (draft.length === 0) return;
    const payloadHash = JSON.stringify(draftToPayload(draft));
    if (payloadHash === lastSyncedHashRef.current) return;
    const handle = setTimeout(() => {
      replaceMutation.mutate(draft);
    }, 800);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const saveTemplateMutation = useMutation({
    mutationFn: async (template: { name: string; milestones: DraftMilestone[] }) => {
      const next = [...(companySettings?.paymentScheduleTemplates || []), {
        id: `tpl-${Date.now()}`,
        name: template.name,
        milestones: template.milestones,
      }];
      return await apiRequest('/api/company-settings', 'PATCH', { paymentScheduleTemplates: next });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company-settings'] });
      toast({ title: 'Template saved' });
      setTemplateName('');
    },
    onError: () => {
      toast({ title: 'Could not save template', variant: 'destructive' });
    },
  });

  const addRow = () =>
    setDraft([...draft, { name: '', percentage: null, amountCents: null, description: null, order: draft.length, mode: '%' }]);
  const removeRow = (idx: number) => setDraft(draft.filter((_, i) => i !== idx).map((r, i) => ({ ...r, order: i })));
  const updateRow = (idx: number, patch: Partial<DraftMilestone>) =>
    setDraft(draft.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const seedDefault = () => setDraft(DEFAULT_MILESTONE_SEED);

  // Auto-seed default milestones the first time a payment schedule is opened
  // with no existing milestones. We wait for the milestones query to actually
  // resolve from the server (isFetched) before seeding, otherwise the default
  // empty array from useQuery would cause us to overwrite a proposal that
  // already has a saved schedule.
  useEffect(() => {
    if (hasAutoSeededRef.current) return;
    if (!milestonesFetched) return;
    if (milestones.length > 0) {
      hasAutoSeededRef.current = true;
      return;
    }
    if (replaceMutation.isPending) return;
    hasAutoSeededRef.current = true;
    setDraft(DEFAULT_MILESTONE_SEED);
    replaceMutation.mutate(DEFAULT_MILESTONE_SEED);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milestones, milestonesFetched]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = draft.findIndex((_, i) => `m-${i}` === active.id);
    const newIndex = draft.findIndex((_, i) => `m-${i}` === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setDraft(arrayMove(draft, oldIndex, newIndex).map((r, i) => ({ ...r, order: i })));
  };

  const totalPct = draft.filter((m) => m.mode === '%').reduce((s, m) => s + (Number(m.percentage) || 0), 0);
  const totalAmt = draft.filter((m) => m.mode === '$').reduce((s, m) => s + (Number(m.amountCents) || 0), 0);

  return (
    <div className="space-y-3" data-testid="payment-schedule-editor">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Label>Payment Schedule</Label>
        <div className="flex gap-2">
          {draft.length === 0 && (
            <Button size="sm" variant="outline" onClick={seedDefault} data-testid="button-seed-milestones">
              Use default
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={addRow} data-testid="button-add-milestone">
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </div>
      </div>

      {(companySettings?.paymentScheduleTemplates?.length ?? 0) > 0 && (
        <div className="space-y-2">
          <Label className="text-xs">Load template</Label>
          <Select
            onValueChange={(id) => {
              const tpl = companySettings?.paymentScheduleTemplates?.find((t) => t.id === id);
              if (tpl) setDraft(tpl.milestones.map((m, i) => ({ ...m, order: i })));
            }}
          >
            <SelectTrigger data-testid="select-load-payment-template">
              <SelectValue placeholder="Choose a saved template..." />
            </SelectTrigger>
            <SelectContent>
              {companySettings!.paymentScheduleTemplates!.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={draft.map((_, i) => `m-${i}`)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {draft.map((m, idx) => (
              <SortableMilestone
                key={`m-${idx}`}
                id={`m-${idx}`}
                milestone={m}
                index={idx}
                onUpdate={updateRow}
                onRemove={removeRow}
              />
            ))}
            {draft.length === 0 && (
              <p className="text-xs text-muted-foreground">No milestones — click Add or Use default.</p>
            )}
          </div>
        </SortableContext>
      </DndContext>

      <div className="flex items-center justify-between text-xs gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge
            variant={Math.abs(totalPct - 100) < 0.01 ? 'secondary' : 'destructive'}
            className="text-xs"
            data-testid="badge-milestone-total-percent"
          >
            Total: {totalPct.toFixed(2)}%
          </Badge>
          {totalAmt > 0 && (
            <span className="text-muted-foreground">+ ${(totalAmt / 100).toFixed(2)}</span>
          )}
          {replaceMutation.isPending && (
            <span className="text-muted-foreground inline-flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Saving…
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => replaceMutation.mutate(draft)}
          disabled={replaceMutation.isPending}
          data-testid="button-save-milestones"
        >
          {replaceMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
          Save Now
        </Button>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label className="text-xs">Save current as template</Label>
        <div className="flex gap-2">
          <Input
            placeholder="Template name"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            className="flex-1"
            data-testid="input-template-name"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!templateName.trim() || draft.length === 0 || saveTemplateMutation.isPending}
            onClick={() => saveTemplateMutation.mutate({ name: templateName.trim(), milestones: draft })}
            data-testid="button-save-template"
          >
            {saveTemplateMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

// --- Revision History Panel ---
interface RevisionHistoryPanelProps {
  proposal: Proposal;
  projectId?: string;
  // Optional: parent supplies the proposal's sections + section-update
  // callback so the top-level estimate revision selector can also sync
  // every estimate section's `content.estimateId` (not just rely on the
  // section-level fallback to `proposals.estimateId`).
  sections?: ProposalSection[];
  onSectionUpdate?: (sectionId: string, updates: Partial<ProposalSection>) => void;
}

export function RevisionHistoryPanel({ proposal, projectId, sections, onSectionUpdate }: RevisionHistoryPanelProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const parentId = proposal.parentProposalId || proposal.id;
  const isSuperseded = proposal.status === 'superseded';

  const { data: siblings = [] } = useQuery<Proposal[]>({
    queryKey: ['/api/proposals', 'revisions', parentId],
    queryFn: async () => {
      const res = await fetch(`/api/proposals?parentId=${encodeURIComponent(parentId)}`);
      if (!res.ok) return [];
      const all = (await res.json()) as Proposal[];
      return all.filter((p) => p.id === parentId || p.parentProposalId === parentId);
    },
  });

  const newRevisionMutation = useMutation({
    mutationFn: async (): Promise<Proposal> => {
      const res = await apiRequest(`/api/proposals/${proposal.id}/new-revision`, 'POST', {});
      return (await res.json()) as Proposal;
    },
    onSuccess: (newProposal) => {
      queryClient.invalidateQueries({ queryKey: ['/api/proposals'] });
      toast({ title: 'Revision created', description: `v${newProposal.version} is ready to edit.` });
      if (newProposal?.id) {
        const path = newProposal.projectId
          ? `/projects/${newProposal.projectId}/proposals/${newProposal.id}`
          : `/proposals/${newProposal.id}`;
        setLocation(path);
      }
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : 'Could not create revision';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    },
  });

  const ordered = [...siblings].sort((a, b) => (a.version || 1) - (b.version || 1));

  return (
    <div className="space-y-3" data-testid="revision-history-panel">
      {isSuperseded && (
        <div
          className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-3 text-xs space-y-1"
          data-testid="banner-superseded"
        >
          <p className="font-medium">This revision has been superseded — clients cannot accept this revision.</p>
          <p className="text-muted-foreground">A newer version exists. Edits and acceptance should be made on the latest revision.</p>
        </div>
      )}

      <Button
        size="sm"
        className="w-full"
        onClick={() => newRevisionMutation.mutate()}
        disabled={newRevisionMutation.isPending}
        data-testid="button-create-revision"
      >
        {newRevisionMutation.isPending ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Copy className="w-4 h-4 mr-2" />
        )}
        Create new revision
      </Button>

      {proposal.shareToken && (
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={() => {
            const url = `${window.location.origin}/portal/proposal/${proposal.id}?token=${encodeURIComponent(proposal.shareToken)}`;
            navigator.clipboard.writeText(url).then(
              () => toast({ title: 'Share link copied', description: 'Send this link to your client.' }),
              () => toast({ title: 'Copy failed', variant: 'destructive' as const }),
            );
          }}
          data-testid="button-copy-share-link"
        >
          <Copy className="w-4 h-4 mr-2" />
          Copy client share link
        </Button>
      )}

      {projectId && (
        <div className="space-y-1 border-t pt-3">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <FileText className="w-3 h-3" /> Linked estimate revision
          </div>
          <EstimateRevisionSelector
            proposalId={proposal.id}
            projectId={projectId}
            currentEstimateId={proposal.estimateId || null}
            onPick={(newEstimateId) => {
              // The selector also persists to proposals.estimateId; refresh
              // proposal cache so downstream consumers see the new link.
              queryClient.invalidateQueries({ queryKey: ['/api/proposals', proposal.id] });
              // Authoritative sync: also update every estimate section's
              // content.estimateId so sections that had an explicit pick
              // switch to the new revision rather than retaining stale data.
              if (sections && onSectionUpdate) {
                for (const s of sections) {
                  if (s.sectionType !== 'estimate') continue;
                  const c = (s.content as Record<string, unknown> | null) ?? {};
                  if (c.estimateId === newEstimateId) continue;
                  onSectionUpdate(s.id, { content: { ...c, estimateId: newEstimateId } });
                }
              }
            }}
          />
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <History className="w-3 h-3" /> Revision history
        </div>
        {ordered.length === 0 ? (
          <p className="text-xs text-muted-foreground">No revisions yet.</p>
        ) : (
          ordered.map((p) => {
            const isCurrent = p.id === proposal.id;
            const sentDate = p.sentDate;
            const status = (p.status || 'draft') as string;
            const statusVariant: 'default' | 'secondary' | 'destructive' | 'outline' =
              status === 'accepted'
                ? 'default'
                : status === 'rejected'
                ? 'destructive'
                : status === 'sent' || status === 'viewed'
                ? 'secondary'
                : 'outline';
            const StatusIcon =
              status === 'accepted'
                ? CheckCircle
                : status === 'rejected'
                ? XCircle
                : status === 'sent' || status === 'viewed'
                ? Send
                : status === 'superseded'
                ? FileCheck
                : FileText;
            return (
              <div
                key={p.id}
                className={`flex items-start gap-2 border rounded-md px-2 py-2 text-sm ${isCurrent ? 'bg-muted' : ''}`}
                data-testid={`revision-item-${p.id}`}
              >
                <StatusIcon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium" data-testid={`revision-label-${p.id}`}>
                      {revisionLabel(p.version)}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                    <span>#{p.proposalNumber}</span>
                    {sentDate && (
                      <span data-testid={`revision-sent-date-${p.id}`}>
                        Sent {formatDate(new Date(sentDate), 'd MMM yyyy')}
                      </span>
                    )}
                  </div>
                </div>
                <Badge variant={statusVariant} className="text-xs capitalize" data-testid={`revision-status-${p.id}`}>
                  {status}
                </Badge>
                {!isCurrent && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      const path = p.projectId
                        ? `/projects/${p.projectId}/proposals/${p.id}`
                        : `/proposals/${p.id}`;
                      setLocation(path);
                    }}
                    data-testid={`button-open-revision-${p.id}`}
                    aria-label="Open revision"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
