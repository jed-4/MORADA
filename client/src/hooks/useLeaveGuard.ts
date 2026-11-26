import { useEffect, useRef } from "react";

/**
 * Ask before the user leaves this page — for in-app navigation, not just tab
 * close.
 *
 * wouter has no navigation blocker, and every other guard in the app
 * (useDirtyForm, VariationDetail) only covers tab close via `beforeunload`,
 * which can't show our own dialog. This one intercepts the three ways out:
 *
 *  - in-app navigation: every wouter `navigate`/<Link> goes through
 *    history.pushState / replaceState (wouter patches them to emit events), so
 *    while active we wrap them and hold any call that changes the path;
 *  - browser Back: a duplicate "sentinel" history entry is pushed, so Back
 *    lands on the same URL (wouter sees no change) and we get the popstate;
 *  - tab close / reload: `beforeunload`, which shows the browser's own prompt.
 *
 * `onAttempt(proceed)` is called with a function that completes the
 * navigation; call it (e.g. from a dialog button) to leave, or ignore it to stay.
 */
export function useLeaveGuard(active: boolean, onAttempt: (proceed: () => void) => void) {
  const onAttemptRef = useRef(onAttempt);
  onAttemptRef.current = onAttempt;

  useEffect(() => {
    if (!active || typeof window === "undefined") return;

    const SENTINEL = "__moradaLeaveGuard";
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    let bypass = false;

    const pathOf = (url: string | URL | null | undefined): string | null => {
      if (url == null) return null;
      try {
        return new URL(String(url), window.location.href).pathname;
      } catch {
        return null;
      }
    };
    const leavesPage = (url: string | URL | null | undefined) => {
      const p = pathOf(url);
      return p !== null && p !== window.location.pathname;
    };
    const onSentinel = () => !!(history.state && (history.state as any)[SENTINEL]);

    const wrap = (orig: typeof history.pushState, kind: "push" | "replace") =>
      function (this: History, state: any, title: string, url?: string | URL | null) {
        if (bypass || !leavesPage(url)) return orig.call(this, state, title, url);
        onAttemptRef.current(() => {
          bypass = true;
          try {
            // Leaving from the sentinel: replace it, so the history stack
            // doesn't keep a duplicate entry for this page.
            if (kind === "push" && onSentinel()) origReplace.call(history, state, title, url);
            else orig.call(history, state, title, url);
          } finally {
            bypass = false;
          }
        });
      };

    history.pushState = wrap(origPush, "push") as typeof history.pushState;
    history.replaceState = wrap(origReplace, "replace") as typeof history.replaceState;

    // Sentinel entry so Back stays on this URL and we can ask first.
    if (!onSentinel()) origPush.call(history, { ...(history.state ?? {}), [SENTINEL]: true }, "", window.location.href);

    const onPop = () => {
      if (bypass) {
        // our own history.go(-2) after "leave"
        bypass = false;
        return;
      }
      if (onSentinel()) return; // Forward onto our own sentinel
      // Back was pressed: we're on the original entry. Restore the sentinel
      // (so a second Back is caught too) and ask.
      origPush.call(history, { ...(history.state ?? {}), [SENTINEL]: true }, "", window.location.href);
      onAttemptRef.current(() => {
        bypass = true;
        // -2: past the sentinel we just restored and the page's own entry.
        history.go(-2);
      });
    };
    window.addEventListener("popstate", onPop);

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      history.pushState = origPush;
      history.replaceState = origReplace;
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("beforeunload", onBeforeUnload);
      // Guard switched off while still on the page (e.g. just finalised):
      // un-mark the sentinel. The entry itself can't be removed synchronously
      // (history.back() is async and would race a re-armed guard), so at worst
      // one Back press lands on the same URL, which wouter treats as a no-op.
      if (onSentinel()) {
        const { [SENTINEL]: _drop, ...rest } = history.state as any;
        origReplace.call(history, rest, "", window.location.href);
      }
    };
  }, [active]);
}
