import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/hooks/use-auth';
import { pdf } from '@react-pdf/renderer';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { GripVertical, Plus, Download, Eye, EyeOff, Loader2, Trash2, Copy, History, FileText, ArrowRight, Send, CheckCircle, XCircle, FileCheck, MoreHorizontal, Lock, BellRing, LayoutTemplate, CornerDownRight } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useLocation } from 'wouter';
import { format as formatDate } from 'date-fns';
import type { Proposal, ProposalSection, Project, ProposalPaymentMilestone, ProposalAcceptance, ProposalItem, Contact, Estimate, EstimateGroup, EstimateItem, InsertProposal } from '@shared/schema';
import { ProposalDocument } from './pdf/ProposalDocument';
import { PDFPreview } from './PDFPreview';
import { EstimateEditor } from './SectionEditor';
import { ImportedPdfEditor } from './ImportedPdfEditor';
import { CoverTemplatePicker } from './CoverTemplatePicker';
import { RichTextEditor } from '@/components/RichTextEditor';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PROPOSAL_PLACEHOLDER_TOKENS } from './pdf/placeholders';
import { SendProposalDialog } from './SendProposalDialog';
import { ProposalRemindersDialog } from './ProposalRemindersDialog';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import { revisionLabel } from '@/components/proposals/proposalDisplay';
import { summaryHasContent } from '@/components/proposals/pdf/sections/SummarySection';
import { ProposalDetailsCard } from '@/components/proposals/ProposalDetailsCard';
import { buildDefaultSections, type CompanySettingsForSections } from '@/components/proposals/defaultSections';
import { mergeImportedPages, importedSectionsInOrder } from '@/components/proposals/pdf/mergeImportedPages';
import { buildProposalPlaceholderContext } from '@/components/proposals/pdf/proposalContext';
import { substitutePlaceholders } from '@/components/proposals/pdf/placeholders';

const PROPOSAL_PLACEHOLDERS = PROPOSAL_PLACEHOLDER_TOKENS;

/** Sentinel for the built-in structure, which is not a saved template. */
const STANDARD_STRUCTURE = '__standard__';

/**
 * Sections whose whole body is prose. The generic "Intro text" field earns its
 * place above a table — a lead-in over the estimate or the payment schedule —
 * but above a cover letter it is only the first paragraph with extra steps, in
 * a second editor that formats differently from the one below it. These two get
 * one field; existing intro text is offered for merging rather than stranded.
 */
const PROSE_BODY_KEY: Record<string, string> = {
  cover_letter: 'letterText',
  scope: 'scopeText',
  summary: 'summaryText',
  closing: 'closingText',
  estimate: 'estimateDescriptionHtml',
};

