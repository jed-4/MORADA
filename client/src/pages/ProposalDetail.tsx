import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Eye, ChevronRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatViewedTooltip, revisionLabel } from "@/components/proposals/proposalDisplay";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { 
  type Proposal, 
  type ProposalSection,
  type Project,
  type InsertProposal,
  type InsertProposalSection,
  type FieldCategoryWithOptions,
  insertProposalSchema 
} from "@shared/schema";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ProposalBuilder } from "@/components/proposals/ProposalBuilder";
import { buildDefaultSections } from "@/components/proposals/defaultSections";

interface ProposalDetailParams {
  id?: string;
  projectId?: string;
}

const SECTION_TYPES = [
  { value: 'cover_page', label: 'Cover Page' },
  { value: 'cover_letter', label: 'Cover Letter' },
  { value: 'scope', label: 'Scope of Work' },
  { value: 'estimate', label: 'Estimate' },
  { value: 'summary', label: 'Summary' },
  { value: 'allowances', label: 'Allowances' },
  { value: 'inclusions_exclusions', label: 'Inclusions & Exclusions' },
  { value: 'payment_schedule', label: 'Payment Schedule' },
  { value: 'closing', label: 'Closing' },
  { value: 'attachments', label: 'Attachments' },
  { value: 'terms_conditions', label: 'Terms & Conditions' },
  { value: 'signature', label: 'Signature' },
  { value: 'imported_pdf', label: 'Imported PDF page' },
  { value: 'custom', label: 'Custom Section' },
];

