import { useCallback, useEffect, useRef, useState } from 'react';
import { useLayout } from './useLayout';

/**
 * Selection for a list + detail screen (see components/ui/TwoPane).
 *
 *   Phone / Duo folded  → tapping a row pushes the detail screen, as before.
 *   Duo unfolded        → tapping a row opens it in the right panel.
 *
 * Keeping your place when the phone changes shape:
 *   - Fold while an item is open on the right → the SAME detail (still
 *     mounted, so a half-typed comment or an open document survives) fills the
 *     outer screen, with a back bar to the list. We deliberately do NOT push
 *     the detail screen here: a pushed screen is a new instance and would
 *     start empty.
 *   - Unfold while on a pushed detail screen → useReturnToTwoPane (below) pops
 *     back to the list and opens that item on the right.
 *
 * Spread `paneProps` onto <TwoPane>.
 */

/** Route param the detail screen sends back to the list on unfold. */
export const TWO_PANE_SELECT_PARAM = 'twoPaneSelect';
/** Sent with it so handing back the SAME id a second time still registers. */
const TWO_PANE_SELECT_AT_PARAM = 'twoPaneSelectAt';

interface Nav {
  navigate: (name: string, params?: any) => void;
  isFocused: () => boolean;
}

interface SelectionOptions<P> {
  navigation: Nav;
  /** The list screen's route, to pick up a selection handed back on unfold. */
  route?: { params?: any };
  /** Stack screen that shows one item full-screen on a phone. */
  detailRoute: string;
  /** Route params for that screen. */
  paramsFor: (id: string) => P;
}

export function useTwoPaneSelection<P extends object>({ navigation, route, detailRoute, paramsFor }: SelectionOptions<P>) {
  const { isWide } = useLayout();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // True after a fold with an item open: the detail stays on screen, full width.
  const [heldOnFold, setHeldOnFold] = useState(false);

  // Keep the latest callback without re-creating `open` for it.
  const paramsRef = useRef(paramsFor);
  paramsRef.current = paramsFor;

  const open = useCallback(
    (id: string) => {
      setHeldOnFold(false);
      if (isWide) {
        setSelectedId(id);
        return;
      }
      // Phone / folded: the pushed screen shows it. Leave no selection behind,
      // or coming back to the list and later unfolding would mount that stale
      // item on the right (and, for Messages, silently mark it read). An unfold
      // while the detail is still pushed hands the id back (useReturnToTwoPane).
      setSelectedId(null);
      navigation.navigate(detailRoute, paramsRef.current(id));
    },
    [isWide, navigation, detailRoute],
  );

  const close = useCallback(() => {
    setSelectedId(null);
    setHeldOnFold(false);
  }, []);

  // Folded with something open on the right → keep it showing.
  // Detected DURING RENDER (React's "adjust state when a prop changes"
  // pattern), not in an effect: an effect runs after the folded frame is
  // committed, and in that frame TwoPane would drop the detail — unmounting it
  // and losing a half-typed comment — before remounting it a frame later.
  const [prevWide, setPrevWide] = useState(isWide);
  if (prevWide !== isWide) {
    setPrevWide(isWide);
    if (prevWide && !isWide && selectedId) setHeldOnFold(true);
  }

  // Unfolded on the detail screen → it popped back here with its id.
  const handedBack = route?.params?.[TWO_PANE_SELECT_PARAM] as string | undefined;
  const handedBackAt = route?.params?.[TWO_PANE_SELECT_AT_PARAM] as number | undefined;
  useEffect(() => {
    if (handedBack) {
      setSelectedId(handedBack);
      setHeldOnFold(false);
    }
  }, [handedBack, handedBackAt]);

  const narrowDetail = !isWide && heldOnFold && !!selectedId;

  return {
    selectedId,
    setSelectedId,
    open,
    close,
    isWide,
    /** Spread onto <TwoPane>. */
    paneProps: { narrowDetail, onCloseDetail: close },
  };
}

interface ReturnOptions {
  navigation: {
    isFocused: () => boolean;
    getState: () => { routes: { name: string }[]; index: number } | undefined;
    popTo: (name: string, params?: any, options?: { merge?: boolean }) => void;
  };
  /** The list screen this detail was pushed from. */
  listRoute: string;
  /** The open item's id. */
  id: string | undefined;
  /** True when rendered inside the right panel (never pops then). */
  embedded?: boolean;
}

/**
 * On a detail screen: when the phone unfolds and the screen right below this
 * one is its list, go back to the list with this item open on the right.
 * (That swaps to a fresh copy of the detail, so callers should skip it while
 * something unsaved is open — pass id undefined then.)
 */
export function useReturnToTwoPane({ navigation, listRoute, id, embedded }: ReturnOptions) {
  const { isWide } = useLayout();
  const wasWide = useRef(isWide);
  useEffect(() => {
    const unfolded = !wasWide.current && isWide;
    wasWide.current = isWide;
    if (!unfolded || embedded || !id || !navigation.isFocused()) return;
    const state = navigation.getState();
    const below = state?.routes?.[state.index - 1];
    if (below?.name === listRoute) {
      navigation.popTo(listRoute, { [TWO_PANE_SELECT_PARAM]: id, [TWO_PANE_SELECT_AT_PARAM]: Date.now() }, { merge: true });
    }
  }, [isWide, embedded, id, listRoute, navigation]);
}