/** True when rich text holds something other than empty markup. */
function hasRichText(html: string | null | undefined): boolean {
  if (!html) return false;
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const SECTION_TYPE_LABELS: Record<string, string> = {
  cover_page: "Cover Page",
  imported_pdf: "Imported PDF",
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
  /** Whether a payment schedule is in the document — it carries the totals. */
  hasPaymentSchedule?: boolean;
  /** False for the first row and for the cover page, which always stands alone. */
  canJoinPrevious?: boolean;
  /** Named in the hint, so "continues under…" says under what. */
  previousSectionName?: string;
  /** True when this section is set to continue the sheet above it. */
  joinsPrevious?: boolean;
  /** True when the section is enabled but has nothing to render. */
  printsNothing?: boolean;
  /** The company-wide masthead setting, which still picks the default cover. */
  documentStyle?: 'style1' | 'style2';
}

function SortableSectionItem({ section, onSectionUpdate, value, projectId, project, client, hasPaymentSchedule, canJoinPrevious, previousSectionName, joinsPrevious, printsNothing, documentStyle }: SortableSectionItemProps) {
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

  /**
   * Autosave.
   *
   * These fields used to live in local state behind a per-section "Save
   * Changes" button, next to the page's own Save. Collapse the accordion or
   * leave the page without pressing the inner one and the text was gone, with
   * no warning and no way back — the outer Save did not cover it.
   *
   * Edits now persist on their own a beat after you stop typing, and any
   * pending edit is flushed on unmount, which is what navigating away and
   * closing the accordion both do.
   */
  const pending = useRef<Partial<ProposalSection> | null>(null);
  const firstRun = useRef(true);
  const onSectionUpdateRef = useRef(onSectionUpdate);
  onSectionUpdateRef.current = onSectionUpdate;

  useEffect(() => {
    // Skip the mount pass, and the re-seed when switching section, or every
    // section would write itself back to the server just for being rendered.
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    pending.current = {
      name: localName,
      description: localDescriptionText,
      descriptionHtml: localDescriptionHtml,
      content: localContent,
    } as Partial<ProposalSection>;

    const t = setTimeout(() => {
      if (!pending.current) return;
      onSectionUpdateRef.current(section.id, pending.current);
      pending.current = null;
    }, 700);
    return () => clearTimeout(t);
  }, [localName, localDescriptionText, localDescriptionHtml, localContent, section.id]);

  // Flush whatever the debounce still holds when this row goes away.
  useEffect(() => () => {
    if (pending.current) {
      onSectionUpdateRef.current(section.id, pending.current);
      pending.current = null;
    }
  }, [section.id]);

  const sectionTypeLabel = SECTION_TYPE_LABELS[section.sectionType || "custom"] || "Section";

  // Prose-only sections hide the intro editor. Anything already in it is
  // surfaced for merging instead of quietly becoming uneditable.
  const proseBodyKey = PROSE_BODY_KEY[section.sectionType || ""];
  const [bodyEpoch, setBodyEpoch] = useState(0);
  const strandedIntro =
    !!proseBodyKey &&
    (hasRichText(localDescriptionHtml) || !!localDescriptionText?.trim());

  const mergeIntroIntoBody = () => {
    if (!proseBodyKey) return;
    const intro = hasRichText(localDescriptionHtml)
      ? localDescriptionHtml
      : localDescriptionText?.trim()
      ? `<p>${escapeHtml(localDescriptionText.trim())}</p>`
      : "";
    const body = String((localContent as Record<string, unknown>)[proseBodyKey] ?? "");
    setLocalContent({ ...localContent, [proseBodyKey]: `${intro}${body}` });
    setLocalDescriptionHtml("");
    setLocalDescriptionText("");
    // RichTextEditor only pushes a new `content` prop into TipTap when its
    // isInternalChange guard happens to be clear, so a programmatic rewrite can
    // be swallowed — the text persists but the box still shows the old copy,
    // which reads as "the merge deleted my letter". Bumping the key remounts
    // the editor on the new content instead of hoping the sync lands.
    setBodyEpoch((n) => n + 1);
  };

  return (
    <div ref={setNodeRef} style={style} className={cn("group/section", joinsPrevious && "pl-4 relative")}>
      {/* A joined section is indented under the one that opened the sheet, so
          the page structure is legible from the list without opening ten
          editors to find out. */}
      {joinsPrevious && (
        <CornerDownRight
          className="absolute left-0.5 top-3 w-3 h-3 text-muted-foreground/60"
          aria-hidden="true"
        />
      )}
      <AccordionItem
        value={value}
        className={cn(
          "border border-border rounded-md mb-1 bg-card transition-colors",
          !localIsEnabled && "opacity-60",
          joinsPrevious ? "border-dashed border-border/70" : "",
          "hover:border-primary/40",
        )}
      >
        <div className="flex items-center gap-1.5 px-2">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing py-2 opacity-0 group-hover/section:opacity-100 transition-opacity"
            aria-label="Reorder section"
            data-testid={`drag-handle-${section.id}`}
          >
            <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          {/* One line per section. The type badge used to sit under the name
              repeating it almost verbatim — "Cover Page" above "COVER PAGE" —
              and pushed every row to ~72px, so ten sections never fit on
              screen. It is only shown where it adds something: a renamed or
              custom section, where the name no longer says what the section is. */}
          <div className="flex-1 min-w-0 py-2 flex items-baseline gap-2">
            <p className={`text-sm truncate ${localIsEnabled ? "font-medium" : "text-muted-foreground"}`}>
              {section.name}
            </p>
            {section.name?.trim().toLowerCase() !== sectionTypeLabel.toLowerCase() && (
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 shrink-0">
                {sectionTypeLabel}
              </span>
            )}
            {/* A switch reading ON above a section that prints nothing is worse
                than the blank page the suppression was avoiding. */}
            {printsNothing && (
              <span className="text-[10px] uppercase tracking-wide text-amber shrink-0">
                Not printing
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 py-2">
            <Switch
              checked={localIsEnabled}
              onCheckedChange={handleToggleEnabled}
              onClick={(e) => e.stopPropagation()}
              className="scale-90"
              data-testid={`switch-section-enabled-${section.id}`}
            />
            <AccordionTrigger className="hover:no-underline px-1.5" />
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

            {!proseBodyKey && (
              <div className="space-y-2">
                {/* Named for where it lands. It used to be "Description", which
                    said nothing about what it does — and on the Estimate section
                    sat directly above a second field with the identical label. */}
                <Label htmlFor={`section-description-${section.id}`}>Intro text</Label>
                <p className="text-xs text-muted-foreground">
                  Appears under the section heading in the document.
                </p>
                <RichTextEditor
                  content={localDescriptionHtml}
                  onChange={(html, text) => {
                    setLocalDescriptionHtml(html);
                    setLocalDescriptionText(text);
                  }}
                  placeholder="Optional — a line or two introducing this section"
                  placeholders={PROPOSAL_PLACEHOLDERS}
                  data-testid={`richtext-section-description-${section.id}`}
                />
              </div>
            )}

            {strandedIntro && (
              <div className="rounded-md border border-amber/40 bg-amber-light p-2.5 space-y-2">
                <p className="text-xs text-foreground">
                  This section has leftover intro text from when it had two separate
                  fields. It still prints above the body.
                </p>
                <div className="rounded border bg-card px-2 py-1.5 text-xs text-muted-foreground max-h-24 overflow-auto">
                  {localDescriptionText?.trim() ||
                    localDescriptionHtml.replace(/<[^>]*>/g, " ").trim()}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={mergeIntroIntoBody}
                  data-testid={`button-merge-intro-${section.id}`}
                >
                  <ArrowRight className="w-3 h-3 mr-1" />
                  Move to the top of the {section.sectionType === "scope" ? "scope" : "letter"}
                </Button>
              </div>
            )}

            {/* Section-specific content editors */}
            {section.sectionType === "cover_letter" && (
              <div className="space-y-2">
                <Label>Letter Content</Label>
                <RichTextEditor
                  key={`letter-${bodyEpoch}`}
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
                  key={`scope-${bodyEpoch}`}
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
                {/* Says where the figures went, so their absence reads as a
                    decision rather than a bug. */}
                {hasPaymentSchedule && (
                  <p className="text-xs text-muted-foreground">
                    The totals print on the Payment Schedule, above the milestones they
                    are divided into. Turn that section off and they come back here.
                  </p>
                )}
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
                {/* Per-section estimate revision selector removed — the
                    proposal-level toolbar selector now drives every estimate
                    section's linked revision in one place. */}
                <EstimateEditor content={localContent} setContent={setLocalContent} />
              </div>
            )}

            {section.sectionType === "imported_pdf" && (
              <ImportedPdfEditor content={localContent} setContent={setLocalContent} />
            )}

            {section.sectionType === "payment_schedule" && (
              <PaymentScheduleEditor proposalId={section.proposalId} />
            )}

            {section.sectionType === "cover_page" && (
              <div className="space-y-4">
                <CoverTemplatePicker
                  section={section}
                  content={localContent}
                  setContent={setLocalContent}
                  documentStyle={documentStyle}
                />
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
                {/* Off by default: whether the price belongs on page one or
                    after the scope is a judgement call, not a default. */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor={`show-price-${section.id}`}>Show the total</Label>
                    <p className="text-xs text-muted-foreground">
                      Puts the contract price on the cover, not ten pages in
                    </p>
                  </div>
                  <Switch
                    id={`show-price-${section.id}`}
                    checked={localContent.showPrice === true}
                    onCheckedChange={(v) => setLocalContent({ ...localContent, showPrice: v })}
                    data-testid={`switch-cover-show-price-${section.id}`}
                  />
                </div>
              </div>
            )}

            {/* Page furniture, at the foot of every section's editor. */}
            {canJoinPrevious && (
              <div className="flex items-center justify-between border-t pt-3">
                <div className="space-y-0.5">
                  <Label htmlFor={`new-page-${section.id}`} className="text-xs">Start on a new page</Label>
                  <p className="text-xs text-muted-foreground">
                    {localContent.startOnNewPage === false
                      ? `Continues under ${previousSectionName ?? 'the section above'}, if there is room`
                      : 'Off lets it fill the space left on the previous page'}
                  </p>
                </div>
                <Switch
                  id={`new-page-${section.id}`}
                  checked={localContent.startOnNewPage !== false}
                  onCheckedChange={(v) => setLocalContent({ ...localContent, startOnNewPage: v })}
                  data-testid={`switch-section-new-page-${section.id}`}
                />
              </div>
            )}

            {/* Undefined means "whatever Layout says"; the switch sets an
                explicit override. A joined section shares the sheet's footer,
                so the setting belongs to whichever section opened it. */}
            <div className="flex items-center justify-between border-t pt-3">
              <div className="space-y-0.5">
                <Label htmlFor={`show-footer-${section.id}`} className="text-xs">Show footer</Label>
                <p className="text-xs text-muted-foreground">
                  {localContent.startOnNewPage === false
                    ? 'Set by the section that starts this page'
                    : localContent.showFooter === undefined
                    ? 'Following the document default'
                    : 'Overriding the document default'}
                </p>
              </div>
              <Switch
                id={`show-footer-${section.id}`}
                disabled={localContent.startOnNewPage === false}
                checked={localContent.showFooter !== false}
                onCheckedChange={(v) => setLocalContent({ ...localContent, showFooter: v })}
                data-testid={`switch-section-footer-${section.id}`}
              />
            </div>

            {/* No Save button — edits persist on their own. See the autosave
                effect above for why this used to lose work. */}
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
  brandColor?: string;
  documentStyle?: 'style1' | 'style2';
  /**
   * Optional DOM element to portal the proposal toolbar into (e.g. the page
   * header next to the Save button). When omitted, the toolbar renders
   * inline at the top of the builder.
   */
  toolbarSlot?: HTMLElement | null;
  /** Separate slot for the overflow menu, so it sits last in the header row. */
  menuSlot?: HTMLElement | null;
  projects?: Project[];
  lockProject?: boolean;
  onProposalUpdate?: (updates: Partial<InsertProposal>) => void;
  companySettings?: CompanySettingsForSections | null;
  /**
   * Called when the user picks an estimate revision from the toolbar
   * selector. The page-level handler is responsible for cascading the new
   * estimateId into all estimate sections AND persisting it on the
   * proposal in a single batched flow (one toast, optimistic refresh).
   */
  onEstimateRevisionPick?: (estimateId: string) => void;
}

// --- Proposal Template (full proposal) ---
type ProposalTemplate = {
  id: string;
  name: string;
  sections: Array<{
    sectionType: string;
    name: string;
    order: number;
    content?: any;
    description?: string | null;
    descriptionHtml?: string | null;
    isEnabled?: boolean;
  }>;
  layoutSettings?: Record<string, any>;
};

interface ProposalTemplateBarProps {
  proposal: Proposal;
  sections: ProposalSection[];
  /**
   * 'picker' is the labelled select in the Details card — choosing the
   * structure is part of setting a proposal up. 'menu' is the toolbar icon,
   * which only saves the current proposal as a new template.
   */
  mode?: 'picker' | 'menu';
  /** For 'picker': rebuilds the standard structure. */
  onApplyStandard?: () => void;
  applyingStandard?: boolean;
}

function ProposalTemplateBar({ proposal, sections, mode = 'menu', onApplyStandard, applyingStandard }: ProposalTemplateBarProps) {
  const { toast } = useToast();
  const [templateName, setTemplateName] = useState('');
  const [showSave, setShowSave] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ title: string; description?: string; confirmLabel?: string; destructive?: boolean; run: () => void } | null>(null);

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

      // Insert template sections first (use a temporary order offset so they
      // don't collide with existing sections), then delete the originals.
      // If insertion fails midway we abort and roll back the partial inserts
      // so the proposal is never left in a half-rebuilt state.
      const orderOffset = sections.length + 1000;
      const createdIds: string[] = [];
      try {
        for (const ts of tpl.sections) {
          const created = (await apiRequest(
            `/api/proposals/${proposal.id}/sections`,
            'POST',
            {
              sectionType: ts.sectionType,
              name: ts.name,
              order: orderOffset + ts.order,
              content: ts.content ?? {},
              description: ts.description ?? null,
              descriptionHtml: ts.descriptionHtml ?? null,
              isEnabled: ts.isEnabled !== false,
            },
          )) as { id?: string } | null;
          if (created?.id) createdIds.push(created.id);
        }
      } catch (err) {
        await Promise.all(
          createdIds.map((id) =>
            apiRequest(`/api/proposal-sections/${id}`, 'DELETE').catch(() => undefined),
          ),
        );
        throw err;
      }

      // All template sections inserted — now remove the originals and renumber.
      // We surface any cleanup failures via toast/onError so a partial apply
      // is never silently accepted.
      const deleteResults = await Promise.allSettled(
        sections.map((s) => apiRequest(`/api/proposal-sections/${s.id}`, 'DELETE')),
      );
      const renumberResults = await Promise.allSettled(
        createdIds.map((id, i) =>
          apiRequest(`/api/proposal-sections/${id}`, 'PATCH', {
            order: tpl.sections[i]?.order ?? i,
          }),
        ),
      );
      const cleanupFailures =
        deleteResults.filter((r) => r.status === 'rejected').length +
        renumberResults.filter((r) => r.status === 'rejected').length;
      if (cleanupFailures > 0) {
        throw new Error(
          `Template applied but ${cleanupFailures} cleanup operation(s) failed; please refresh and review the section list.`,
        );
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
            description: s.description ?? null,
            descriptionHtml: (s as { descriptionHtml?: string | null }).descriptionHtml ?? null,
            isEnabled: s.isEnabled !== false,
          })),
        layoutSettings: (proposal.layoutSettings as Record<string, unknown>) || undefined,
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

  if (mode === 'picker') {
    const run = (label: string, go: () => void) => {
      if (sections.length === 0) { go(); return; }
      setConfirmAction({
        title: `Apply "${label}"?`,
        description: `This will replace all ${sections.length} current section(s).`,
        confirmLabel: 'Apply',
        run: go,
      });
    };
    return (
      <>
        <Select
          // Deliberately uncontrolled: nothing on the proposal records which
          // template built it, so this is a chooser, not a stored value.
          value=""
          disabled={applyMutation.isPending || !!applyingStandard}
          onValueChange={(id) => {
            if (id === STANDARD_STRUCTURE) {
              run('Standard structure', () => onApplyStandard?.());
              return;
            }
            const tpl = templates.find((t) => t.id === id);
            if (tpl) run(tpl.name, () => applyMutation.mutate(id));
          }}
        >
          <SelectTrigger className="h-7 text-xs" data-testid="select-apply-proposal-template">
            <SelectValue
              placeholder={
                applyMutation.isPending || applyingStandard ? 'Applying…' : 'Choose a structure…'
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={STANDARD_STRUCTURE} className="text-xs">
              Standard structure
            </SelectItem>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id} className="text-xs">
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ConfirmDialog
          open={!!confirmAction}
          onOpenChange={(o) => { if (!o) setConfirmAction(null); }}
          title={confirmAction?.title ?? ''}
          description={confirmAction?.description}
          confirmLabel={confirmAction?.confirmLabel ?? 'Confirm'}
          destructive={confirmAction?.destructive}
          onConfirm={() => { confirmAction?.run(); setConfirmAction(null); }}
        />
      </>
    );
  }

  return (
    <>
      {/* Templates are an occasional action, not part of building a proposal,
          so they live behind one icon rather than a select plus a button
          taking a row each above the section list. */}
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                className="h-6 w-6 text-xs border border-border/50 text-muted-foreground rounded-md hover-elevate active-elevate-2 flex items-center justify-center flex-shrink-0"
                aria-label="Templates"
                data-testid="button-proposal-templates"
              >
                {applyMutation.isPending || saveMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <LayoutTemplate className="w-3 h-3" />
                )}
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">Templates</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            disabled={sections.length === 0}
            // Keeps the menu open: the name field renders in its place.
            onSelect={(e) => { e.preventDefault(); setShowSave(true); }}
            data-testid="button-toggle-save-proposal-template"
          >
            <Plus className="w-4 h-4 mr-2" />
            Save as template
          </DropdownMenuItem>
          {showSave && (
            <div className="flex gap-1 p-1.5 pt-1">
              <Input
                placeholder="Template name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && templateName.trim()) saveMutation.mutate(templateName.trim());
                }}
                className="h-7 text-xs"
                autoFocus
                data-testid="input-proposal-template-name"
              />
              <Button
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={!templateName.trim() || saveMutation.isPending}
                onClick={() => saveMutation.mutate(templateName.trim())}
                data-testid="button-save-proposal-template"
              >
                {saveMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                Save
              </Button>
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={!!confirmAction}
        onOpenChange={(o) => { if (!o) setConfirmAction(null); }}
        title={confirmAction?.title ?? ''}
        description={confirmAction?.description}
        confirmLabel={confirmAction?.confirmLabel ?? 'Confirm'}
        destructive={confirmAction?.destructive}
        onConfirm={() => { confirmAction?.run(); setConfirmAction(null); }}
      />
    </>
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
  brandColor,
  documentStyle,
  toolbarSlot,
  menuSlot,
  projects = [],
  lockProject,
  onProposalUpdate,
  companySettings,
  onEstimateRevisionPick,
}: ProposalBuilderProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [sidebarTab, setSidebarTab] = useState<'sections' | 'layout'>('sections');
  const [showPreview, setShowPreview] = useState(true);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRevisionHistoryOpen, setIsRevisionHistoryOpen] = useState(false);
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [isRemindersOpen, setIsRemindersOpen] = useState(false);
  const pdfUrlRef = useRef<string | null>(null);

  // Sibling revisions for the toolbar's "Revision history" drawer.
  const revisionParentId = proposal.parentProposalId || proposal.id;
  const { data: revisionSiblings = [] } = useQuery<Proposal[]>({
    queryKey: ['/api/proposals', 'revisions', revisionParentId],
    queryFn: async () => {
      const res = await fetch(`/api/proposals?parentId=${encodeURIComponent(revisionParentId)}`);
      if (!res.ok) return [];
      const all = (await res.json()) as Proposal[];
      return all.filter((p) => p.id === revisionParentId || p.parentProposalId === revisionParentId);
    },
  });

  const newRevisionMutation = useMutation({
    mutationFn: async (): Promise<Proposal> => {
      const newProposal = await apiRequest(`/api/proposals/${proposal.id}/new-revision`, 'POST', {});
      return newProposal as Proposal;
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

  const handleCopyShareLink = () => {
    if (!proposal.shareToken) {
      toast({ title: 'No share link', description: 'This revision does not have a client share token yet.', variant: 'destructive' });
      return;
    }
    const url = `${window.location.origin}/portal/proposal/${proposal.id}?token=${encodeURIComponent(proposal.shareToken)}`;
    navigator.clipboard.writeText(url).then(
      () => toast({ title: 'Share link copied', description: 'Send this link to your client.' }),
      () => toast({ title: 'Copy failed', variant: 'destructive' as const }),
    );
  };

  const orderedRevisions = [...revisionSiblings].sort((a, b) => (a.version || 1) - (b.version || 1));
  const isSuperseded = proposal.status === 'superseded';
  const isDraft = (proposal.status ?? 'draft') === 'draft';
  // Soft lock: a sent proposal stays editable, but the client is holding a
  // frozen copy, so edits made here no longer reach them. The banner says so
  // and offers the revision that would.
  const isSentToClient = ['sent', 'viewed', 'accepted', 'rejected', 'expired'].includes(proposal.status ?? '');
  const isExpired = proposal.status === 'expired';
  const [pdfEstimatesData, setPdfEstimatesData] = useState<Record<string, {
    estimate: Estimate;
    groups: EstimateGroup[];
    items: EstimateItem[];
  }>>({});

  // Hydrate estimate data so the download path renders the same content as
  // the live preview (revision-aware). This runs whenever section estimate
  // links change so the next download click has fresh data ready.
  const sectionEstimateIdsKey = sections
    .filter((s) => s.sectionType === 'estimate')
    .map((s) => {
      const c = (s.content as Record<string, unknown> | null) ?? {};
      return (typeof c.estimateId === 'string' && c.estimateId) || proposal.estimateId || '';
    })
    .filter(Boolean)
    .join(',');
  useEffect(() => {
    let cancelled = false;
    const ids = Array.from(new Set(sectionEstimateIdsKey.split(',').filter(Boolean)));
    if (ids.length === 0) {
      setPdfEstimatesData({});
      return;
    }
    (async () => {
      const map: Record<string, { estimate: Estimate; groups: EstimateGroup[]; items: EstimateItem[] }> = {};
      await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await fetch(`/api/estimates/${id}/full`);
            if (res.ok) map[id] = (await res.json()) as { estimate: Estimate; groups: EstimateGroup[]; items: EstimateItem[] };
          } catch {
            // Non-fatal — download will skip estimate sections without data.
          }
        }),
      );
      if (!cancelled) setPdfEstimatesData(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [sectionEstimateIdsKey]);

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

  // Fetch proposal line items so the AllowancesSection can render real
  // section-linked items rather than a stale legacy content blob.
  const { data: proposalItems = [] } = useQuery<ProposalItem[]>({
    queryKey: ['/api/proposals', proposal.id, 'items'],
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
            brandColor={brandColor}
            documentStyle={documentStyle}
            estimatesData={estimatesDataMap}
            milestones={milestones}
            acceptance={latestAcceptance}
            proposalItems={proposalItems}
          />
        ).toBlob();

        /* Imported pages are spliced in here, at the single point the proposal
           PDF comes into existence — the preview, the download and the copy
           that is emailed to the client all read this same blob, so none of
           them can end up with a different document. */
        const imports = importedSectionsInOrder(sections);
        let merged = blob;
        if (imports.length > 0) {
          try {
            /* The text boxes a builder drags onto an imported cover resolve
               here, against the same context the document itself used — so a
               stamped price and the summary two pages later are the same
               number by construction, not by coincidence. */
            const stampCtx = buildProposalPlaceholderContext({
              proposal,
              sections,
              project,
              client,
              companyName,
              companyPhone,
              estimatesData: estimatesDataMap,
            });
            const { bytes, failures } = await mergeImportedPages(
              await blob.arrayBuffer(),
              imports,
              { substitute: (text) => substitutePlaceholders(text, stampCtx) },
            );
            merged = new Blob([bytes], { type: 'application/pdf' });
            if (failures.length > 0) {
              toast({
                variant: 'destructive',
                title: 'Some imported pages could not be loaded',
                description: `${failures.join(', ')} — the rest of the proposal is unaffected.`,
              });
            }
          } catch (err) {
            // A merge failure must not cost the builder their preview.
            console.error('Failed to merge imported PDF pages:', err);
            toast({
              variant: 'destructive',
              title: 'Imported pages were left out',
              description: 'The proposal rendered without them.',
            });
          }
        }

        if (!isCancelled) {
          // Revoke previous URL
          if (pdfUrlRef.current) {
            URL.revokeObjectURL(pdfUrlRef.current);
          }
          
          // Create and store new URL for download
          const url = URL.createObjectURL(merged);
          pdfUrlRef.current = url;
          setPdfUrl(url);

          // Store blob directly for preview
          setPdfBlob(merged);
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
  }, [proposal, sections, project, client, companyLogo, companyName, companyPhone, primaryColor, brandColor, documentStyle, showPreview, milestones, latestAcceptance, proposalItems]);

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


  // Rebuilds the standard structure on a proposal that has no sections.
  const addStandardSections = useMutation({
    mutationFn: async () => {
      const specs = buildDefaultSections(companySettings);
      // Sequential, not Promise.all: the create route derives nothing from
      // order, but a partial failure halfway through a parallel batch leaves a
      // scrambled document with no way to tell which ones landed.
      for (const spec of specs) {
        await apiRequest(`/api/proposals/${proposal.id}/sections`, 'POST', {
          ...spec,
          proposalId: proposal.id,
          description: '',
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/proposals', proposal.id, 'sections'] });
    },
    onError: () => {
      toast({ title: 'Could not add the standard sections', variant: 'destructive' });
    },
  });

  // Picking the estimate revision is a proposal-level setting, so it renders
  // inside the Details card rather than as a stray select in the header.
  const estimateSelector = project?.id ? (
    <EstimateRevisionSelector
      projectId={project.id}
      currentEstimateId={proposal.estimateId || null}
      hideLabel
      triggerClassName="h-7 text-xs"
      // When no page-level cascade is wired, fall back to persisting
      // proposal.estimateId from inside the selector itself.
      persistOnProposalId={onEstimateRevisionPick ? undefined : proposal.id}
      onPick={(newEstimateId) => {
        if (onEstimateRevisionPick) {
          return onEstimateRevisionPick(newEstimateId);
        }
        // Fallback cascade: update each estimate section so the live preview
        // stays in sync. Proposal-level persist is handled by
        // `persistOnProposalId` above.
        for (const s of sections) {
          if (s.sectionType !== 'estimate') continue;
          const c = (s.content as Record<string, unknown> | null) ?? {};
          if (c.estimateId === newEstimateId) continue;
          onSectionUpdate(s.id, { content: { ...c, estimateId: newEstimateId } });
        }
      }}
    />
  ) : null;

  /**
   * The overflow menu is portalled separately from the rest of the toolbar so
   * the page can place it last in the header row.
   *
   * This used to be wrapped in <PDFDownloadLink> purely to obtain a download
   * href — a second, live copy of the whole document, re-rendered on every
   * keystroke, when the effect above has already produced the blob and an
   * object URL for it. It also crashed: @react-pdf/renderer 4.3.1 ships a
   * react-reconciler whose host config has no detachDeletedInstance, and
   * React's detachFiber calls it for every host node a commit removes. So any
   * edit that DELETED a node from the document — toggling a section off,
   * removing a block of text — threw "<minified> is not a function" out of the
   * live container. Rendering once, imperatively, never diffs a deletion.
   */
  const menuContent = (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className={
              toolbarSlot
                ? 'h-6 w-6 rounded-md border border-border/50 text-muted-foreground'
                : undefined
            }
            data-testid="button-proposal-toolbar-menu"
            aria-label="Proposal actions"
          >
            <MoreHorizontal className={toolbarSlot ? 'w-3 h-3' : 'w-4 h-4'} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Revision</DropdownMenuLabel>
          <DropdownMenuItem
            onSelect={() => newRevisionMutation.mutate()}
            disabled={newRevisionMutation.isPending}
            data-testid="menu-create-revision"
          >
            {newRevisionMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Copy className="w-4 h-4 mr-2" />
            )}
            Create new revision
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={handleCopyShareLink}
            disabled={!proposal.shareToken}
            data-testid="menu-copy-share-link"
          >
            <Send className="w-4 h-4 mr-2" />
            Copy client share link
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setIsRemindersOpen(true)}
            disabled={isDraft}
            data-testid="menu-proposal-reminders"
          >
            <BellRing className="w-4 h-4 mr-2" />
            Follow-ups
            {proposal.remindersEnabled ? (
              <Badge variant="secondary" className="ml-auto text-[10px]">On</Badge>
            ) : null}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setIsRevisionHistoryOpen(true)}
            data-testid="menu-revision-history"
          >
            <History className="w-4 h-4 mr-2" />
            Revision history
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Preview</DropdownMenuLabel>
          <DropdownMenuItem
            onSelect={() => setShowPreview((v) => !v)}
            data-testid="menu-toggle-preview"
          >
            {showPreview ? (
              <EyeOff className="w-4 h-4 mr-2" />
            ) : (
              <Eye className="w-4 h-4 mr-2" />
            )}
            {showPreview ? 'Hide preview' : 'Show preview'}
          </DropdownMenuItem>
          <DropdownMenuItem
            asChild
            disabled={!pdfUrl}
            data-testid="menu-download-pdf"
          >
            <a
              href={pdfUrl || '#'}
              download={`${proposal.proposalNumber}.pdf`}
              onClick={(e) => {
                if (!pdfUrl) e.preventDefault();
              }}
            >
              {pdfUrl ? (
                <Download className="w-4 h-4 mr-2" />
              ) : (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {pdfUrl ? 'Download PDF' : 'Generating PDF…'}
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
  );

  // Toolbar JSX — when a toolbarSlot is provided we portal it into the page
  // header (next to Save). Otherwise we render it inline at the top of the
  // builder for backwards compatibility.
  const toolbarContent = (
    <div
      className={toolbarSlot ? 'flex items-center gap-2' : 'rounded-md border p-2 flex items-center gap-2'}
      data-testid="proposal-toolbar"
    >
      {!toolbarSlot && menuContent}

      {isSuperseded && (
        <Badge variant="outline" className="text-xs" data-testid="badge-superseded">
          Superseded
        </Badge>
      )}

      {/* Sending is the primary action on a draft, so it gets a real button
          rather than a menu item. Once sent, the menu's revision flow takes
          over — re-sending the same proposal number would leave the client
          holding two different documents with one identity. */}
      {isDraft && (
        <Button
          size="sm"
          onClick={() => setIsSendOpen(true)}
          disabled={!pdfBlob}
          // min-h-6 is not redundant: size="sm" sets min-h-8, and a min-height
          // is a different property from h-6's height, so the button kept its
          // full 32px inside a 32px row and touched both dividers.
          className={
            toolbarSlot
              ? 'h-6 min-h-6 gap-1 px-2 text-xs bg-sage text-white hover:bg-sage/90 [&>svg]:h-3 [&>svg]:w-3'
              : 'bg-sage text-white hover:bg-sage/90'
          }
          data-testid="button-send-proposal"
        >
          <Send className={toolbarSlot ? '' : 'w-4 h-4 mr-2'} />
          Send
        </Button>
      )}

    </div>
  );

  return (
    <div className="flex flex-col h-full gap-3">
      {/* When a toolbarSlot is provided (e.g. the page header), portal the
          toolbar there. Otherwise render it inline above the preview. */}
      {toolbarSlot ? createPortal(toolbarContent, toolbarSlot) : toolbarContent}
      {toolbarSlot ? createPortal(menuContent, menuSlot ?? toolbarSlot) : null}

      <ProposalRemindersDialog
        open={isRemindersOpen}
        onOpenChange={setIsRemindersOpen}
        proposal={proposal}
      />

      <SendProposalDialog
        open={isSendOpen}
        onOpenChange={setIsSendOpen}
        proposal={proposal}
        client={client}
        companyName={companyName}
        pdfBlob={pdfBlob}
      />

      {/* Soft lock. The client holds the snapshot frozen at send time, so edits
          made here are invisible to them until a new revision goes out. */}
      {isSentToClient && (
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
          data-testid="banner-sent-lock"
        >
          <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">
            {isExpired
              ? 'The pricing on this proposal has lapsed, so the client can no longer accept it. Give it a new "valid until" date above to put it back in front of them — no need for a revision.'
              : proposal.status === 'accepted'
                ? 'This proposal has been accepted. The client holds the signed copy — edits here will not change it.'
                : proposal.status === 'rejected'
                  ? 'This proposal was declined. The client holds the copy they were sent — edits here will not change it.'
                  : 'This proposal has been sent. The client sees the copy frozen at send time, so changes you make here will not reach them.'}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => newRevisionMutation.mutate()}
            disabled={newRevisionMutation.isPending}
            data-testid="button-banner-create-revision"
          >
            {newRevisionMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Copy className="w-4 h-4 mr-2" />
            )}
            Create revision
          </Button>
        </div>
      )}

      {/* Revision history side drawer (opened from the ⋯ menu). */}
      <Sheet open={isRevisionHistoryOpen} onOpenChange={setIsRevisionHistoryOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto" data-testid="sheet-revision-history">
          <SheetHeader>
            <SheetTitle>Revision history</SheetTitle>
            <SheetDescription>
              All revisions of this proposal. Click a revision to open it.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {orderedRevisions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No revisions yet.</p>
            ) : (
              orderedRevisions.map((p) => {
                const isCurrent = p.id === proposal.id;
                const status = (p.status || 'draft') as string;
                const statusVariant: 'default' | 'secondary' | 'destructive' | 'outline' =
                  status === 'accepted' ? 'default'
                    : status === 'rejected' ? 'destructive'
                    : status === 'sent' || status === 'viewed' ? 'secondary'
                    : 'outline';
                const StatusIcon =
                  status === 'accepted' ? CheckCircle
                    : status === 'rejected' ? XCircle
                    : status === 'sent' || status === 'viewed' ? Send
                    : status === 'superseded' ? FileCheck
                    : FileText;
                return (
                  <div
                    key={p.id}
                    className={`flex items-start gap-2 border rounded-md px-2 py-2 text-sm ${isCurrent ? 'bg-muted' : ''}`}
                    data-testid={`sheet-revision-item-${p.id}`}
                  >
                    <StatusIcon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{revisionLabel(p.version)}</span>
                        <Badge variant="outline" className="text-xs">v{Math.max(1, Number(p.version || 1))}</Badge>
                        <span className="truncate text-xs text-muted-foreground">{p.name}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                        <span>#{p.proposalNumber}</span>
                        {p.sentDate && (
                          <span>Sent {formatDate(new Date(p.sentDate), 'd MMM yyyy')}</span>
                        )}
                      </div>
                    </div>
                    <Badge variant={statusVariant} className="text-xs capitalize">{status}</Badge>
                    {!isCurrent && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          const path = p.projectId
                            ? `/projects/${p.projectId}/proposals/${p.id}`
                            : `/proposals/${p.id}`;
                          setIsRevisionHistoryOpen(false);
                          setLocation(path);
                        }}
                        aria-label="Open revision"
                        data-testid={`sheet-button-open-revision-${p.id}`}
                      >
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex flex-1 min-h-0 gap-4">
      {/* PDF Preview Panel - 60% */}
      <div className="flex-1 flex flex-col">
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
        <Tabs value={sidebarTab} onValueChange={(v) => setSidebarTab(v as 'sections' | 'layout')} className="flex-1 flex flex-col min-h-0">
          {/* One h-8 toolbar row, matching the list pages: the tab chips name
              the panel, so the duplicate "Sections" heading is gone and the
              template controls have collapsed into a single icon. */}
          <div className="h-8 flex items-center gap-2 flex-shrink-0">
            <div className="flex items-center gap-0.5" data-testid="tabs-proposal-sidebar">
              {([
                { key: 'sections', label: 'Sections' },
                { key: 'layout', label: 'Layout' },
              ] as const).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setSidebarTab(t.key)}
                  className={`h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 ${
                    sidebarTab === t.key
                      ? 'bg-primary/10 text-primary border-primary/20'
                      : 'border-border/50 text-muted-foreground'
                  }`}
                  data-testid={`tab-${t.key}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex-1" />

            {sidebarTab === 'sections' && (
              <>
                <button
                  onClick={onAddSection}
                  className="h-6 w-auto px-2 text-xs border border-border/50 text-muted-foreground rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
                  data-testid="button-add-section"
                >
                  <Plus className="w-3 h-3" />
                  Add
                </button>
                <ProposalTemplateBar proposal={proposal} sections={sections} />
              </>
            )}
          </div>

          {/* `flex` outranks the UA rule behind Radix's `hidden` attribute, so
              without the data-state guard the inactive Sections panel keeps its
              full height and shoves the Layout panel off the bottom. */}
          <TabsContent
            value="sections"
            className="flex-1 flex flex-col min-h-0 mt-2 data-[state=inactive]:hidden"
          >
            {onProposalUpdate && (
              <ProposalDetailsCard
                proposal={proposal}
                projects={projects}
                lockProject={lockProject}
                onProposalUpdate={onProposalUpdate}
                estimateSelector={estimateSelector}
                hasEstimate={!!proposal.estimateId}
                templateSelector={
                  <ProposalTemplateBar
                    proposal={proposal}
                    sections={sections}
                    mode="picker"
                    onApplyStandard={() => addStandardSections.mutate()}
                    applyingStandard={addStandardSections.isPending}
                  />
                }
              />
            )}

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
                    {sections.map((section, idx) => (
                      <SortableSectionItem
                        key={section.id}
                        section={section}
                        onSectionUpdate={onSectionUpdate}
                        value={section.id}
                        projectId={proposal.projectId}
                        project={project}
                        client={client}
                        documentStyle={documentStyle}
                        hasPaymentSchedule={sections.some(
                          (s) => s.sectionType === 'payment_schedule' && s.isEnabled !== false,
                        )}
                        canJoinPrevious={
                          idx > 0 &&
                          section.sectionType !== 'cover_page' &&
                          sections[idx - 1]?.sectionType !== 'cover_page'
                        }
                        previousSectionName={sections[idx - 1]?.name}
                        printsNothing={
                          section.isEnabled !== false &&
                          section.sectionType === 'summary' &&
                          !summaryHasContent(
                            section,
                            !sections.some(
                              (s) => s.sectionType === 'payment_schedule' && s.isEnabled !== false,
                            ),
                          )
                        }
                        joinsPrevious={
                          idx > 0 &&
                          section.sectionType !== 'cover_page' &&
                          sections[idx - 1]?.sectionType !== 'cover_page' &&
                          (section.content as Record<string, unknown> | null)?.startOnNewPage === false
                        }
                      />
                    ))}
                  </Accordion>
                </SortableContext>
              </DndContext>

              {sections.length === 0 && (
                <Card className="p-6 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="rounded-full bg-muted p-3">
                      <FileText className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium text-sm">No sections yet</p>
                      <p className="text-sm text-muted-foreground">
                        Start from the standard structure — cover page through to
                        signature — and change what you don't need.
                      </p>
                    </div>
                    {/* The standard set used to exist only at the moment a
                        proposal was created, so a proposal that arrived without
                        it could only be rebuilt ten sections at a time. */}
                    <Button
                      size="sm"
                      onClick={() => addStandardSections.mutate()}
                      disabled={addStandardSections.isPending}
                      data-testid="button-add-standard-sections"
                    >
                      {addStandardSections.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4 mr-2" />
                      )}
                      Add standard sections
                    </Button>
                    <button
                      onClick={onAddSection}
                      className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                      data-testid="button-add-first-section"
                    >
                      Or add a single section
                    </button>
                  </div>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="layout" className="flex-1 min-h-0 mt-2 overflow-auto">
            <LayoutPanel proposal={proposal} sections={sections} onSectionUpdate={onSectionUpdate} />
          </TabsContent>
        </Tabs>
      </div>
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
  /** The cover's accent. Per-proposal only: there is no company default. */
  secondaryColor?: string;
  showPageNumbers?: boolean;
  showFooter?: boolean;
  pageHeader?: 'none' | 'minimal' | 'compact' | 'full';
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
  const { user } = useAuth();
  const roleName = (user as { roleName?: string; role?: string } | null)?.roleName
    ?? (user as { role?: string } | null)?.role
    ?? '';
  const canEditCompanyDefaults = ['Admin', 'Owner', 'admin', 'owner'].includes(roleName);
  const settings = (proposal.layoutSettings as LayoutSettings) || {};

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

  const [editCompanyDefaults, setEditCompanyDefaults] = useState(false);
  const canEdit = canEditCompanyDefaults && editCompanyDefaults;

  const [primaryColor, setPrimaryColor] = useState<string>(settings.primaryColor || companyColor);
  const [secondaryColor, setSecondaryColor] = useState<string>(settings.secondaryColor || '');
  const [showPageNumbers, setShowPageNumbers] = useState<boolean>(settings.showPageNumbers ?? true);
  const [showFooter, setShowFooter] = useState<boolean>(settings.showFooter ?? true);
  const [pageHeader, setPageHeader] = useState<'none' | 'minimal' | 'compact' | 'full'>(settings.pageHeader ?? 'full');
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

  useEffect(() => {
    if (settings.showLogo !== undefined) return;
    setShowLogo(companyShowLogo ?? !!companyLogoUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyShowLogo, companyLogoUrl]);

  const saveLayoutMutation = useMutation({
    mutationFn: async (layoutSettings: LayoutSettings) => {
      // Merge, don't replace. layoutSettings is a shared jsonb bag: the
      // milestone seeder stores `milestonesSeeded` in it, so writing a fresh
      // object here cleared that flag and the payment schedule re-seeded
      // itself the next time the proposal loaded.
      const existing = (proposal.layoutSettings as Record<string, unknown> | null) ?? {};
      return await apiRequest(`/api/proposals/${proposal.id}`, 'PATCH', {
        layoutSettings: { ...existing, ...layoutSettings },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/proposals', proposal.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/proposals'] });
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
      // Empty means "no accent" — stored as undefined so the document falls
      // back to the primary rather than reading a blank as a colour.
      secondaryColor: secondaryColor.trim() || undefined,
      showPageNumbers,
      showFooter,
      pageHeader,
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
    const nextPageSize = p.pageSize || pageSize;
    const nextShowFooter = p.showFooter !== undefined ? !!p.showFooter : showFooter;
    const nextShowPageNumbers = p.showPageNumbers !== undefined ? !!p.showPageNumbers : showPageNumbers;
    const nextShowLogo = p.showLogo !== undefined ? !!p.showLogo : showLogo;
    const nextShowGst = p.showGst !== undefined ? !!p.showGst : showGst;
    const nextPricingMode = p.pricingMode || pricingMode;
    setPageSize(nextPageSize);
    setShowFooter(nextShowFooter);
    setShowPageNumbers(nextShowPageNumbers);
    setShowLogo(nextShowLogo);
    setShowGst(nextShowGst);
    setPricingMode(nextPricingMode);

    saveLayoutMutation.mutate({
      primaryColor,
      secondaryColor: secondaryColor.trim() || undefined,
      showPageNumbers: nextShowPageNumbers,
      showFooter: nextShowFooter,
      pageSize: nextPageSize,
      pricingMode: nextPricingMode,
      showGst: nextShowGst,
      showLogo: nextShowLogo,
      preset: name as LayoutSettings['preset'],
    });

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

  const estimateSections = sections.filter((s) => s.sectionType === 'estimate');

  const DEFAULT_VISIBLE_COLUMN_KEYS = new Set([
    'description', 'quantity', 'unit', 'unitCostIncTax', 'amountIncTax',
  ]);

  const updateVisibleColumns = (section: ProposalSection, columnKey: string, on: boolean) => {
    const content = (section.content as Record<string, unknown> | null) ?? {};
    const visibleColumnsRaw = (content as { visibleColumns?: unknown }).visibleColumns;
    const togglesRaw = (content as { columnToggles?: unknown }).columnToggles;
    let current: string[];
    if (Array.isArray(visibleColumnsRaw)) {
      current = visibleColumnsRaw.filter((v): v is string => typeof v === 'string');
    } else if (togglesRaw && typeof togglesRaw === 'object') {
      const t = togglesRaw as Record<string, boolean>;
      current = ESTIMATE_COLUMNS.filter((c) => t[c.key] === true).map((c) => c.key);
    } else {
      current = ESTIMATE_COLUMNS.filter((c) => DEFAULT_VISIBLE_COLUMN_KEYS.has(c.key)).map((c) => c.key);
    }
    const next = on ? Array.from(new Set([...current, columnKey])) : current.filter((k) => k !== columnKey);
    onSectionUpdate(section.id, {
      content: { ...content, visibleColumns: next } as ProposalSection['content'],
    });
  };

  const isColumnVisible = (section: ProposalSection, columnKey: string): boolean => {
    const content = (section.content as Record<string, unknown> | null) ?? {};
    const visibleColumnsRaw = (content as { visibleColumns?: unknown }).visibleColumns;
    if (Array.isArray(visibleColumnsRaw)) {
      return visibleColumnsRaw.includes(columnKey);
    }
    const togglesRaw = (content as { columnToggles?: unknown }).columnToggles;
    if (togglesRaw && typeof togglesRaw === 'object') {
      return (togglesRaw as Record<string, boolean>)[columnKey] === true;
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
            disabled={!canEditCompanyDefaults}
            data-testid="input-layout-primary-color"
            className="w-16 h-9 p-1"
          />
          <Input
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
            disabled={!canEditCompanyDefaults}
            className="flex-1"
            data-testid="input-layout-primary-color-text"
          />
        </div>
        <div className="flex items-center justify-between gap-2 text-xs">
          {canEditCompanyDefaults ? (
            <button
              type="button"
              className="text-primary underline-offset-2 hover:underline"
              onClick={() => setEditCompanyDefaults((v) => !v)}
              data-testid="button-toggle-edit-company-defaults"
            >
              {editCompanyDefaults ? 'Lock company defaults' : 'Edit company defaults'}
            </button>
          ) : (
            <span className="text-muted-foreground" data-testid="text-company-defaults-readonly">
              Read-only — admin permission required to edit company defaults
            </span>
          )}
          {canEdit && (
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
        <Label htmlFor="layout-secondary-color">
          Accent colour <span className="text-xs text-muted-foreground">(this proposal)</span>
        </Label>
        <p className="text-xs text-muted-foreground">
          Used on the cover — the rule under the masthead, the tint behind the client card.
          Leave it empty to use the primary colour throughout.
        </p>
        <div className="flex items-center gap-2">
          <Input
            id="layout-secondary-color"
            type="color"
            value={secondaryColor || primaryColor}
            onChange={(e) => setSecondaryColor(e.target.value)}
            data-testid="input-layout-secondary-color"
            className="w-16 h-9 p-1"
          />
          <Input
            value={secondaryColor}
            placeholder="None"
            onChange={(e) => setSecondaryColor(e.target.value)}
            className="flex-1"
            data-testid="input-layout-secondary-color-text"
          />
          {secondaryColor ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSecondaryColor('')}
              data-testid="button-clear-secondary-color"
            >
              Clear
            </Button>
          ) : null}
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
      {/* Page header — what repeats at the top of every page AFTER the cover.
          Described rather than named, because "minimal" tells you nothing
          about what you'd actually see. */}
      <div className="space-y-1.5">
        <Label htmlFor="layout-page-header">Page header</Label>
        <Select value={pageHeader} onValueChange={(v) => setPageHeader(v as typeof pageHeader)}>
          <SelectTrigger id="layout-page-header" data-testid="select-layout-page-header">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-w-[22rem]">
            {([
              {
                value: 'minimal',
                name: 'Running head',
                desc: 'One line of small grey type — proposal number left, project right, a hairline under. Lightest, and gives every page back about 36pt of room.',
              },
              {
                value: 'compact',
                name: 'Compact',
                desc: 'Brand rule, company name and proposal number, project on the right. Same as full without the logo repeating on every page.',
              },
              {
                value: 'full',
                name: 'Full',
                desc: 'Brand rule, logo, company name, proposal number and project. Most identity on each page, and the most space it takes.',
              },
              {
                value: 'none',
                name: 'None',
                desc: 'Nothing at the top; the footer still carries the company and page numbers. Most room for content, but a loose page cannot identify itself.',
              },
            ] as const).map((o) => (
              <SelectItem key={o.value} value={o.value} className="items-start">
                <div className="space-y-0.5">
                  <p className="text-sm">{o.name}</p>
                  <p className="text-xs text-muted-foreground whitespace-normal">{o.desc}</p>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Applies to every page except the cover.</p>
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
            disabled={!canEditCompanyDefaults}
            onCheckedChange={setShowLogo}
            data-testid="switch-layout-logo"
          />
        </div>
        {canEdit && (
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

      {/* "Estimate columns visible in PDF" used to live here as well as in the
          Estimate section's own Column Visibility panel — the same five
          checkboxes in two places, and worse, writing two different keys. This
          wrote `visibleColumns`, the section editor wrote `columnToggles`, and
          the PDF prefers `visibleColumns`. So once you had touched this panel
          even once, the section editor's switches silently stopped doing
          anything. Columns belong to the section; this is document layout. */}

      <Button onClick={handleSave} disabled={saveLayoutMutation.isPending} className="w-full" data-testid="button-save-layout">
        {saveLayoutMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Save Layout
      </Button>
    </div>
  );
}

// --- Estimate Revision Selector (sibling estimates) ---
interface EstimateRevisionSelectorProps {
  currentEstimateId: string | null;
  projectId: string;
  /**
   * Called when the user picks a revision. May return a promise; if it
   * rejects, the optimistic trigger label is rolled back automatically.
   */
  onPick: (id: string) => void | Promise<void>;
  /** Compact mode: no Label, slim ghost trigger — for use inside a toolbar. */
  compact?: boolean;
  /** Suppress the built-in Label when the caller supplies its own. */
  hideLabel?: boolean;
  /** Overrides the trigger sizing, e.g. to match a form's h-7 fields. */
  triggerClassName?: string;
  /**
   * If provided, the selector will internally PATCH `proposals.estimateId`
   * after `onPick`. Use this for legacy callsites where the parent doesn't
   * persist the proposal-level link itself. Leave undefined when the parent
   * already handles persistence (e.g. the page-level cascade in
   * ProposalDetail).
   */
  persistOnProposalId?: string;
}

function EstimateRevisionSelector({ currentEstimateId, projectId, onPick, compact, hideLabel, triggerClassName, persistOnProposalId }: EstimateRevisionSelectorProps) {
  const { toast } = useToast();
  const { data: allEstimates = [] } = useQuery<Estimate[]>({
    queryKey: ['/api/estimates'],
  });
  // Optimistic id so the trigger label updates immediately on pick, before
  // the proposal query refetches. Cleared once the prop catches up.
  const [optimisticId, setOptimisticId] = useState<string | null>(null);
  useEffect(() => {
    if (optimisticId && currentEstimateId === optimisticId) setOptimisticId(null);
  }, [currentEstimateId, optimisticId]);

  const projectEstimates = allEstimates.filter((e) => e.projectId === projectId);
  const anchorId = optimisticId || currentEstimateId || null;
  const current = projectEstimates.find((e) => e.id === anchorId) || null;
  const parentId = (current?.parentEstimateId as string | null | undefined) || current?.id || null;

  // Sibling revisions = same parent (or itself). When no anchor exists,
  // fall back to listing the project's root estimates (those without a parent)
  // so the user can perform an initial lineage selection.
  const siblings = parentId
    ? projectEstimates.filter((e) => e.id === parentId || e.parentEstimateId === parentId)
    : projectEstimates.filter((e) => !e.parentEstimateId);
  const ordered = [...siblings].sort((a, b) => (a.version || 1) - (b.version || 1));
  const noAnchor = !parentId;

  if (ordered.length === 0) return null;

  const trigger = (
    <Select
      value={anchorId || ''}
      onValueChange={async (v) => {
        if (!v) return;
        setOptimisticId(v);
        try {
          await Promise.resolve(onPick(v));
          if (persistOnProposalId) {
            await apiRequest(`/api/proposals/${persistOnProposalId}`, 'PATCH', { estimateId: v });
            queryClient.invalidateQueries({ queryKey: ['/api/proposals', persistOnProposalId] });
            queryClient.invalidateQueries({ queryKey: ['/api/proposals'] });
          }
        } catch {
          // Roll back optimistic label so the user isn't stuck on a failed pick.
          setOptimisticId(null);
          toast({ title: 'Could not link estimate revision', variant: 'destructive' });
        }
      }}
    >
      <SelectTrigger
        className={
          triggerClassName ??
          (compact
            ? 'h-6 w-auto max-w-[15rem] gap-1 border-border/50 px-2 text-xs text-muted-foreground [&>svg]:h-3 [&>svg]:w-3'
            : 'h-9 text-xs')
        }
        aria-label={noAnchor ? 'Link estimate' : 'Estimate revision'}
        data-testid="select-estimate-revision"
      >
        <SelectValue placeholder={noAnchor ? 'Choose an estimate…' : 'Choose a revision…'} />
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
  );

  if (compact || hideLabel) return trigger;

  return (
    <div className="space-y-1">
      <Label className="text-xs">{noAnchor ? 'Link estimate' : 'Estimate revision'}</Label>
      {trigger}
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
  const { data: proposalForSeed } = useQuery<Proposal | null>({
    queryKey: ['/api/proposals', proposalId],
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
  //
  // We also persist a `milestonesSeeded` flag on the proposal so re-opening
  // an intentionally-emptied schedule never reseeds it.
  useEffect(() => {
    if (hasAutoSeededRef.current) return;
    if (!milestonesFetched) return;
    if (milestones.length > 0) {
      hasAutoSeededRef.current = true;
      return;
    }
    if (replaceMutation.isPending) return;
    const layout = (proposalForSeed?.layoutSettings as { milestonesSeeded?: boolean } | null) ?? null;
    if (layout?.milestonesSeeded) {
      hasAutoSeededRef.current = true;
      return;
    }
    hasAutoSeededRef.current = true;
    setDraft(DEFAULT_MILESTONE_SEED);
    replaceMutation.mutate(DEFAULT_MILESTONE_SEED);
    // Persist the seeded marker; failure here is non-fatal — the in-memory
    // hasAutoSeededRef still prevents reseeding within this session.
    apiRequest(`/api/proposals/${proposalId}`, 'PATCH', {
      layoutSettings: { ...(layout || {}), milestonesSeeded: true },
    }).catch(() => undefined);
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
  // When provided, the top-level estimate revision selector syncs every
  // estimate section's content.estimateId in addition to proposals.estimateId.
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
      const newProposal = await apiRequest(`/api/proposals/${proposal.id}/new-revision`, 'POST', {});
      return newProposal as Proposal;
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
            projectId={projectId}
            currentEstimateId={proposal.estimateId || null}
            persistOnProposalId={proposal.id}
            onPick={(newEstimateId) => {
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
                    <Badge variant="outline" className="text-xs" data-testid={`revision-version-${p.id}`}>
                      v{Math.max(1, Number(p.version || 1))}
                    </Badge>
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
