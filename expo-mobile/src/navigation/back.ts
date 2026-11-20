// Back navigation helpers shared by the stack headers (AppNavigator) and the
// screens that draw their own header (Timesheets, My Calendar, Tasks...).
//
// The problem these solve: a screen opened across stacks — from the More
// panel, a dashboard card or a notification tap — is often the ONLY route in
// its stack, so the native header draws no back button and a custom header's
// goBack() has nowhere local to go. With the tab navigator on
// backBehavior="history", goBack() from a stack's first route falls through to
// the tab you came from. If even that history is empty (a cold start straight
// into a screen), we fall back to the home tab rather than doing nothing.

// Loose on purpose: stack, tab and container navigation objects all qualify.
type Nav = any;

/** goBack(), or the home tab when there is nothing to go back to. */
export function goBackOrHome(navigation: Nav) {
  if (navigation.canGoBack()) {
    navigation.goBack();
    return;
  }
  // Walk up to the navigator that owns the 'Workspace' tab.
  let nav: any = navigation;
  while (nav) {
    const state = nav.getState?.();
    if (state?.routeNames?.includes('Workspace')) {
      nav.navigate('Workspace');
      return;
    }
    nav = nav.getParent?.();
  }
}

/**
 * True when this screen sits in a stack (so it should offer a back control),
 * false when it is mounted directly as a tab (the Calendar tab, which is the
 * same component as More > My Calendar).
 */
export function isInStack(navigation: { getState: () => any }): boolean {
  return navigation.getState?.()?.type === 'stack';
}

/** True when this route is the first (bottom) route of its stack. */
export function isFirstRoute(navigation: { getState: () => any }, routeKey: string): boolean {
  return navigation.getState?.()?.routes?.[0]?.key === routeKey;
}
