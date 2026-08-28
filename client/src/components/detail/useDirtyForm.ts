import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Form state for a detail page: hydrate from the server record, track whether
 * the user has changed anything, and warn before the change is lost.
 *
 * Every detail page reimplemented the first two halves and none implemented the
 * third — RFQDetail's version had no navigate-away guard at all, so edits
 * vanished silently if you clicked away with the Save button showing.
 *
 * Server updates are only re-applied while the form is clean, so a refetch
 * landing mid-edit doesn't overwrite what the user is typing.
 */
export interface UseDirtyFormOptions<T> {
  /** Server record. Re-hydrates the form when it changes and nothing is dirty. */
  source: unknown;
  /** Maps the server record to form state. Must be stable or cheap. */
  toFormState: () => T;
  /** Guard against navigating away with unsaved changes. Default true. */
  warnOnUnload?: boolean;
}

export function useDirtyForm<T extends Record<string, any>>({
  source,
  toFormState,
  warnOnUnload = true,
}: UseDirtyFormOptions<T>) {
  const [formData, setFormData] = useState<T>(() => toFormState());
  const [dirty, setDirty] = useState(false);

  // Read through a ref so the hydration effect depends only on `source` — a
  // caller passing an inline arrow (the normal case) would otherwise re-run it
  // on every render and clobber in-progress edits.
  const toFormStateRef = useRef(toFormState);
  toFormStateRef.current = toFormState;

  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    if (!source) return;
    if (dirtyRef.current) return; // never overwrite what the user is typing
    setFormData(toFormStateRef.current());
  }, [source]);

  useEffect(() => {
    if (!warnOnUnload || !dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Browsers show their own copy; a non-empty returnValue is what triggers it.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [warnOnUnload, dirty]);

  const setField = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
  }, []);

  const setFields = useCallback((patch: Partial<T>) => {
    setFormData((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }, []);

  /** Call after a successful save. */
  const markClean = useCallback(() => setDirty(false), []);

  /** Discard local edits and re-read the server record. */
  const reset = useCallback(() => {
    setFormData(toFormStateRef.current());
    setDirty(false);
  }, []);

  return { formData, setFormData, setField, setFields, dirty, markClean, reset };
}
