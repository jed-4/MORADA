import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ProposalBuilder } from "@/components/proposals/ProposalBuilder";
import { useProposalTemplateSource } from "@/components/proposals/useProposalTemplateSource";
import { AddSectionDialog } from "@/components/proposals/AddSectionDialog";
import type { ProposalTemplate } from "@shared/schema";

/**
 * A proposal template, edited by the real proposal builder.
 *
 * There is deliberately almost nothing in this file. It fetches one row,
 * wraps it in a document source, and hands that to ProposalBuilder — the same
 * component /proposals/:id uses. Every section editor, the Layout panel, the
 * cover templates, the page-break controls and the live PDF preview are the
 * proposal page's, not copies of them, so the two cannot drift as either is
 * iterated.
 *
 * That is the whole design. EstimateTemplateDetail took the other road — a
 * 676-line reimplementation of a 7,564-line page — and the two have been
 * diverging ever since.
 */
export default function ProposalTemplateDetail() {
  const params = useParams<{ templateId: string }>();
  const [, setLocation] = useLocation();
  const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null>(null);
  const [menuSlot, setMenuSlot] = useState<HTMLElement | null>(null);
  const [addingSection, setAddingSection] = useState(false);

  const { data: template, isLoading } = useQuery<ProposalTemplate>({
    queryKey: ["/api/proposal-templates", params.templateId],
    enabled: !!params.templateId,
  });

  const { data: companySettings } = useQuery<{
    logoUrl?: string;
    companyName?: string;
    termsAndConditions?: string | null;
    termsTemplates?: Array<{ id: string; name: string; content: string; defaultFor?: string[] }>;
    brandColor?: string;
    brandSecondaryColor?: string;
    documentStyle?: string;
  } | null>({
    queryKey: ["/api/company-settings"],
  });

  const source = useProposalTemplateSource(template);

  if (isLoading || !source) {
    return (
      <div className="flex items-center justify-center h-full">
        {isLoading ? (
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        ) : (
          <p className="text-muted-foreground">Template not found</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Same breadcrumb strip as the proposal page: the name lives here, not
          in a heading above a second copy of itself. */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-1 flex-shrink-0">
        <button
          onClick={() => setLocation("/proposal-templates")}
          className="text-xs text-muted-foreground hover:text-foreground hover-elevate active-elevate-2 px-1 rounded"
          data-testid="button-back"
        >
          Proposal Templates
        </button>
        <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
        <div
          className="w-[3px] h-3.5 rounded-full flex-shrink-0"
          style={{ background: "hsl(var(--primary))" }}
          aria-hidden="true"
        />
        <Input
          value={source.proposal.name}
          onChange={(e) => source.updateProposal({ name: e.target.value } as never)}
          className="h-6 border-0 bg-transparent px-1 text-xs font-medium shadow-none focus-visible:ring-1 w-auto min-w-[12rem]"
          aria-label="Template name"
          data-testid="input-template-name"
        />
      </div>

      <div className="border border-border rounded-t-lg bg-card flex-shrink-0">
        <div className="h-8 flex items-center gap-2 px-3">
          <span
            className="inline-flex items-center h-6 px-2 rounded-md text-xs font-medium bg-muted/70 text-muted-foreground"
            data-testid="chip-template"
          >
            Template
          </span>

          {source.isSaving && (
            <span
              className="inline-flex items-center gap-1 text-xs text-muted-foreground"
              data-testid="text-save-state"
            >
              <Loader2 className="w-3 h-3 animate-spin" />
              Saving…
            </span>
          )}

          <div className="flex-1" />
          <div ref={setToolbarSlot} className="flex items-center gap-2" data-testid="proposal-toolbar-slot" />
          <div ref={setMenuSlot} className="flex items-center" data-testid="proposal-menu-slot" />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden border-x border-b border-border rounded-b-lg bg-card p-3">
        <div className="flex-1 min-h-0 h-full">
          <ProposalBuilder
            source={source}
            proposal={source.proposal}
            sections={source.sections}
            onSectionsReorder={source.reorderSections}
            onSectionUpdate={source.updateSection}
            /* The same dialog the proposal page uses. A template that could
               only hold "custom" sections could not carry a cover page, an
               estimate or an imported PDF intro — which is most of what a
               builder wants a template FOR. */
            onAddSection={() => setAddingSection(true)}
            companyLogo={companySettings?.logoUrl}
            companyName={companySettings?.companyName}
            /* The same colour chain the proposal page resolves, minus the
               per-proposal override a template does not have. */
            primaryColor={
              (source.proposal.layoutSettings as { primaryColor?: string } | null)?.primaryColor
              || companySettings?.brandColor
              || undefined
            }
            companySecondaryColor={companySettings?.brandSecondaryColor || undefined}
            documentStyle={(companySettings?.documentStyle as "style1" | "style2" | undefined) ?? "style1"}
            toolbarSlot={toolbarSlot}
            menuSlot={menuSlot}
          />
        </div>
      </div>
      <AddSectionDialog
        open={addingSection}
        onOpenChange={setAddingSection}
        company={companySettings}
        noun="template"
        onAdd={(section) => {
          source.addSection(section);
          setAddingSection(false);
        }}
      />
    </div>
  );
}