export default function ProposalDetail() {
  const params = useParams<ProposalDetailParams>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isAddingSectionOpen, setIsAddingSectionOpen] = useState(false);
  const [newSectionType, setNewSectionType] = useState('custom');
  const [newSectionName, setNewSectionName] = useState('');
  
  const isNewProposal = !params.id;
  
  // Fetch proposal
  const { data: proposal, isLoading: proposalLoading } = useQuery<Proposal>({
    queryKey: ["/api/proposals", params.id],
    enabled: !isNewProposal,
  });

  // Fetch proposal sections
  const { data: sections = [], isLoading: sectionsLoading } = useQuery<ProposalSection[]>({
    queryKey: ["/api/proposals", params.id, "sections"],
    enabled: !isNewProposal && !!params.id,
  });

  // Fetch projects
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Get the project for this proposal
  const project = proposal ? projects.find(p => p.id === proposal.projectId) : undefined;

  // Fetch company settings (optional - for branding & T&Cs default)
  const { data: companySettings } = useQuery<{
    logoUrl?: string;
    companyName?: string;
    primaryColor?: string;
    proposalPrimaryColor?: string;
    brandColor?: string;
    documentStyle?: string;
    termsAndConditions?: string | null;
    termsTemplates?: Array<{ id: string; name: string; content: string; defaultFor?: string[] }>;
  } | null>({
    queryKey: ["/api/company-settings"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
  });

  // Determine if we're in project context
  const isProjectContext = !!params.projectId;

  // Fetch next sequential proposal number for new proposals
  const { data: nextProposalNumber } = useQuery<{ proposalNumber: string }>({
    queryKey: ["/api/proposal-numbers/next"],
    enabled: isNewProposal,
  });


  // Stable default values for new proposals
  const newProposalDefaults = useMemo(() => ({
    name: "",
    proposalNumber: nextProposalNumber?.proposalNumber || `PROP-${new Date().getFullYear()}-0001`,
    projectId: params.projectId || "",
    status: "draft" as const,
    subtotal: 0,
    gstAmount: 0,
    totalAmount: 0,
    showPricing: true,
  }), [params.projectId, nextProposalNumber?.proposalNumber]);

  // Form for proposal details
  const form = useForm<InsertProposal>({
    resolver: zodResolver(insertProposalSchema),
    defaultValues: newProposalDefaults,
  });

  // Reset form when proposal loads
  useEffect(() => {
    if (proposal && !isNewProposal) {
      form.reset(proposal as InsertProposal);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal, isNewProposal]);

  // Update proposal mutation
  const updateProposalMutation = useMutation({
    mutationFn: async (data: Partial<InsertProposal>) => {
      if (isNewProposal) {
        const result = await apiRequest("/api/proposals", "POST", data);
        // Create all default sections after creating the proposal
        if (result.id) {
          await Promise.all(
            buildDefaultSections(companySettings).map(section =>
              apiRequest(`/api/proposals/${result.id}/sections`, "POST", {
                ...section,
                proposalId: result.id,
                description: '',
              })
            )
          );
          
          // Navigate to the edit page after creation
          if (isProjectContext) {
            setLocation(`/projects/${params.projectId}/proposals/${result.id}`);
          } else {
            setLocation(`/proposals/${result.id}`);
          }
        }
        return result;
      } else {
        return await apiRequest(`/api/proposals/${params.id}`, "PATCH", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      toast({
        title: "Success",
        description: "Proposal saved successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save proposal.",
        variant: "destructive",
      });
    },
  });

  // Local state for optimistic updates
  const [localSections, setLocalSections] = useState<ProposalSection[]>([]);

  // Sync local sections with server data only when the data actually changes
  useEffect(() => {
    if (sections && sections.length > 0) {
      // Only update if the data is actually different
      const isDifferent = localSections.length !== sections.length || 
        sections.some((section, idx) => 
          !localSections[idx] || 
          localSections[idx].id !== section.id || 
          localSections[idx].updatedAt !== section.updatedAt
        );
      
      if (isDifferent) {
        setLocalSections(sections);
      }
    } else if (sections && sections.length === 0 && localSections.length > 0) {
      setLocalSections([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections]);

  // Reorder sections mutation
  const reorderSectionsMutation = useMutation({
    mutationFn: async (reorderedSections: ProposalSection[]) => {
      // Update each section's order
      await Promise.all(
        reorderedSections.map((section) =>
          apiRequest(`/api/proposal-sections/${section.id}`, "PATCH", {
            order: section.order,
          })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", params.id, "sections"] });
    },
  });

  // Add section mutation
  const addSectionMutation = useMutation({
    mutationFn: async (sectionData: Partial<InsertProposalSection>) => {
      return await apiRequest(`/api/proposals/${params.id}/sections`, "POST", {
        ...sectionData,
        proposalId: params.id,
        order: sections.length,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", params.id, "sections"] });
      setIsAddingSectionOpen(false);
      setNewSectionName('');
      setNewSectionType('custom');
      toast({
        title: "Success",
        description: "Section added successfully.",
      });
    },
  });

  const handleSectionsReorder = (reorderedSections: ProposalSection[]) => {
    // Optimistic update
    setLocalSections(reorderedSections);
    // Persist to server
    reorderSectionsMutation.mutate(reorderedSections);
  };

  // Update section mutation
  const updateSectionMutation = useMutation({
    mutationFn: async ({ sectionId, updates }: { sectionId: string; updates: Partial<ProposalSection> }) => {
      return await apiRequest(`/api/proposal-sections/${sectionId}`, "PATCH", updates);
    },
    // Silent on success: sections autosave as you type, so a toast per save
    // would fire every time you paused. A failure still surfaces, because that
    // is the case where you need to know your text did not land.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", params.id, "sections"] });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Could not save section",
        description: "Your last change was not saved. Check your connection and try again.",
      });
    },
  });

  const handleSectionUpdate = (sectionId: string, updates: Partial<ProposalSection>) => {
    updateSectionMutation.mutate({ sectionId, updates });
  };

  // Silent batched cascade for the estimate-revision selector. Persists the
  // chosen revision on the proposal AND every estimate section in one shot,
  // showing a single toast instead of one per section.
  const cascadeEstimateRevisionMutation = useMutation({
    mutationFn: async (estimateId: string) => {
      const targets = localSections.filter((s) => {
        if (s.sectionType !== 'estimate') return false;
        const c = (s.content as Record<string, unknown> | null) ?? {};
        return c.estimateId !== estimateId;
      });
      await Promise.all([
        apiRequest(`/api/proposals/${params.id}`, "PATCH", { estimateId }),
        ...targets.map((s) => {
          const c = (s.content as Record<string, unknown> | null) ?? {};
          return apiRequest(`/api/proposal-sections/${s.id}`, "PATCH", {
            content: { ...c, estimateId },
          });
        }),
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", params.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", params.id, "sections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      toast({
        title: "Estimate revision linked",
        description: "The proposal now uses the selected revision.",
      });
    },
    // No onError toast here — the selector surfaces a single destructive
    // toast on failure (and rolls back its optimistic label). Keeping it in
    // both places caused duplicate error toasts.
  });

  const handleEstimateRevisionPick = async (estimateId: string) => {
    // Optimistic local update so the live preview reflects the new revision
    // before the server round-trip resolves.
    const previous = localSections;
    setLocalSections((prev) =>
      prev.map((s) => {
        if (s.sectionType !== 'estimate') return s;
        const c = (s.content as Record<string, unknown> | null) ?? {};
        if (c.estimateId === estimateId) return s;
        return { ...s, content: { ...c, estimateId } } as ProposalSection;
      }),
    );
    try {
      await cascadeEstimateRevisionMutation.mutateAsync(estimateId);
    } catch (err) {
      // Roll back the optimistic local section update on failure.
      setLocalSections(previous);
      throw err;
    }
  };

  // Status colours come from the configurable field category, the same source
  // the list page reads, so the two views never disagree about what "sent"
  // looks like.
  const { data: proposalStatusesData } = useQuery<FieldCategoryWithOptions>({
    queryKey: ["/api/field-categories/by-key/proposal.status"],
  });
  const statusOption = (proposalStatusesData?.options || []).find(
    (o) => o.key === proposal?.status,
  );
  const statusColor = statusOption?.color || null;

  // DOM slot for the proposal toolbar (rendered into the title row via portal
  // by ProposalBuilder).
  const [toolbarSlot, setToolbarSlot] = useState<HTMLDivElement | null>(null);
  // The overflow menu belongs at the far right of the row, so it gets its own
  // slot rather than riding along inside the toolbar.
  const [menuSlot, setMenuSlot] = useState<HTMLDivElement | null>(null);

  const handleAddSection = () => {
    setIsAddingSectionOpen(true);
  };

  const handleCreateSection = () => {
    if (!newSectionName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a section name.",
        variant: "destructive",
      });
      return;
    }

    let content: Record<string, unknown> | undefined;
    if (newSectionType === 'closing') {
      const companyName = companySettings?.companyName || '[Company Name]';
      content = {
        closingText: `<p>Thank you for considering ${companyName}. We look forward to working with you.</p>`,
      };
    } else if (newSectionType === 'terms_conditions') {
      const tpls = companySettings?.termsTemplates ?? [];
      const tpl = tpls.find(
        (t) => Array.isArray(t.defaultFor) && t.defaultFor.includes('proposal'),
      );
      const text = tpl?.content || companySettings?.termsAndConditions || '';
      if (text) content = { termsText: text };
    }

    addSectionMutation.mutate({
      name: newSectionName,
      sectionType: newSectionType,
      description: '',
      ...(content ? { content } : {}),
    });
  };

  const handleSave = () => {
    const data = form.getValues();
    updateProposalMutation.mutate(data);
  };

  /**
   * Proposal-level fields (name, project, validity) save themselves, the way
   * section bodies already do. There is no Save button any more: one used to
   * sit beside Send, both filled plum, and the only thing distinguishing "save
   * my draft" from "email this to the client" was the label.
   */
  const saveFieldsMutation = useMutation({
    mutationFn: async (updates: Partial<InsertProposal>) =>
      apiRequest(`/api/proposals/${params.id}`, "PATCH", updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", params.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Could not save",
        description: "Your last change was not saved. Check your connection and try again.",
      });
    },
  });

  const handleProposalFieldUpdate = (updates: Partial<InsertProposal>) => {
    saveFieldsMutation.mutate(updates);
  };

  if (proposalLoading || sectionsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isNewProposal && !proposal) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Proposal not found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb strip — names the page, so there is no 24px title below.
          The name used to appear twice: as an <h1> and again in an editable
          input directly beneath it. */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-1 flex-shrink-0">
        <button
          onClick={() => setLocation(isProjectContext ? `/projects/${params.projectId}/proposals` : "/proposals")}
          className="text-xs text-muted-foreground hover:text-foreground hover-elevate active-elevate-2 px-1 rounded"
          data-testid="button-back"
        >
          {isProjectContext ? (project?.name ?? "Proposals") : "Proposals"}
        </button>
        <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
        <div className="w-[3px] h-3.5 rounded-full flex-shrink-0" style={{ background: "hsl(var(--primary))" }} aria-hidden="true" />
        <span className="text-xs font-medium text-foreground truncate" data-testid="text-page-title">
          {isNewProposal ? "New Proposal" : proposal?.name}
        </span>
        {!isNewProposal && proposal?.proposalNumber && (
          <span className="text-xs text-muted-foreground/70 font-mono ml-1">#{proposal.proposalNumber}</span>
        )}
      </div>

      {/* Header panel — one condensed row */}
      <div className="border border-border rounded-t-lg bg-card flex-shrink-0">
        <div className="h-8 flex items-center gap-2 px-3">
          {/* Status, revision and view count are facts about the proposal, not
              things you can press. Every bordered control in this row is a
              button, so these carry no border: the status takes its tint from
              the configured field colour (the same source the list uses) and
              the rest are plain muted text. */}
          {proposal?.status && (
            <span
              className={`inline-flex items-center h-6 px-2 rounded-md text-xs font-medium capitalize ${
                statusColor ? "" : "bg-muted/70 text-muted-foreground"
              }`}
              style={
                statusColor
                  ? { backgroundColor: `${statusColor}15`, color: statusColor }
                  : undefined
              }
              data-testid="chip-proposal-status"
            >
              {statusOption?.name || proposal.status.replace("_", " ")}
            </span>
          )}
          {proposal && (proposal as any).version > 1 && (
            <span className="text-xs text-muted-foreground" data-testid="chip-proposal-version">
              {revisionLabel((proposal as any).version)}
            </span>
          )}
          {proposal && (proposal.viewCount ?? 0) > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                  data-testid="chip-proposal-views"
                >
                  <Eye className="w-3 h-3 fill-current" />
                  {proposal.viewCount}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {formatViewedTooltip(proposal.viewCount ?? 0, proposal.lastViewedAt, proposal.viewerDevice)}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Autosave state, where the Save button used to be. */}
          {saveFieldsMutation.isPending && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" data-testid="text-save-state">
              <Loader2 className="w-3 h-3 animate-spin" />
              Saving…
            </span>
          )}

          <div className="flex-1" />

          {/* Estimate selector + Send + ⋯ are portalled in here by the builder */}
          <div ref={setToolbarSlot} className="flex items-center gap-2" data-testid="proposal-toolbar-slot" />

          {/* Overflow menu — last thing in the row, as on every other page */}
          <div ref={setMenuSlot} className="flex items-center" data-testid="proposal-menu-slot" />
        </div>
      </div>

      {/* Body closes the card */}
      <div className="flex-1 min-h-0 overflow-hidden border-x border-b border-border rounded-b-lg bg-card p-3">
        {isNewProposal ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <h3 className="text-lg font-semibold mb-2">Create Your Proposal</h3>
              <p className="text-muted-foreground mb-6">
                Fill in the proposal name and select a project above, then click Save & Continue to access the PDF builder.
              </p>
              <Button 
                onClick={handleSave} 
                disabled={!form.watch('name') || !form.watch('projectId') || updateProposalMutation.isPending}
                data-testid="button-save-first"
              >
                {updateProposalMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Save & Continue'
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full gap-3 min-h-0">
            {/* Revision controls live in the page title row above (estimate
                revision selector + ⋯ menu); ProposalBuilder portals them
                into the title-row toolbar slot. */}
            <div className="flex-1 min-h-0">
              <ProposalBuilder
                proposal={proposal!}
                sections={localSections}
                project={project}
                onSectionsReorder={handleSectionsReorder}
                onSectionUpdate={handleSectionUpdate}
                onAddSection={handleAddSection}
                companyLogo={companySettings?.logoUrl}
                companyName={companySettings?.companyName}
                primaryColor={(proposal?.layoutSettings as { primaryColor?: string } | null)?.primaryColor || companySettings?.proposalPrimaryColor || companySettings?.primaryColor || project?.color || undefined}
                brandColor={companySettings?.brandColor || undefined}
                documentStyle={(companySettings?.documentStyle as 'style1' | 'style2' | undefined) ?? 'style1'}
                toolbarSlot={toolbarSlot}
                menuSlot={menuSlot}
                onEstimateRevisionPick={handleEstimateRevisionPick}
                projects={projects}
                onProposalUpdate={handleProposalFieldUpdate}
                lockProject={isProjectContext}
                companySettings={companySettings}
              />
            </div>
          </div>
        )}
      </div>

      {/* Add Section Dialog */}
      <Dialog open={isAddingSectionOpen} onOpenChange={setIsAddingSectionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Section</DialogTitle>
            <DialogDescription>
              Choose the type of section you want to add to your proposal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Section Type</label>
              <Select value={newSectionType} onValueChange={setNewSectionType}>
                <SelectTrigger data-testid="select-section-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SECTION_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Section Name</label>
              <Input
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                placeholder="Enter section name..."
                data-testid="input-section-name"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsAddingSectionOpen(false)}
                data-testid="button-cancel-section"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateSection}
                disabled={addSectionMutation.isPending}
                data-testid="button-create-section"
              >
                {addSectionMutation.isPending ? 'Adding...' : 'Add Section'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
