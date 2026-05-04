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
import { GripVertical, Plus, Download, Eye, Loader2, Trash2, Copy, History, FileText, ArrowRight } from 'lucide-react';
import { useLocation } from 'wouter';
import type { Proposal, ProposalSection, Project, ProposalPaymentMilestone, ProposalAcceptance, Contact } from '@shared/schema';
import { ProposalDocument } from './pdf/ProposalDocument';
import { PDFPreview } from './PDFPreview';
import { EstimateEditor } from './SectionEditor';
import { RichTextEditor } from '@/components/RichTextEditor';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';

// --- Placeholder dropdown ---
const PROPOSAL_PLACEHOLDERS = [
  { token: '{{client.name}}', label: 'Client Name' },
  { token: '{{client.email}}', label: 'Client Email' },
  { token: '{{project.name}}', label: 'Project Name' },
  { token: '{{project.address}}', label: 'Project Address' },
  { token: '{{proposal.number}}', label: 'Proposal Number' },
  { token: '{{proposal.total}}', label: 'Proposal Total' },
  { token: '{{company.name}}', label: 'Company Name' },
  { token: '{{date.today}}', label: 'Today\'s Date' },
];

function PlaceholderHint() {
  const { toast } = useToast();
  return (
    <div className="flex items-center gap-2 mb-1">
      <Select
        onValueChange={(v) => {
          if (!v) return;
          navigator.clipboard.writeText(v).then(
            () => toast({ title: 'Copied', description: `${v} copied to clipboard` }),
            () => toast({ title: 'Copy failed', variant: 'destructive' as const }),
          );
        }}
      >
        <SelectTrigger className="h-7 w-44 text-xs" data-testid="select-placeholder">
          <SelectValue placeholder="Insert placeholder" />
        </SelectTrigger>
        <SelectContent>
          {PROPOSAL_PLACEHOLDERS.map((p) => (
            <SelectItem key={p.token} value={p.token} className="text-xs">
              {p.label} — <span className="font-mono ml-1">{p.token}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-[10px] text-muted-foreground">Click to copy &amp; paste into editor</span>
    </div>
  );
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
                <PlaceholderHint />
                <RichTextEditor
                  content={localContent.letterText || ""}
                  onChange={(html) => setLocalContent({ ...localContent, letterText: html })}
                  placeholder="Enter your cover letter text..."
                />
              </div>
            )}

            {section.sectionType === "scope" && (
              <div className="space-y-2">
                <Label>Scope of Work</Label>
                <PlaceholderHint />
                <RichTextEditor
                  content={localContent.scopeText || ""}
                  onChange={(html) => setLocalContent({ ...localContent, scopeText: html })}
                  placeholder="Describe the scope of work..."
                />
              </div>
            )}

            {(section.sectionType === "closing_letter" || section.sectionType === "closing") && (
              <div className="space-y-2">
                <Label>Closing Content</Label>
                <PlaceholderHint />
                <RichTextEditor
                  content={localContent.closingText || ""}
                  onChange={(html) => setLocalContent({ ...localContent, closingText: html })}
                  placeholder="Enter your closing text..."
                />
              </div>
            )}

            {section.sectionType === "summary" && (
              <div className="space-y-2">
                <Label>Summary Content</Label>
                <PlaceholderHint />
                <RichTextEditor
                  content={localContent.summaryText || ""}
                  onChange={(html) => setLocalContent({ ...localContent, summaryText: html })}
                  placeholder="Enter project summary..."
                />
              </div>
            )}

            {section.sectionType === "allowances" && (
              <div className="space-y-2">
                <Label>Allowances Notes</Label>
                <PlaceholderHint />
                <RichTextEditor
                  content={localContent.allowancesText || ""}
                  onChange={(html) => setLocalContent({ ...localContent, allowancesText: html })}
                  placeholder="Optional notes on allowances..."
                />
              </div>
            )}

            {section.sectionType === "inclusions_exclusions" && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Inclusions</Label>
                  <PlaceholderHint />
                  <RichTextEditor
                    content={localContent.inclusionsText || ""}
                    onChange={(html) => setLocalContent({ ...localContent, inclusionsText: html })}
                    placeholder="What is included..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Exclusions</Label>
                  <RichTextEditor
                    content={localContent.exclusionsText || ""}
                    onChange={(html) => setLocalContent({ ...localContent, exclusionsText: html })}
                    placeholder="What is excluded..."
                  />
                </div>
              </div>
            )}

            {section.sectionType === "terms_conditions" && (
              <div className="space-y-2">
                <Label>Terms &amp; Conditions</Label>
                <PlaceholderHint />
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
                <PlaceholderHint />
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
          .filter((s) => {
            const c = (s.content as Record<string, unknown> | null) ?? {};
            return s.sectionType === 'estimate' && typeof c.estimateId === 'string';
          })
          .map((s) => ((s.content as Record<string, unknown>).estimateId as string));

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
  }, [proposal, sections, project, client, companyLogo, companyName, primaryColor, showPreview, milestones, latestAcceptance]);

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
                  companyLogo={companyLogo}
                  companyName={companyName}
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
            <TabsTrigger value="revisions" className="flex-1" data-testid="tab-revisions">Revisions</TabsTrigger>
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
            <LayoutPanel proposal={proposal} />
          </TabsContent>

          <TabsContent value="revisions" className="flex-1 min-h-0 mt-4 overflow-auto">
            <RevisionHistoryPanel proposal={proposal} />
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

type LayoutSettings = {
  primaryColor?: string;
  showPageNumbers?: boolean;
  showFooter?: boolean;
  pageSize?: string;
  pricingDisplay?: 'show' | 'hide' | 'summary';
  showGst?: boolean;
  showLogo?: boolean;
  preset?: 'classic' | 'modern' | 'minimal';
};

const LAYOUT_PRESETS: Record<string, Partial<LayoutSettings>> = {
  classic: { primaryColor: '#1F2937', pageSize: 'A4', showFooter: true, showPageNumbers: true, showLogo: true, pricingDisplay: 'show' },
  modern: { primaryColor: '#3B82F6', pageSize: 'A4', showFooter: true, showPageNumbers: false, showLogo: true, pricingDisplay: 'show' },
  minimal: { primaryColor: '#6B7280', pageSize: 'A4', showFooter: false, showPageNumbers: false, showLogo: false, pricingDisplay: 'summary' },
};

function LayoutPanel({ proposal }: LayoutPanelProps) {
  const settings = (proposal.layoutSettings as LayoutSettings) || {};
  const [primaryColor, setPrimaryColor] = useState<string>(settings.primaryColor || '#3B82F6');
  const [showPageNumbers, setShowPageNumbers] = useState<boolean>(settings.showPageNumbers ?? true);
  const [showFooter, setShowFooter] = useState<boolean>(settings.showFooter ?? true);
  const [pageSize, setPageSize] = useState<string>(settings.pageSize || 'A4');
  const [pricingDisplay, setPricingDisplay] = useState<'show' | 'hide' | 'summary'>(settings.pricingDisplay || 'show');
  const [showGst, setShowGst] = useState<boolean>(settings.showGst ?? true);
  const [showLogo, setShowLogo] = useState<boolean>(settings.showLogo ?? true);
  const [preset, setPreset] = useState<string>(settings.preset || '');

  const saveLayoutMutation = useMutation({
    mutationFn: async (layoutSettings: LayoutSettings) => {
      return await apiRequest(`/api/proposals/${proposal.id}`, 'PATCH', { layoutSettings });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/proposals', proposal.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/proposals'] });
    },
  });

  const handleSave = () => {
    saveLayoutMutation.mutate({
      primaryColor,
      showPageNumbers,
      showFooter,
      pageSize,
      pricingDisplay,
      showGst,
      showLogo,
      preset: (preset || undefined) as LayoutSettings['preset'],
    });
  };

  const applyPreset = (name: string) => {
    setPreset(name);
    const p = LAYOUT_PRESETS[name];
    if (!p) return;
    if (p.primaryColor) setPrimaryColor(p.primaryColor);
    if (p.pageSize) setPageSize(p.pageSize);
    if (p.showFooter !== undefined) setShowFooter(!!p.showFooter);
    if (p.showPageNumbers !== undefined) setShowPageNumbers(!!p.showPageNumbers);
    if (p.showLogo !== undefined) setShowLogo(!!p.showLogo);
    if (p.pricingDisplay) setPricingDisplay(p.pricingDisplay);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Preset</Label>
        <Select value={preset} onValueChange={applyPreset}>
          <SelectTrigger data-testid="select-layout-preset">
            <SelectValue placeholder="Choose a preset" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="classic">Classic</SelectItem>
            <SelectItem value="modern">Modern</SelectItem>
            <SelectItem value="minimal">Minimal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator />

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
          {(['show', 'summary', 'hide'] as const).map((opt) => (
            <Button
              key={opt}
              size="sm"
              variant={pricingDisplay === opt ? 'default' : 'ghost'}
              onClick={() => setPricingDisplay(opt)}
              className="capitalize"
              data-testid={`button-pricing-${opt}`}
            >
              {opt}
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
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="layout-logo">Show logo</Label>
        <Switch
          id="layout-logo"
          checked={showLogo}
          onCheckedChange={setShowLogo}
          data-testid="switch-layout-logo"
        />
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

interface DraftMilestone {
  name: string;
  percentage: number | null;
  amountCents: number | null;
  description: string | null;
  order: number;
  mode: '%' | '$';
}

const DEFAULT_MILESTONE_SEED: DraftMilestone[] = [
  { name: 'Deposit', percentage: 10, amountCents: null, description: 'Initial deposit on signing', order: 0, mode: '%' },
  { name: 'Mobilisation', percentage: 20, amountCents: null, description: 'On site mobilisation', order: 1, mode: '%' },
  { name: 'Frame Stage', percentage: 25, amountCents: null, description: 'Completion of structural frame', order: 2, mode: '%' },
  { name: 'Lockup Stage', percentage: 25, amountCents: null, description: 'Building lockup', order: 3, mode: '%' },
  { name: 'Practical Completion', percentage: 20, amountCents: null, description: 'On handover', order: 4, mode: '%' },
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
  const { data: milestones = [] } = useQuery<ProposalPaymentMilestone[]>({
    queryKey: ['/api/proposals', proposalId, 'milestones'],
  });
  const { data: companySettings } = useQuery<{ paymentScheduleTemplates?: Array<{ id: string; name: string; milestones: DraftMilestone[] }> } | null>({
    queryKey: ['/api/company-settings'],
  });

  const [draft, setDraft] = useState<DraftMilestone[]>([]);
  const [templateName, setTemplateName] = useState('');

  useEffect(() => {
    setDraft(
      milestones.map((m, i) => ({
        name: m.name,
        percentage: m.percentage != null ? Number(m.percentage) : null,
        amountCents: m.amountCents != null ? Number(m.amountCents) : null,
        description: m.description ?? null,
        order: i,
        mode: m.amountCents != null && m.percentage == null ? '$' : '%',
      })),
    );
  }, [milestones]);

  const replaceMutation = useMutation({
    mutationFn: async (items: DraftMilestone[]) => {
      return await apiRequest(`/api/proposals/${proposalId}/milestones`, 'PUT', {
        milestones: items.map((m, i) => ({
          name: m.name || `Milestone ${i + 1}`,
          percentage: m.mode === '%' ? m.percentage : null,
          amountCents: m.mode === '$' ? m.amountCents : null,
          description: m.description || null,
          order: i,
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/proposals', proposalId, 'milestones'] });
      toast({ title: 'Schedule saved', description: 'Payment schedule updated.' });
    },
  });

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

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          Total: {totalPct.toFixed(2)}% {totalAmt > 0 && `+ $${(totalAmt / 100).toFixed(2)}`}
        </span>
        <Button
          size="sm"
          onClick={() => replaceMutation.mutate(draft)}
          disabled={replaceMutation.isPending}
          data-testid="button-save-milestones"
        >
          {replaceMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
          Save Schedule
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
}

function RevisionHistoryPanel({ proposal }: RevisionHistoryPanelProps) {
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
          <p className="font-medium">This revision has been superseded.</p>
          <p className="text-muted-foreground">A newer version exists. Edits should be made to the latest revision.</p>
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

      <div className="space-y-2">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <History className="w-3 h-3" /> Revision history
        </div>
        {ordered.length === 0 ? (
          <p className="text-xs text-muted-foreground">No revisions yet.</p>
        ) : (
          ordered.map((p) => {
            const isCurrent = p.id === proposal.id;
            return (
              <div
                key={p.id}
                className={`flex items-center gap-2 border rounded-md px-2 py-2 text-sm ${isCurrent ? 'bg-muted' : ''}`}
                data-testid={`revision-item-${p.id}`}
              >
                <FileText className="w-4 h-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground truncate">#{p.proposalNumber}</p>
                </div>
                <Badge variant="outline" className="text-xs">
                  v{p.version || 1}
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
