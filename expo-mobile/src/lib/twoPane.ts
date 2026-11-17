import { useCallback, useEffect, useRef, useState } from 'react';
import { useLayout } from './useLayout';

/**
 * Selection for a list + detail screen (see components/ui/TwoPane).
 *
 *   Phone / Duo folded  → tapping a row pushes the detail screen, as before.
 *   Duo unfolded        → tapping a row opens it in the right panel.
 *
 * Keeping your place when the phone changes shape:
 *   - Fold while an item is open on the right → its detail screen is pushed,
 *     so the outer screen shows the same item, not the list.
 *   - Unfold while on a pushed detail screen → useReturnToTwoPane (below) pops
 *     back to the list and opens that item on the right.
 */

/** Route param the detail screen sends back to the list on unfold. */
export const TWO_PANE_SELECT_PARAM = 'twoPaneSelect';

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

  // Keep the latest callbacks without re-running the fold effect for them.
  const paramsRef = useRef(paramsFor);
  paramsRef.current = paramsFor;

  const open = useCallback(
    (id: string) => {
      setSelectedId(id);
      if (!isWide) navigation.navigate(detailRoute, paramsRef.current(id));
    },
    [isWide, navigation, detailRoute],
  );

  // Folded with something open on the right → push it so you stay on it.
  const wasWide = useRef(isWide);
  useEffect(() => {
    if (wasWide.current && !isWide && selectedId && navigation.isFocused()) {
      navigation.navigate(detailRoute, paramsRef.current(selectedId));
    }
    wasWide.current = isWide;
  }, [isWide, selectedId, navigation, detailRoute]);

  // Unfolded on the detail screen → it popped back here with its id.
  const handedBack = route?.params?.[TWO_PANE_SELECT_PARAM] as string | undefined;
  useEffect(() => {
    if (handedBack) setSelectedId(handedBack);
  }, [handedBack]);

  return { selectedId, setSelectedId, open, isWide };
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
      navigation.popTo(listRoute, { [TWO_PANE_SELECT_PARAM]: id }, { merge: true });
    }
  }, [isWide, embedded, id, listRoute, navigation]);
}
