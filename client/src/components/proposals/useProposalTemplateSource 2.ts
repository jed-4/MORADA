import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { InsertProposal, ProposalSection, ProposalTemplate } from '@shared/schema';
import {
  rowsToTemplateSections,
  templateProposal,
  templateSectionId,
  templateSectionsToRows,
  TEMPLATE_CAPABILITIES,
  type ProposalDocumentSource,
} from './proposalDocumentSource';

const SAVE_DEBOUNCE_MS = 700;

/**
 * A template, edited by the real proposal builder.
 *
 * The whole document is ONE row, so unlike a proposal — where each section is
 * its own row and its own PATCH — every edit here rewrites the same record.
 * That makes local state the source of truth while the page is open, and the
 * save a debounced write of the whole thing. It also means the lost-update
 * problem the old jsonb array had cannot come back: two people editing two
 * different templates now touch two different rows.
 */
export function useProposalTemplateSource(template: ProposalTemplate | undefined): ProposalDocumentSource | null {
  const { toast } = useToast();
  const [sections, setSections] = useState<ProposalSection[]>([]);
  const [layoutSettings, setLayoutSettings] = useState<Record<string, any>>({});
  const [name, setName] = useState('');
  const loadedId = useRef<string | null>(null);

  /* Load once per template. Re-syncing on every query refetch would fight the
     builder: a section edit updates local state, the save invalidates the
     query, and the refetched row would overwrite whatever was typed in the
     meantime. */
  useEffect(() => {
    if (!template || loadedId.current === template.id) return;
    loadedId.current = template.id;
    setSections(templateSectionsToRows(template));
    setLayoutSettings((template.layoutSettings ?? {}) as Record<string, any>);
    setName(template.name);
  }, [template]);

  const saveMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      if (!template) return null;
      return apiRequest(`/api/proposal-templates/${template.id}`, 'PATCH', body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/proposal-templates'] });
    },
    onError: (err: unknown) => {
      toast({
        variant: 'destructive',
        title: 'Could not save the template',
        description: err instanceof Error ? err.message : 'Your last change was not stored.',
      });
    },
  });

  /*
   * One timer for the whole document. A builder editing a section title types
   * a character at a time, and each keystroke would otherwise be a PATCH of
   * every section in the template.
   *
   * `mutate` is held in a ref rather than closed over. useMutation returns a
   * NEW object every render, so putting it in this callback's dependencies
   * made `save` — and therefore every writer below it, and therefore the
   * source object itself — new on every render. The builder re-rendered, its
   * PDF effect re-fired, and the page span in an infinite loop that React
   * reported as "Maximum update depth exceeded".
   */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Record<string, unknown>>({});
  const mutateRef = useRef(saveMutation.mutate);
  mutateRef.current = saveMutation.mutate;

  const save = useCallback((patch: Record<string, unknown>) => {
    pending.current = { ...pending.current, ...patch };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const body = pending.current;
      pending.current = {};
      if (Object.keys(body).length > 0) mutateRef.current(body);
    }, SAVE_DEBOUNCE_MS);
  }, []);

  /* A pending edit must not be lost because the page was closed a beat early.
     Keyed on the id, not the object: react-query hands back a new object on
     every refetch, and flushing on each one would PATCH mid-edit. */
  const templateId = template?.id;
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    const body = pending.current;
    pending.current = {};
    if (Object.keys(body).length > 0 && templateId) {
      void apiRequest(`/api/proposal-templates/${templateId}`, 'PATCH', body);
    }
  }, [templateId]);

  const commitSections = useCallback(
    (next: ProposalSection[]) => {
      setSections(next);
      save({ sections: rowsToTemplateSections(next) });
    },
    [save],
  );

  const updateSection = useCallback(
    (sectionId: string, updates: Partial<ProposalSection>) => {
      setSections((prev) => {
        const next = prev.map((s) => (s.id === sectionId ? { ...s, ...updates } : s));
        save({ sections: rowsToTemplateSections(next) });
        return next;
      });
    },
    [save],
  );

  const addSectionsRef = useRef<(sections: Partial<ProposalSection>[]) => void>(() => {});

  /** One section is the batch of one — same code path, so they cannot drift. */
  const addSection = useCallback(
    (section: Partial<ProposalSection>) => {
      addSectionsRef.current([section]);
    },
    [],
  );

  const addSections = useCallback(
    (incoming: Partial<ProposalSection>[]) => {
      setSections((prev) => {
        const rows = incoming.map((section, i) => ({
          id: `${templateSectionId(prev.length + i)}-${Date.now()}`,
          proposalId: templateId ?? '',
          name: section.name || 'New Section',
          description: section.description ?? null,
          descriptionHtml: (section as { descriptionHtml?: string | null }).descriptionHtml ?? null,
          order: prev.length + i,
          isCollapsed: false,
          isEnabled: section.isEnabled !== false,
          sectionType: section.sectionType || 'custom',
          templateId: null,
          content: (section.content ?? {}) as Record<string, unknown>,
          showPricing: section.showPricing !== false,
          showSubtotal: section.showSubtotal !== false,
          createdAt: new Date(),
          updatedAt: new Date(),
        })) as unknown as ProposalSection[];
        const next = [...prev, ...rows];
        save({ sections: rowsToTemplateSections(next) });
        return next;
      });
    },
    [save, templateId],
  );

  addSectionsRef.current = addSections;

  const updateProposal = useCallback(
    (updates: Partial<InsertProposal>) => {
      const patch: Record<string, unknown> = {};
      if (updates.layoutSettings !== undefined) {
        const merged = { ...layoutSettings, ...(updates.layoutSettings as Record<string, any>) };
        setLayoutSettings(merged);
        patch.layoutSettings = merged;
      }
      // A template's `name` is the template's name, not a proposal's — the
      // builder's title field edits the same string either way.
      if (typeof updates.name === 'string') {
        setName(updates.name);
        patch.name = updates.name;
      }
      if (Object.keys(patch).length > 0) save(patch);
    },
    [layoutSettings, save],
  );

  return useMemo(() => {
    if (!template) return null;
    return {
      kind: 'template',
      proposal: {
        ...templateProposal(template),
        name,
        layoutSettings,
      },
      sections,
      updateSection,
      addSection,
      addSections,
      reorderSections: commitSections,
      updateProposal,
      can: TEMPLATE_CAPABILITIES,
      isSaving: saveMutation.isPending,
    };
  }, [template, name, layoutSettings, sections, updateSection, addSection, addSections, commitSections, updateProposal, saveMutation.isPending]);
}
