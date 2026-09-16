import { useRef } from "react";

/**
 * A dialog that holds an edit should COMMIT it when dismissed, not throw it away.
 *
 * Radix reports every way a dialog can close — clicking outside, the × button,
 * Escape — through one `onOpenChange(false)`, and the estimate dialogs wired that
 * straight to their Cancel path. So typing into a group, an item or a description
 * and clicking back onto the grid silently discarded the lot. This is the
 * spreadsheet rule instead: leaving the field keeps what you typed.
 *
 * Escape and an explicit Cancel button still discard. Those are deliberate — the
 * same way Escape abandons an edit in a grid cell — whereas a click elsewhere is
 * someone moving on.
 *
 * `commit` should submit through the form's validation. On success the caller's
 * mutation closes the dialog; if validation fails nothing closes, so the error
 * shows on the field rather than the edit vanishing.
 *
 * Usage:
 *   const dismiss = useCommitOnDismiss({ isDirty, commit, discard });
 *   <Dialog open={open} onOpenChange={dismiss.onOpenChange}>
 *     <DialogContent {...dismiss.contentProps}>
 */
export function useCommitOnDismiss({
  isDirty,
  commit,
  discard,
}: {
  /** Read at the moment of dismissal, so pass a function rather than a value. */
  isDirty: () => boolean;
  /** Save the edit. Should run validation, and close the dialog on success. */
  commit: () => void;
  /** Close without saving. */
  discard: () => void;
}) {
  // Radix doesn't say WHY the dialog is closing, so note Escape on the way past.
  const closingByEscape = useRef(false);

  return {
    onOpenChange: (open: boolean) => {
      if (open) return;
      const byEscape = closingByEscape.current;
      closingByEscape.current = false;
      if (!byEscape && isDirty()) {
        commit();
        return;
      }
      discard();
    },
    contentProps: {
      onEscapeKeyDown: () => {
        closingByEscape.current = true;
      },
    },
  };
}
