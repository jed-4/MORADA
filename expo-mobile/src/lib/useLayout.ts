import { useWindowDimensions } from 'react-native';

/**
 * The one place screens ask "how much room do I have?".
 *
 * Why this exists: a foldable (iPhone Duo) changes the app's size WHILE it is
 * running — fold/unfold, and the inner screen is roughly twice as wide as the
 * outer. `Dimensions.get('window')` read at module load (or once per render
 * without subscribing) freezes the size it saw first, so layouts sized from it
 * stay wrong after the change. `useWindowDimensions` re-renders on every
 * change, so anything derived from this hook follows the screen.
 *
 * Never read `Dimensions.get` for layout; read this.
 */

/**
 * Width (in points) at which a screen switches to its wide layout. The
 * revamp spec (BUILD-SPEC §5, GOTCHAS #16): width ≥ 700 AND landscape
 * (width > height). A phone, the Duo folded, or the Duo held upright stay on
 * the phone layouts; turn it sideways for the two-pane layouts.
 */
export const WIDE_BREAKPOINT = 700;

/**
 * Short side (in points) at which the screen counts as "big" for rotation —
 * the Duo unfolded. Below it the app stays locked to portrait. Separate from
 * WIDE_BREAKPOINT: a big screen must be free to rotate to reach landscape.
 */
export const BIG_SCREEN_SHORT_SIDE = 600;

export interface Layout {
  width: number;
  height: number;
  /** True when wide and landscape (the Duo unfolded, sideways). Phones are always false. */
  isWide: boolean;
}

export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  return { width, height, isWide: width >= WIDE_BREAKPOINT && width > height };
}
