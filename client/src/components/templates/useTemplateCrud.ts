import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/** Success-toast descriptions. Titles are standardised ("Template created", ...). */
export interface TemplateCrudToasts {
  created?: string;
  updated?: string;
  deleted?: string;
  duplicated?: string;
}

/** Error-toast descriptions. Title is standardised ("Error"). */
export interface TemplateCrudErrorToasts {
  create?: string;
  update?: string;
  delete?: string;
  duplicate?: string;
}

export interface ConfirmDeleteTarget {
  id: string;
  name: string;
}

export interface UseTemplateCrudOptions<T extends { id: string; name: string }> {
  /** REST base route, e.g. "/api/purchase-order-templates". */
  apiBase: string;
  /** Query key to fetch/invalidate. Defaults to [apiBase]. */
  queryKey?: readonly unknown[];
  /** Override the default success-toast descriptions. */
  toasts?: TemplateCrudToasts;
  /** Override the default error-toast descriptions. */
  errorToasts?: TemplateCrudErrorToasts;
  /** Build the POST body for the Duplicate action from the source template. */
  duplicatePayload: (template: T) => Record<string, unknown>;
  /** Called after a successful create (close dialog, navigate to detail, ...). */
  onCreateSuccess?: (created: T) => void;
  /** Called after a successful update (close dialog, reset form, ...). */
  onUpdateSuccess?: (updated: T) => void;
}

/**
 * Shared create/update/delete/duplicate mutations for template list pages.
 * Handles toasts, query invalidation, and the delete-confirmation target.
 */
export function useTemplateCrud<T extends { id: string; name: string }>({
  apiBase,
  queryKey,
  toasts,
  errorToasts,
  duplicatePayload,
  onCreateSuccess,
  onUpdateSuccess,
}: UseTemplateCrudOptions<T>) {
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDeleteTarget | null>(null);

  const resolvedQueryKey = queryKey ?? [apiBase];
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: resolvedQueryKey as unknown[] });

  const errorToast = (description: string) =>
    toast({ title: "Error", description, variant: "destructive" });

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>): Promise<T> => {
      return await apiRequest(apiBase, "POST", payload);
    },
    onSuccess: (created: T) => {
      invalidate();
      toast({
        title: "Template created",
        description: toasts?.created ?? "Your new template has been created.",
      });
      onCreateSuccess?.(created);
    },
    onError: () => errorToast(errorToasts?.create ?? "Failed to create template."),
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Record<string, unknown>;
    }): Promise<T> => {
      return await apiRequest(`${apiBase}/${id}`, "PATCH", data);
    },
    onSuccess: (updated: T) => {
      invalidate();
      toast({
        title: "Template updated",
        description: toasts?.updated ?? "The template has been updated successfully.",
      });
      onUpdateSuccess?.(updated);
    },
    onError: () => errorToast(errorToasts?.update ?? "Failed to update template."),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`${apiBase}/${id}`, "DELETE");
    },
    onSuccess: () => {
      invalidate();
      toast({
        title: "Template deleted",
        description: toasts?.deleted ?? "The template has been deleted successfully.",
      });
    },
    onError: () => errorToast(errorToasts?.delete ?? "Failed to delete template."),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (template: T): Promise<T> => {
      return await apiRequest(apiBase, "POST", duplicatePayload(template));
    },
    onSuccess: () => {
      invalidate();
      toast({
        title: "Template duplicated",
        description: toasts?.duplicated ?? "The template has been duplicated successfully.",
      });
    },
    onError: () => errorToast(errorToasts?.duplicate ?? "Failed to duplicate template."),
  });

  return {
    queryKey: resolvedQueryKey,
    createMutation,
    updateMutation,
    deleteMutation,
    duplicateMutation,
    /** Pending state shared by the save button (create or update in flight). */
    isSaving: createMutation.isPending || updateMutation.isPending,
    /** The template queued for deletion (drives ConfirmDialog). */
    confirmDelete,
    setConfirmDelete,
  };
}
