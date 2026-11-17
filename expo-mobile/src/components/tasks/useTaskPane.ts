import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useLayout } from '../../lib/useLayout';
import { haptic } from '../../lib/haptics';

/**
 * Two-pane state for the task lists, which have no task detail ROUTE (a task
 * opens in a sheet/modal on a phone), so lib/twoPane's useTwoPaneSelection —
 * which pushes a screen on a phone — doesn't fit. Same idea as Checklists:
 * the screen owns the open id and drives <TwoPane> itself.
 *
 *   Duo unfolded → a tapped task opens in the right panel (openInPane).
 *   Fold with a task open on the right → the SAME panel stays mounted and
 *     fills the outer screen (TwoPane's narrowDetail), with a back button.
 *     We don't hand over to the sheet: that would be a fresh TaskComments and
 *     a half-typed comment would be lost.
 *   Unfold again → back to side by side, same panel.
 *
 * The fold is detected DURING render (React's "adjust state on prop change"
 * pattern), not in an effect. An effect runs after the folded frame has been
 * committed, and in that frame TwoPane would have dropped the detail (it only
 * renders it when wide or held) — unmounting it and losing the draft.
 */
export function useTaskPane() {
  const { isWide } = useLayout();
  const [paneTaskId, setPaneTaskId] = useState<string | null>(null);
  const [heldOnFold, setHeldOnFold] = useState(false);
  const [prevWide, setPrevWide] = useState(isWide);

  if (prevWide !== isWide) {
    setPrevWide(isWide);
    if (prevWide && !isWide && paneTaskId) setHeldOnFold(true);
    if (!prevWide && isWide) setHeldOnFold(false);
  }
  // Also true for the render that detects the fold (state above is queued).
  const folding = prevWide && !isWide && !!paneTaskId;

  const close = useCallback(() => {
    setPaneTaskId(null);
    setHeldOnFold(false);
  }, []);

  const narrowDetail = !isWide && (heldOnFold || folding) && !!paneTaskId;

  return {
    isWide,
    paneTaskId,
    openInPane: setPaneTaskId,
    close,
    /** Spread onto <TwoPane>. */
    paneProps: { narrowDetail, onCloseDetail: close },
  };
}

/**
 * "Discard changes?" before closing a task form with unsaved edits.
 * Not dismissable by tapping outside (Android), so the choice is explicit.
 */
export function confirmDiscard(onDiscard: () => void, onKeep?: () => void) {
  haptic.warning();
  Alert.alert(
    'Discard changes?',
    'Your unsaved changes to this task will be lost.',
    [
      { text: 'Keep editing', style: 'cancel', onPress: onKeep },
      { text: 'Discard', style: 'destructive', onPress: onDiscard },
    ],
    { cancelable: false },
  );
}
