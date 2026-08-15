import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ScopeItem, ScopeStage } from "@shared/schema";
import type { StageLabourTracker } from "./types";

export interface UseScopeMutationsOptions {
  projectId: string | undefined;
  /** Current scope items — only read to derive the new item's displayOrder. */
  scopeItems: ScopeItem[];
  /** Collapse a stage by name when it is marked complete. */
  collapseStage: (stageName: string) => void;
  /** Clear the pending delete once the item delete resolves either way. */
  onItemDeleteSettled: () => void;
  /** Close the template dialog after a template applies. */
  onTemplateApplied: () => void;
}

/**
 * Every mutation the Project Scope page issues, extracted verbatim from
 * ProjectScope.tsx (Scope-PR2). The three callbacks above are the only places
 * a mutation reached back into page state; everything else is unchanged.
 */
export function useScopeMutations({
  projectId,
  scopeItems,
  collapseStage,
  onItemDeleteSettled,
  onTemplateApplied,
}: UseScopeMutationsOptions) {
  const { toast } = useToast();

  // Initialize default stages if empty
  const initializeStagesMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/projects/${projectId}/scope-stages/initialize`, 'POST');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope-stages`] });
      toast({ title: "Default stages initialized" });
    },
  });

  // Create stage mutation
  const createStageMutation = useMutation({
    mutationFn: async ({ name, displayOrder }: { name: string; displayOrder: number }) => {
      return apiRequest(`/api/projects/${projectId}/scope-stages`, 'POST', {
        projectId,
        name,
        displayOrder,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope-stages`] });
      toast({ title: "Stage added successfully" });
    },
    onError: (err: any) => {
      // Surface server-side rejections (most importantly 409 from the
      // unique index when a duplicate slips past the client-side check
      // due to a race or a stale cache).
      const status = err?.status;
      const details = err?.payload?.details;
      const errorMsg = err?.payload?.error;
      if (status === 409) {
        toast({
          title: errorMsg || "Duplicate stage name",
          description: details || "A stage with that name already exists in this project",
          variant: "destructive",
        });
        // Refresh so the existing stage shows up in the UI
        queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope-stages`] });
        return;
      }
      toast({
        title: "Failed to add stage",
        description: details || errorMsg || "Please try again",
        variant: "destructive",
      });
    },
  });

  // Update stage mutation with optimistic updates to prevent flickering
  const updateStageMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      return apiRequest(`/api/scope-stages/${id}`, 'PATCH', { name });
    },
    onMutate: async ({ id, name }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: [`/api/projects/${projectId}/scope-stages`] });

      // Snapshot the previous value
      const previousStages = queryClient.getQueryData<ScopeStage[]>([`/api/projects/${projectId}/scope-stages`]);

      // Optimistically update the cache
      queryClient.setQueryData<ScopeStage[]>([`/api/projects/${projectId}/scope-stages`], (old) => {
        if (!old) return old;
        return old.map(stage => stage.id === id ? { ...stage, name } : stage);
      });

      return { previousStages };
    },
    onError: (err: any, _variables, context) => {
      // Rollback on error
      if (context?.previousStages) {
        queryClient.setQueryData([`/api/projects/${projectId}/scope-stages`], context.previousStages);
      }
      const status = err?.status;
      const details = err?.payload?.details;
      const errorMsg = err?.payload?.error;
      if (status === 409) {
        toast({
          title: errorMsg || "Duplicate stage name",
          description: details || "A stage with that name already exists in this project",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Failed to update stage",
        description: details || errorMsg,
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope-stages`] });
    },
    onSuccess: () => {
      // Cascade rename also updated scope_items.stage on the server, so
      // refresh the items query as well to keep the UI in sync.
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope`] });
      toast({ title: "Stage updated" });
    },
  });

  // Toggle stage completion
  const toggleStageCompleteMutation = useMutation({
    mutationFn: async ({ id, isCompleted }: { id: string; isCompleted: boolean }) => {
      return apiRequest(`/api/scope-stages/${id}`, 'PATCH', {
        isCompleted,
        completedAt: isCompleted ? new Date().toISOString() : null,
      });
    },
    onMutate: async ({ id, isCompleted }) => {
      await queryClient.cancelQueries({ queryKey: [`/api/projects/${projectId}/scope-stages`] });
      const previousStages = queryClient.getQueryData<ScopeStage[]>([`/api/projects/${projectId}/scope-stages`]);
      queryClient.setQueryData<ScopeStage[]>([`/api/projects/${projectId}/scope-stages`], (old) => {
        if (!old) return old;
        return old.map(stage => stage.id === id ? { ...stage, isCompleted } : stage);
      });
      // Also collapse the stage if marking complete (find stage name for the key)
      if (isCompleted) {
        const stageName = previousStages?.find(s => s.id === id)?.name;
        if (stageName) {
          collapseStage(stageName);
        }
      }
      return { previousStages };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousStages) {
        queryClient.setQueryData([`/api/projects/${projectId}/scope-stages`], context.previousStages);
      }
      toast({ title: "Failed to update stage completion", variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope-stages`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope`] });
    },
  });

  // Update labour trackers on a stage
  const updateLabourTrackersMutation = useMutation({
    mutationFn: async ({ id, labourTrackers }: { id: string; labourTrackers: StageLabourTracker[] }) => {
      return apiRequest(`/api/scope-stages/${id}`, 'PATCH', { labourTrackers });
    },
    onMutate: async ({ id, labourTrackers }) => {
      await queryClient.cancelQueries({ queryKey: [`/api/projects/${projectId}/scope-stages`] });
      const previousStages = queryClient.getQueryData<ScopeStage[]>([`/api/projects/${projectId}/scope-stages`]);
      queryClient.setQueryData<ScopeStage[]>([`/api/projects/${projectId}/scope-stages`], (old) => {
        if (!old) return old;
        return old.map(stage => stage.id === id ? { ...stage, labourTrackers } : stage);
      });
      return { previousStages };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousStages) {
        queryClient.setQueryData([`/api/projects/${projectId}/scope-stages`], context.previousStages);
      }
      toast({ title: "Failed to update labour tracker", variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope-stages`] });
    },
  });

  // Delete stage mutation
  const deleteStageMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/scope-stages/${id}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope-stages`] });
      toast({ title: "Stage deleted successfully" });
    },
  });

  // Reorder stages mutation with optimistic updates
  const reorderStagesMutation = useMutation({
    mutationFn: async (updates: { id: string; displayOrder: number; parentId?: string | null }[]) => {
      return apiRequest('/api/scope-stages/reorder', 'POST', { updates });
    },
    onMutate: async (updates) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: [`/api/projects/${projectId}/scope-stages`] });

      // Snapshot the previous value
      const previousStages = queryClient.getQueryData<ScopeStage[]>([`/api/projects/${projectId}/scope-stages`]);

      // Optimistically update the cache
      queryClient.setQueryData<ScopeStage[]>([`/api/projects/${projectId}/scope-stages`], (old) => {
        if (!old) return old;
        return old.map(stage => {
          const update = updates.find(u => u.id === stage.id);
          if (update) {
            return {
              ...stage,
              displayOrder: update.displayOrder,
              parentId: update.parentId !== undefined ? update.parentId : stage.parentId
            };
          }
          return stage;
        });
      });

      return { previousStages };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousStages) {
        queryClient.setQueryData([`/api/projects/${projectId}/scope-stages`], context.previousStages);
      }
      toast({ title: "Failed to reorder stages", variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope-stages`] });
    },
  });

  // Update mutation with optimistic updates for better UX
  const updateItemMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ScopeItem> }) => {
      return apiRequest(`/api/scope/${id}`, 'PATCH', data);
    },
    onMutate: async ({ id, data }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: [`/api/projects/${projectId}/scope`] });

      // Snapshot the previous value
      const previousItems = queryClient.getQueryData<ScopeItem[]>([`/api/projects/${projectId}/scope`]);

      // Optimistically update the cache
      queryClient.setQueryData<ScopeItem[]>([`/api/projects/${projectId}/scope`], (old) => {
        if (!old) return old;
        return old.map(item => item.id === id ? { ...item, ...data } : item);
      });

      return { previousItems };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousItems) {
        queryClient.setQueryData([`/api/projects/${projectId}/scope`], context.previousItems);
      }
      toast({ title: "Failed to update item", variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope`] });
    },
  });

  // Reorder items mutation with optimistic updates
  const reorderMutation = useMutation({
    mutationFn: async (updates: { id: string; displayOrder: number }[]) => {
      return apiRequest('/api/scope/reorder', 'POST', { updates });
    },
    onMutate: async (updates) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: [`/api/projects/${projectId}/scope`] });

      // Snapshot the previous value
      const previousItems = queryClient.getQueryData<ScopeItem[]>([`/api/projects/${projectId}/scope`]);

      // Optimistically update the cache
      queryClient.setQueryData<ScopeItem[]>([`/api/projects/${projectId}/scope`], (old) => {
        if (!old) return old;
        return old.map(item => {
          const update = updates.find(u => u.id === item.id);
          if (update) {
            return { ...item, displayOrder: update.displayOrder };
          }
          return item;
        });
      });

      return { previousItems };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousItems) {
        queryClient.setQueryData([`/api/projects/${projectId}/scope`], context.previousItems);
      }
      toast({ title: "Failed to reorder items", variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope`] });
    },
  });

  // Delete mutation
  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/scope/${id}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope`] });
      onItemDeleteSettled();
      toast({ title: "Scope item deleted" });
    },
    onError: () => {
      onItemDeleteSettled();
      toast({ title: "Failed to delete item", variant: "destructive" });
    },
  });

  // Apply template mutation
  const applyTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      return apiRequest(`/api/scope-templates/${templateId}/apply`, 'POST', { projectId });
    },
    onSuccess: (result: any) => {
      // Invalidate both scope items and stages queries
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope-stages`] });
      onTemplateApplied();
      const itemCount = Array.isArray(result) ? result.length : 0;
      toast({ title: `Template applied successfully${itemCount > 0 ? ` - ${itemCount} items added!` : ''}` });
    },
  });

  // Create scope item mutation
  const createItemMutation = useMutation({
    mutationFn: async ({ title, description, stage }: { title: string; description: string; stage: string }) => {
      return apiRequest(`/api/projects/${projectId}/scope`, 'POST', {
        title,
        description, // Store as HTML (consistent with existing items)
        stage,
        displayOrder: scopeItems.filter(i => i.stage === stage).length,
        needsRfi: false,
        needsRfq: false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope`] });
    },
  });

  // Link a PO to a scope stage
  const linkPOMutation = useMutation({
    mutationFn: ({ poId, stageId }: { poId: string; stageId: string }) =>
      apiRequest(`/api/purchase-orders/${poId}`, 'PATCH', { scopeStageId: stageId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/purchase-orders', { projectId }] });
    },
    onError: () => {
      toast({ title: "Failed to link PO", variant: "destructive" });
    },
  });

  // Unlink a PO from its scope stage
  const unlinkPOMutation = useMutation({
    mutationFn: (poId: string) =>
      apiRequest(`/api/purchase-orders/${poId}`, 'PATCH', { scopeStageId: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/purchase-orders', { projectId }] });
    },
    onError: () => {
      toast({ title: "Failed to unlink PO", variant: "destructive" });
    },
  });

  // Link a checklist instance to a scope stage
  const linkChecklistMutation = useMutation({
    mutationFn: ({ checklistId, stageId }: { checklistId: string; stageId: string }) =>
      apiRequest(`/api/checklist-instances/${checklistId}`, 'PATCH', { scopeStageId: stageId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/checklist-instances', { projectId }] });
    },
    onError: () => {
      toast({ title: "Failed to link checklist", variant: "destructive" });
    },
  });

  const unlinkChecklistMutation = useMutation({
    mutationFn: (checklistId: string) =>
      apiRequest(`/api/checklist-instances/${checklistId}`, 'PATCH', { scopeStageId: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/checklist-instances', { projectId }] });
    },
    onError: () => {
      toast({ title: "Failed to unlink checklist", variant: "destructive" });
    },
  });

  const linkTaskMutation = useMutation({
    mutationFn: ({ taskId, stageId }: { taskId: string; stageId: string }) =>
      apiRequest(`/api/systems/task-templates/${taskId}`, 'PATCH', { scopeStageId: stageId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/systems/task-templates'] });
    },
    onError: () => {
      toast({ title: "Failed to link task", variant: "destructive" });
    },
  });

  const unlinkTaskMutation = useMutation({
    mutationFn: (taskId: string) =>
      apiRequest(`/api/systems/task-templates/${taskId}`, 'PATCH', { scopeStageId: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/systems/task-templates'] });
    },
    onError: () => {
      toast({ title: "Failed to unlink task", variant: "destructive" });
    },
  });

  const updateStageAttachmentsMutation = useMutation({
    mutationFn: ({ stageId, attachments }: { stageId: string; attachments: unknown[] }) =>
      apiRequest(`/api/scope-stages/${stageId}`, 'PATCH', { attachments }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope-stages`] });
    },
  });

  return {
    initializeStagesMutation,
    createStageMutation,
    updateStageMutation,
    toggleStageCompleteMutation,
    updateLabourTrackersMutation,
    deleteStageMutation,
    reorderStagesMutation,
    updateItemMutation,
    reorderMutation,
    deleteItemMutation,
    applyTemplateMutation,
    createItemMutation,
    linkPOMutation,
    unlinkPOMutation,
    linkChecklistMutation,
    unlinkChecklistMutation,
    linkTaskMutation,
    unlinkTaskMutation,
    updateStageAttachmentsMutation,
  };
}

export default useScopeMutations;
